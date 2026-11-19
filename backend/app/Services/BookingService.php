<?php
namespace App\Services;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\RatePlan;
use App\Models\Room;
use App\Models\RoomType;
use App\Models\Stay;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Vòng đời đặt phòng: Giữ chỗ → Xác nhận → Đã nhận phòng → Đã trả phòng; nhánh Hủy, Không đến.
 * Trạng thái được lưu ở từng lượt ở (stay); trạng thái đặt phòng là tổng hợp của các lượt ở.
 */
class BookingService
{
    public function __construct(
        private AvailabilityService $availability,
        private PricingService $pricing,
        private FolioService $folios,
        private NotificationService $notifications,
    ) {}

    public const LABELS = [
        'hold' => 'Giữ chỗ', 'confirmed' => 'Xác nhận', 'checked_in' => 'Đã nhận phòng',
        'checked_out' => 'Đã trả phòng', 'cancelled' => 'Đã hủy', 'no_show' => 'Không đến',
    ];

    /**
     * @param array $data customer|customer_id, source, status (hold|confirmed), stays[], rate_plan_id?, ...
     */
    public function create(array $data): Booking
    {
        $this->availability->releaseExpiredHolds();
        $propertyId = Context::propertyId();
        $settings = Settings::get('booking', $propertyId);
        $stays = $data['stays'] ?? [];
        abort_if(!$stays, 422, 'Cần ít nhất một phòng.');
        abort_if(count($stays) > $settings['max_rooms_per_booking'], 422, 'Vượt số phòng tối đa cho một đặt phòng.');

        if (!empty($data['request_key'])) {
            $existing = Booking::where('request_key', $data['request_key'])->first();
            if ($existing) {
                abort_unless(hash_equals((string) $existing->request_hash, (string) ($data['request_hash'] ?? '')), 409,
                    'Mã yêu cầu đã được dùng cho một đặt phòng khác.');
                return $existing;
            }
        }

        $plan = !empty($data['rate_plan_id'])
            ? RatePlan::where('property_id', $propertyId)->where('active', true)->findOrFail($data['rate_plan_id'])
            : RatePlan::where('property_id', $propertyId)->where('active', true)->orderBy('sort')->first();
        $today = Context::today()->toDateString();

        foreach ($stays as $i => $s) {
            abort_if($s['check_in'] < $today, 422, 'Ngày nhận phòng không được trước ngày vận hành.');
            abort_if($s['check_out'] <= $s['check_in'], 422, 'Ngày trả phòng phải sau ngày nhận phòng.');
            $nights = CarbonImmutable::parse($s['check_in'])->diffInDays(CarbonImmutable::parse($s['check_out']));
            abort_if($nights > $settings['max_nights'], 422, "Mỗi lượt ở tối đa {$settings['max_nights']} đêm.");
        }

        $status = ($data['status'] ?? 'hold') === 'confirmed' ? 'confirmed' : 'hold';

        try {
            $booking = DB::transaction(function () use ($data, $stays, $plan, $propertyId, $settings, $status) {
                $customer = $this->resolveCustomer($data);
                $holdMinutes = (int) ($data['hold_minutes'] ?? ($data['source'] === 'website' ? $settings['hold_minutes_website'] : $settings['hold_minutes_staff']));
                $policy = $plan?->policy;
                $booking = Booking::create([
                    'property_id' => $propertyId,
                    // Mã theo SĐT khách nhập cho chính lần đặt này (nếu có), không theo SĐT cũ trong hồ sơ
                    'code' => self::newCode(self::phoneCode($data['customer']['phone'] ?? null) ? $data['customer']['phone'] : $customer->phone),
                    'request_key' => $data['request_key'] ?? null,
                    'request_hash' => $data['request_hash'] ?? null,
                    'status' => $status,
                    'source' => $data['source'],
                    'source_ref' => $data['source_ref'] ?? null,
                    'customer_id' => $customer->id,
                    'bill_to_id' => $data['bill_to_id'] ?? null,
                    'rate_plan_id' => $plan?->id,
                    'group_name' => $data['group_name'] ?? null,
                    'hold_expires_at' => $status === 'hold' ? now()->addMinutes(max(5, $holdMinutes)) : null,
                    'deposit_percent' => $plan?->deposit_percent ?? 0,
                    'special_requests' => $data['special_requests'] ?? null,
                    'internal_notes' => $data['internal_notes'] ?? null,
                    'policy_snapshot' => [
                        'rate_plan' => $plan?->name,
                        'deposit_percent' => $plan?->deposit_percent ?? 0,
                        'free_cancel_hours' => $policy?->free_cancel_hours,
                        'late_cancel_fee_percent' => $policy?->late_cancel_fee_percent,
                        'no_show_fee_percent' => $policy?->no_show_fee_percent,
                        'refundable' => $policy?->refundable,
                        'description' => $policy?->description,
                    ],
                    'created_by' => auth()->id(),
                ]);
                $folio = $this->folios->mainFolio($booking);
                $total = 0;
                foreach ($stays as $s) {
                    $total += $this->addStay($booking, $folio->id, $s, $plan, $status)['total'];
                }
                abort_if(isset($data['expected_total']) && (int) $data['expected_total'] !== $total, 409,
                    'Giá phòng vừa thay đổi. Vui lòng xem lại tổng tiền mới.');
                $booking->update(['deposit_required' => $this->pricing->deposit($total, $booking->deposit_percent, (int) $settings['rounding'])]);
                Audit::log('booking.create', $booking, "Tạo đặt phòng {$booking->code} (".count($stays).' phòng, '.self::LABELS[$status].')', null,
                    ['source' => $booking->source, 'total' => $total]);
                return $booking;
            });
        } catch (HttpException $e) {
            // Hai yêu cầu cùng request_key gửi đồng thời: trả về đơn đã tạo
            if (!empty($data['request_key']) && ($existing = Booking::where('request_key', $data['request_key'])->first())) {
                return $existing;
            }
            throw $e;
        }

        $this->notifications->bookingConfirmation($booking);
        return $booking->refresh();
    }

    /** Thêm một lượt ở: kiểm tra sức chứa, phân phòng, giữ tồn, chụp giá từng đêm. */
    public function addStay(Booking $booking, int $folioId, array $s, ?RatePlan $plan, string $status): array
    {
        $type = RoomType::where('property_id', $booking->property_id)->where('active', true)->findOrFail($s['room_type_id']);
        $adults = (int) $s['adults'];
        $children = (int) ($s['children'] ?? 0);
        $extraBeds = (int) ($s['extra_beds'] ?? 0);
        abort_if($adults < 1, 422, 'Cần ít nhất 1 người lớn mỗi phòng.');
        abort_if($adults > $type->max_adults || $children > $type->max_children || $adults + $children > $type->max_occupancy,
            422, "{$type->name} tối đa {$type->max_adults} người lớn, {$type->max_children} trẻ em, tổng {$type->max_occupancy} khách.");
        abort_if($extraBeds > $type->max_extra_beds, 422, "{$type->name} không hỗ trợ số giường phụ này.");

        $nights = AvailabilityService::nights($s['check_in'], $s['check_out']);
        $stay = Stay::create([
            'booking_id' => $booking->id, 'room_type_id' => $type->id, 'rate_plan_id' => $plan?->id, 'status' => $status,
            'check_in' => $s['check_in'], 'check_out' => $s['check_out'], 'adults' => $adults, 'children' => $children, 'extra_beds' => $extraBeds,
        ]);

        if (!empty($s['room_id'])) {
            $room = Room::sellable()->where('room_type_id', $type->id)->findOrFail($s['room_id']);
            $this->availability->reserve($room->id, $nights, $stay->id);
            $stay->update(['room_id' => $room->id, 'room_locked' => true]);
        } else {
            $assigned = false;
            foreach ($this->availability->freeRooms($type->id, $s['check_in'], $s['check_out']) as $candidate) {
                try {
                    $this->availability->reserve($candidate->id, $nights, $stay->id);
                    $stay->update(['room_id' => $candidate->id, 'room_locked' => false]);
                    $assigned = true;
                    break;
                } catch (HttpException) {
                    continue; // phòng vừa bị giữ bởi giao dịch khác, thử phòng kế tiếp
                }
            }
            abort_unless($assigned, 409, "{$type->name} không còn phòng trống từ ".date('d/m', strtotime($s['check_in'])).' đến '.date('d/m', strtotime($s['check_out'])).'.');
        }

        $quote = $this->pricing->quote($type, $plan, $s['check_in'], $s['check_out'], $adults, $children, $extraBeds);
        foreach ($quote['nights'] as $n) {
            $stay->nights()->create([
                'folio_id' => $folioId, 'night' => $n['night'], 'room_rate' => $n['room_rate'], 'extra_charge' => $n['extra_charge'],
                'amount' => $n['amount'], 'rate_label' => $n['label'], 'rate_rule_id' => $n['rule_id'],
            ]);
        }
        if (!empty($s['guest_ids'])) {
            foreach (array_values($s['guest_ids']) as $i => $guestId) {
                $stay->guests()->attach($guestId, ['is_primary' => $i === 0]);
            }
        } else {
            $stay->guests()->attach($booking->customer_id, ['is_primary' => true]);
        }
        return ['stay' => $stay, 'total' => $quote['total']];
    }

    public function resolveCustomer(array $data): Customer
    {
        if (!empty($data['customer_id'])) {
            return Customer::findOrFail($data['customer_id']);
        }
        $c = $data['customer'] ?? [];
        abort_if(empty($c['full_name']), 422, 'Cần tên khách hàng.');
        $phone = isset($c['phone']) ? preg_replace('/[^0-9+]/', '', $c['phone']) : null;
        $email = isset($c['email']) ? strtolower(trim($c['email'])) : null;
        // Kiểm soát trùng. Số điện thoại là định danh chính (mã đặt phòng = SĐT), nên:
        // 1) ưu tiên hồ sơ cùng số điện thoại (so cả dạng 0xxx và +84xxx);
        // 2) hồ sơ chỉ trùng email chỉ được dùng lại khi hồ sơ đó chưa có SĐT (bổ sung SĐT) hoặc khách không nhập SĐT.
        //    Nếu hồ sơ đã có SĐT khác thì tạo hồ sơ mới — không được làm mất số khách vừa nhập.
        $guests = fn () => Customer::whereNull('merged_into_id')->where('kind', 'guest');
        if ($phone) {
            $norm = self::phoneCode($phone);
            $variants = array_values(array_unique(array_filter([$phone, $norm, $norm ? '+84'.substr($norm, 1) : null])));
            if ($byPhone = $guests()->whereIn('phone', $variants)->orderBy('id')->first()) {
                return $byPhone;
            }
        }
        if ($email && ($byEmail = $guests()->where('email', $email)->orderBy('id')->first())) {
            if (!$phone) return $byEmail;
            if (!$byEmail->phone) {
                $byEmail->update(['phone' => $phone]);
                return $byEmail;
            }
        }
        return Customer::create([
            'kind' => 'guest', 'full_name' => trim($c['full_name']), 'phone' => $phone, 'email' => $email,
            'nationality' => $c['nationality'] ?? null, 'company_id' => $c['company_id'] ?? null,
        ]);
    }

    /**
     * Mã đặt phòng = số điện thoại khách (chuẩn hóa 0xxxxxxxxx). Mã là duy nhất vĩnh viễn (lịch sử giữ lại),
     * nên lần đặt sau của cùng số điện thoại thêm một chữ cái: 0912345678, 0912345678B, 0912345678C…
     * Không có số điện thoại hợp lệ (VD đoàn công ty) thì dùng mã GLGxxxxxx.
     */
    public static function phoneCode(?string $phone): ?string
    {
        $digits = preg_replace('/\D/', '', (string) $phone);
        if (str_starts_with($digits, '84') && strlen($digits) >= 11) $digits = '0'.substr($digits, 2);
        return preg_match('/^0\d{8,10}$/', $digits) ? $digits : null;
    }

    public static function newCode(?string $phone = null): string
    {
        if ($base = self::phoneCode($phone)) {
            foreach (array_merge([''], range('B', 'Z')) as $suffix) {
                if (!Booking::where('code', $base.$suffix)->exists()) return $base.$suffix;
            }
        }
        do {
            $code = 'GLG'.substr(str_shuffle(str_repeat('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 2)), 0, 6);
        } while (Booking::where('code', $code)->exists());
        return $code;
    }

    public function confirm(Booking $booking, ?string $note = null): Booking
    {
        return DB::transaction(function () use ($booking, $note) {
            $booking = Booking::whereKey($booking->id)->lockForUpdate()->firstOrFail();
            if ($booking->status === 'confirmed') return $booking;
            abort_unless($booking->status === 'hold', 409, 'Chỉ xác nhận được đặt phòng đang giữ chỗ.');
            $booking->stays()->where('status', 'hold')->update(['status' => 'confirmed']);
            $booking->update(['status' => 'confirmed', 'hold_expires_at' => null]);
            Audit::log('booking.confirm', $booking, "Xác nhận đặt phòng {$booking->code}", $note);
            return $booking;
        });
    }

    public function extendHold(Booking $booking, int $minutes, string $reason): Booking
    {
        abort_unless($booking->status === 'hold', 409, 'Đặt phòng không ở trạng thái giữ chỗ.');
        abort_if($booking->hold_expires_at?->isPast(), 409, 'Giữ chỗ đã hết hạn.');
        $booking->update(['hold_expires_at' => $booking->hold_expires_at->addMinutes($minutes)]);
        Audit::log('booking.extend_hold', $booking, "Gia hạn giữ chỗ thêm $minutes phút", $reason);
        return $booking;
    }

    /** Phí hủy đề xuất theo chính sách đã chụp lúc đặt. */
    public function cancellationQuote(Booking $booking, string $mode = 'cancel'): array
    {
        $snap = $booking->policy_snapshot ?? [];
        $first = $booking->stays()->whereIn('status', ['hold', 'confirmed'])->orderBy('check_in')->first();
        if (!$first) return ['late' => false, 'fee' => 0, 'explain' => 'Không có lượt ở có thể hủy.'];
        $checkInAt = CarbonImmutable::parse($first->check_in->toDateString().' '.Context::property()->check_in_time, Context::property()->timezone);
        $hoursLeft = now()->diffInHours($checkInAt, false);
        $late = $mode === 'no_show' || $snap['free_cancel_hours'] === null || $hoursLeft < (int) $snap['free_cancel_hours'];
        $percent = (int) ($mode === 'no_show' ? ($snap['no_show_fee_percent'] ?? 0) : ($snap['late_cancel_fee_percent'] ?? 0));
        $firstNights = (int) DB::table('stay_nights')->join('stays', 'stays.id', '=', 'stay_nights.stay_id')
            ->where('stays.booking_id', $booking->id)->whereIn('stays.status', ['hold', 'confirmed'])
            ->whereColumn('stay_nights.night', 'stays.check_in')->where('stay_nights.void', false)->sum('stay_nights.amount');
        $fee = $late && $snap['free_cancel_hours'] !== null ? intdiv($firstNights * $percent, 100) : 0;
        $explain = $snap['free_cancel_hours'] === null
            ? 'Kế hoạch giá không có chính sách hủy; phí hủy do người có quyền quyết định.'
            : ($late ? "Trong vòng {$snap['free_cancel_hours']} giờ trước giờ nhận phòng: phí $percent% đêm đầu." : 'Hủy miễn phí theo chính sách.');
        return ['late' => $late, 'fee' => $fee, 'explain' => $explain, 'policy' => $snap];
    }

    public function cancel(Booking $booking, string $reason, ?array $stayIds = null, bool $chargeFee = false, string $mode = 'cancel'): Booking
    {
        return DB::transaction(function () use ($booking, $reason, $stayIds, $chargeFee, $mode) {
            $booking = Booking::whereKey($booking->id)->lockForUpdate()->firstOrFail();
            $quote = $chargeFee ? $this->cancellationQuote($booking, $mode) : ['fee' => 0];
            $allowed = $mode === 'no_show' ? ['confirmed', 'hold'] : ['hold', 'confirmed'];
            $stays = $booking->stays()->whereIn('status', $allowed)->when($stayIds, fn ($q) => $q->whereIn('id', $stayIds))->get();
            abort_if($stays->isEmpty(), 409, $mode === 'no_show' ? 'Không có lượt ở chờ nhận phòng để đánh dấu không đến.' : 'Không có lượt ở có thể hủy (đã nhận phòng hoặc đã kết thúc).');
            if ($mode === 'no_show') {
                abort_if($stays->contains(fn ($s) => $s->check_in->toDateString() > Context::today()->toDateString()), 409,
                    'Chỉ đánh dấu không đến từ ngày nhận phòng trở đi.');
            }
            $newStatus = $mode === 'no_show' ? 'no_show' : 'cancelled';
            foreach ($stays as $stay) {
                $this->availability->release($stay->id);
                $stay->nights()->update(['void' => true, 'void_reason' => $mode === 'no_show' ? 'Không đến' : 'Hủy đặt phòng']);
                $stay->update(['status' => $newStatus]);
            }
            if ($chargeFee && $quote['fee'] > 0) {
                $this->folios->postLine($this->folios->mainFolio($booking), 'fee',
                    $mode === 'no_show' ? 'Phí không đến (no-show)' : 'Phí hủy đặt phòng', $quote['fee'], $reason);
            }
            $this->recomputeStatus($booking);
            if (in_array($booking->status, ['cancelled', 'no_show'], true)) {
                $booking->update(['cancelled_at' => now(), 'cancel_reason' => $reason, 'hold_expires_at' => null]);
            }
            Audit::log($mode === 'no_show' ? 'booking.no_show' : 'booking.cancel', $booking,
                ($mode === 'no_show' ? 'Không đến: ' : 'Hủy: ').$booking->code.' ('.$stays->count().' phòng)', $reason,
                ['stays' => $stays->pluck('id'), 'fee' => $quote['fee']]);
            return $booking->refresh();
        });
    }

    public function recomputeStatus(Booking $booking): void
    {
        $statuses = $booking->stays()->pluck('status')->all();
        $status = match (true) {
            in_array('checked_in', $statuses, true) => 'checked_in',
            in_array('hold', $statuses, true) => 'hold',
            in_array('confirmed', $statuses, true) => 'confirmed',
            in_array('checked_out', $statuses, true) => 'checked_out',
            in_array('no_show', $statuses, true) => 'no_show',
            default => 'cancelled',
        };
        if ($booking->status !== $status) {
            $booking->update(['status' => $status]);
        }
    }

    /** Phân/đổi phòng cụ thể cho lượt ở chưa nhận phòng, cùng loại phòng. */
    public function assignRoom(Stay $stay, int $roomId, ?string $reason): Stay
    {
        return DB::transaction(function () use ($stay, $roomId, $reason) {
            $stay = Stay::whereKey($stay->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($stay->status, ['hold', 'confirmed'], true), 409, 'Dùng chức năng chuyển phòng cho khách đang ở.');
            $room = Room::sellable()->findOrFail($roomId);
            abort_unless($room->room_type_id === $stay->room_type_id, 422, 'Phòng khác loại: dùng chức năng đổi loại phòng.');
            if ($stay->room_id === $room->id) return $stay;
            $old = $stay->room?->number;
            $this->availability->release($stay->id);
            $this->availability->reserve($room->id, AvailabilityService::nights($stay->check_in->toDateString(), $stay->check_out->toDateString()), $stay->id);
            $stay->update(['room_id' => $room->id, 'room_locked' => true]);
            Audit::log('stay.assign_room', $stay->booking, "Phân phòng {$room->number}".($old ? " (trước đó $old)" : ''), $reason);
            return $stay;
        });
    }
}
