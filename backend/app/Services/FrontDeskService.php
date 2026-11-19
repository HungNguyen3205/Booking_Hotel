<?php
namespace App\Services;

use App\Models\Booking;
use App\Models\Room;
use App\Models\RoomType;
use App\Models\Stay;
use App\Models\StayNight;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** Nghiệp vụ lễ tân: nhận phòng, trả phòng, gia hạn/đổi ngày, chuyển phòng/đổi loại phòng. */
class FrontDeskService
{
    public function __construct(
        private AvailabilityService $availability,
        private PricingService $pricing,
        private FolioService $folios,
        private BookingService $bookings,
        private HousekeepingService $housekeeping,
    ) {}

    public function checkIn(Stay $stay, array $data): Stay
    {
        return DB::transaction(function () use ($stay, $data) {
            $stay = Stay::whereKey($stay->id)->lockForUpdate()->firstOrFail();
            $today = Context::today()->toDateString();
            abort_if($stay->status === 'hold', 409, 'Đặt phòng đang giữ chỗ. Xác nhận đặt phòng trước khi nhận phòng.');
            abort_unless($stay->status === 'confirmed', 409, 'Lượt ở không ở trạng thái chờ nhận phòng.');
            abort_if($stay->check_in->toDateString() > $today, 409, 'Chưa đến ngày nhận phòng. Đổi ngày lưu trú nếu khách đến sớm.');
            abort_if($stay->check_out->toDateString() <= $today, 409, 'Đã qua thời gian lưu trú của đặt phòng.');
            abort_unless($stay->room_id, 409, 'Chưa phân phòng cụ thể.');
            $room = Room::whereKey($stay->room_id)->lockForUpdate()->firstOrFail();
            $occupied = Stay::where('room_id', $room->id)->where('status', 'checked_in')->where('id', '!=', $stay->id)->exists();
            abort_if($occupied, 409, "Phòng {$room->number} vẫn còn khách chưa trả phòng.");

            $override = null;
            if ($room->housekeeping !== 'clean') {
                abort_unless(auth()->user()?->hasPermission('frontdesk.override_dirty'), 403,
                    "Phòng {$room->number} chưa sẵn sàng (".HousekeepingService::LABELS[$room->housekeeping].'). Cần người có quyền ngoại lệ.');
                $override = trim((string) ($data['override_reason'] ?? ''));
                abort_if($override === '', 422, 'Nhập lý do nhận phòng khi phòng chưa sẵn sàng.');
            }

            if (!empty($data['guest_ids'])) {
                $sync = [];
                foreach (array_values($data['guest_ids']) as $i => $id) $sync[$id] = ['is_primary' => $i === 0];
                $stay->guests()->sync($sync);
            }
            $stay->update(['status' => 'checked_in', 'checked_in_at' => now(), 'checked_in_by' => auth()->id(),
                'room_locked' => true, 'dirty_override_reason' => $override]);
            $booking = $stay->booking;
            if (!empty($data['early_fee'])) {
                $fee = (int) Settings::value('surcharges', 'early_check_in');
                abort_if($fee <= 0, 422, 'Chưa cấu hình mức phụ thu nhận phòng sớm.');
                $this->folios->postLine($this->folios->mainFolio($booking), 'surcharge', "Phụ thu nhận phòng sớm — phòng {$room->number}", $fee, null, $stay);
            }
            $this->bookings->recomputeStatus($booking);
            Audit::log('stay.check_in', $booking, "Nhận phòng {$room->number} — {$booking->code}", $override,
                $override ? ['housekeeping' => $room->housekeeping, 'override' => true] : []);
            return $stay->refresh();
        });
    }

    /**
     * Xem trước quyết toán trả phòng: các đêm chưa ở bị hủy khi trả sớm, phụ thu trả muộn,
     * và số còn phải thu SAU điều chỉnh — dùng cùng công thức với checkOut() để lễ tân thu đúng số.
     */
    public function checkoutQuote(Stay $stay, bool $lateFee = false): array
    {
        abort_unless($stay->status === 'checked_in', 409, 'Lượt ở chưa nhận phòng hoặc đã trả phòng.');
        $today = Context::today();
        $voidFrom = max($today->toDateString(), $stay->check_in->copy()->addDay()->toDateString());
        $voidNights = $voidFrom < $stay->check_out->toDateString()
            ? StayNight::where('stay_id', $stay->id)->where('night', '>=', $voidFrom)->where('void', false)->get(['night', 'amount']) : collect();
        $fee = $lateFee ? (int) Settings::value('surcharges', 'late_check_out') : 0;
        $booking = Booking::with('folios')->findOrFail($stay->booking_id);
        $balance = $this->folios->bookingTotals($booking)['balance'];
        $voided = (int) $voidNights->sum('amount');
        return [
            'overdue' => $stay->check_out->lt($today),
            'early' => $voidNights->isNotEmpty(),
            'new_check_out' => $voidNights->isNotEmpty() ? $voidFrom : $stay->check_out->toDateString(),
            'void_nights' => $voidNights->pluck('night')->map(fn ($n) => $n->toDateString())->values(),
            'voided_amount' => $voided,
            'late_fee' => $fee,
            'balance_before' => $balance,
            'balance_after' => $balance - $voided + $fee,
            'others_in_house' => Stay::where('booking_id', $stay->booking_id)->where('id', '!=', $stay->id)->where('status', 'checked_in')->exists(),
        ];
    }

    public function checkOut(Stay $stay, array $data): Stay
    {
        return DB::transaction(function () use ($stay, $data) {
            $stay = Stay::whereKey($stay->id)->lockForUpdate()->firstOrFail();
            $booking = Booking::whereKey($stay->booking_id)->lockForUpdate()->firstOrFail();
            abort_unless($stay->status === 'checked_in', 409, 'Lượt ở chưa nhận phòng hoặc đã trả phòng.');
            $today = Context::today();
            abort_if($stay->check_out->lt($today), 409, 'Khách đã ở quá ngày trả phòng. Gia hạn thêm đêm trước khi trả phòng.');

            // Trả sớm: hủy các đêm chưa ở (đêm nhận phòng luôn được tính)
            $voidFrom = max($today->toDateString(), $stay->check_in->copy()->addDay()->toDateString());
            if ($voidFrom < $stay->check_out->toDateString()) {
                StayNight::where('stay_id', $stay->id)->where('night', '>=', $voidFrom)->where('void', false)
                    ->update(['void' => true, 'void_reason' => 'Trả phòng sớm']);
                $this->availability->release($stay->id, $voidFrom);
                $stay->check_out = $voidFrom;
            }
            if (!empty($data['late_fee'])) {
                $fee = (int) Settings::value('surcharges', 'late_check_out');
                abort_if($fee <= 0, 422, 'Chưa cấu hình mức phụ thu trả phòng muộn.');
                $this->folios->postLine($this->folios->mainFolio($booking), 'surcharge', "Phụ thu trả phòng muộn — phòng {$stay->room->number}", $fee, null, $stay);
            }

            $othersInHouse = Stay::where('booking_id', $booking->id)->where('id', '!=', $stay->id)->where('status', 'checked_in')->exists();
            $balance = $this->folios->bookingTotals($booking->load('folios'))['balance'];
            $debtReason = null;
            if (!$othersInHouse && $balance > 0) {
                abort_unless(!empty($data['settle_later']), 409,
                    'Còn phải thu '.number_format($balance, 0, ',', '.').'đ. Thu đủ trước khi trả phòng hoặc chọn ghi công nợ.');
                abort_unless(auth()->user()?->hasPermission('frontdesk.debt_checkout') || $booking->bill_to_id, 403,
                    'Không có quyền trả phòng khi còn nợ (trừ đặt phòng do công ty/đại lý chịu công nợ).');
                $debtReason = trim((string) ($data['reason'] ?? ''));
                abort_if($debtReason === '', 422, 'Nhập lý do ghi công nợ.');
            }
            if (isset($data['expected_balance']) && (int) $data['expected_balance'] !== $balance) {
                abort(409, 'Số còn phải thu đã thay đổi ('.number_format($balance, 0, ',', '.').'đ). Vui lòng kiểm tra lại trước khi trả phòng.');
            }

            $stay->status = 'checked_out';
            $stay->checked_out_at = now();
            $stay->checked_out_by = auth()->id();
            $stay->save();
            $room = $stay->room;
            $this->housekeeping->markDirty($room, $stay->id, 'departure', 'Sau khi khách trả phòng');
            $this->bookings->recomputeStatus($booking);
            if ($booking->refresh()->status === 'checked_out' && $balance === 0) {
                foreach ($booking->folios as $folio) {
                    if ($folio->status === 'open' && $this->folios->folioTotals($folio)['balance'] === 0) $this->folios->close($folio);
                }
            }
            Audit::log('stay.check_out', $booking, "Trả phòng {$room->number} — {$booking->code}".($debtReason ? ' (ghi công nợ '.number_format($balance, 0, ',', '.').'đ)' : ''),
                $debtReason, ['balance' => $balance]);
            return $stay->refresh();
        });
    }

    /**
     * Xem trước thay đổi ngày (gia hạn/rút ngắn/đổi ngày đến): kiểm tra tồn và tính tiền chênh lệch.
     * Đêm giữ nguyên giữ giá đã chụp; đêm mới tính theo bảng giá hiện hành.
     */
    public function quoteDates(Stay $stay, string $checkIn, string $checkOut): array
    {
        $today = Context::today()->toDateString();
        abort_unless(in_array($stay->status, ['hold', 'confirmed', 'checked_in'], true), 409, 'Lượt ở không thể đổi ngày.');
        abort_if($checkOut <= $checkIn, 422, 'Ngày trả phải sau ngày nhận.');
        if ($stay->status === 'checked_in') {
            abort_if($checkIn !== $stay->check_in->toDateString(), 422, 'Khách đang ở: chỉ đổi được ngày trả phòng.');
            abort_if($checkOut < $today || $checkOut <= $stay->check_in->toDateString(), 422, 'Ngày trả mới không hợp lệ.');
        } else {
            abort_if($checkIn < $today, 422, 'Ngày nhận mới không được trước ngày vận hành.');
        }
        $max = (int) Settings::value('booking', 'max_nights');
        abort_if(CarbonImmutable::parse($checkIn)->diffInDays(CarbonImmutable::parse($checkOut)) > $max, 422, "Tối đa $max đêm.");

        $old = AvailabilityService::nights($stay->check_in->toDateString(), $stay->check_out->toDateString());
        $new = AvailabilityService::nights($checkIn, $checkOut);
        $added = array_values(array_diff($new, $old));
        $removed = array_values(array_diff($old, $new));
        $conflicts = $added ? \DB::table('room_nights')->where('room_id', $stay->room_id)->whereIn('night', $added)
            ->where(fn ($q) => $q->whereNull('stay_id')->orWhere('stay_id', '!=', $stay->id))->pluck('night')->all() : [];

        $type = $stay->type;
        $addedNights = [];
        $delta = 0;
        if ($added) {
            $q = $this->pricing->quote($type, $stay->ratePlan, min($added), CarbonImmutable::parse(max($added))->addDay()->toDateString(),
                $stay->adults, $stay->children, $stay->extra_beds);
            foreach ($q['nights'] as $n) {
                if (in_array($n['night'], $added, true)) {
                    $addedNights[] = $n;
                    $delta += $n['amount'];
                }
            }
        }
        $removedAmount = (int) StayNight::where('stay_id', $stay->id)->where('void', false)->whereIn('night', $removed)->sum('amount');
        $delta -= $removedAmount;
        $alternatives = $conflicts
            ? $this->availability->freeRooms($stay->room_type_id, $checkIn, $checkOut)->map(fn ($r) => ['id' => $r->id, 'number' => $r->number])->values()
            : [];
        return [
            'ok' => !$conflicts, 'conflicts' => $conflicts, 'alternatives' => $alternatives,
            'added' => $addedNights, 'removed' => $removed, 'removed_amount' => $removedAmount, 'delta' => $delta,
        ];
    }

    public function changeDates(Stay $stay, string $checkIn, string $checkOut, ?string $reason): Stay
    {
        return DB::transaction(function () use ($stay, $checkIn, $checkOut, $reason) {
            $stay = Stay::whereKey($stay->id)->lockForUpdate()->firstOrFail();
            $quote = $this->quoteDates($stay, $checkIn, $checkOut);
            abort_unless($quote['ok'], 409, 'Phòng đã có lượt khác vào đêm '.implode(', ', array_map(fn ($n) => date('d/m', strtotime($n)), $quote['conflicts'])).'. Chọn phòng khác hoặc chuyển phòng.');
            if ($quote['removed']) {
                DB::table('room_nights')->where('stay_id', $stay->id)->whereIn('night', $quote['removed'])->delete();
                StayNight::where('stay_id', $stay->id)->whereIn('night', $quote['removed'])->where('void', false)
                    ->update(['void' => true, 'void_reason' => 'Đổi ngày lưu trú']);
            }
            if ($quote['added']) {
                $this->availability->reserve($stay->room_id, array_column($quote['added'], 'night'), $stay->id);
                $folioId = $this->folios->mainFolio($stay->booking)->id;
                foreach ($quote['added'] as $n) {
                    $stay->nights()->create(['folio_id' => $folioId, 'night' => $n['night'], 'room_rate' => $n['room_rate'],
                        'extra_charge' => $n['extra_charge'], 'amount' => $n['amount'], 'rate_label' => $n['label'], 'rate_rule_id' => $n['rule_id']]);
                }
            }
            $from = $stay->check_in->format('d/m').'–'.$stay->check_out->format('d/m');
            $stay->update(['check_in' => $checkIn, 'check_out' => $checkOut]);
            $this->refreshDeposit($stay->booking);
            Audit::log('stay.change_dates', $stay->booking, "Đổi ngày phòng {$stay->room?->number}: $from → ".date('d/m', strtotime($checkIn)).'–'.date('d/m', strtotime($checkOut))
                .' (chênh lệch '.number_format($quote['delta'], 0, ',', '.').'đ)', $reason, ['delta' => $quote['delta']]);
            return $stay->refresh();
        });
    }

    /** Xem trước chuyển phòng/đổi loại phòng. */
    public function quoteMove(Stay $stay, int $roomId, bool $reprice): array
    {
        abort_unless(in_array($stay->status, ['hold', 'confirmed', 'checked_in'], true), 409, 'Lượt ở không thể chuyển phòng.');
        $room = Room::sellable()->findOrFail($roomId);
        abort_if($room->id === $stay->room_id, 422, 'Đang ở phòng này.');
        $today = Context::today()->toDateString();
        $from = $stay->status === 'checked_in' ? max($today, $stay->check_in->toDateString()) : $stay->check_in->toDateString();
        $to = $stay->check_out->toDateString();
        abort_if($from >= $to, 409, 'Không còn đêm nào để chuyển. Thực hiện trả phòng.');
        $type = RoomType::findOrFail($room->room_type_id);
        abort_if($stay->adults > $type->max_adults || $stay->children > $type->max_children || $stay->adults + $stay->children > $type->max_occupancy,
            422, "Phòng {$room->number} ({$type->name}) không đủ sức chứa.");
        $free = $this->availability->isRoomFree($room->id, $from, $to);
        $current = (int) StayNight::where('stay_id', $stay->id)->where('void', false)->where('night', '>=', $from)->sum('amount');
        $newAmount = $current;
        $nights = [];
        if ($reprice && $type->id !== $stay->room_type_id) {
            $q = $this->pricing->quote($type, $stay->ratePlan, $from, $to, $stay->adults, $stay->children, $stay->extra_beds);
            $nights = $q['nights'];
            $newAmount = $q['total'];
        }
        return ['ok' => $free, 'room' => ['id' => $room->id, 'number' => $room->number, 'type' => $type->name, 'housekeeping' => $room->housekeeping],
            'from' => $from, 'to' => $to, 'type_changed' => $type->id !== $stay->room_type_id,
            'current_amount' => $current, 'new_amount' => $newAmount, 'delta' => $newAmount - $current, 'nights' => $nights,
            'message' => $free ? null : "Phòng {$room->number} không trống trong khoảng ".date('d/m', strtotime($from)).'–'.date('d/m', strtotime($to)).'.'];
    }

    public function move(Stay $stay, int $roomId, bool $reprice, string $reason, ?string $overrideReason = null): Stay
    {
        return DB::transaction(function () use ($stay, $roomId, $reprice, $reason, $overrideReason) {
            $stay = Stay::whereKey($stay->id)->lockForUpdate()->firstOrFail();
            $quote = $this->quoteMove($stay, $roomId, $reprice);
            abort_unless($quote['ok'], 409, $quote['message']);
            $newRoom = Room::whereKey($roomId)->lockForUpdate()->firstOrFail();
            $oldRoom = $stay->room;
            $inHouse = $stay->status === 'checked_in';
            if ($inHouse && $newRoom->housekeeping !== 'clean') {
                abort_unless(auth()->user()?->hasPermission('frontdesk.override_dirty'), 403, "Phòng {$newRoom->number} chưa sẵn sàng.");
                abort_if(!$overrideReason, 422, 'Nhập lý do chuyển vào phòng chưa sẵn sàng.');
            }
            $this->availability->release($stay->id, $quote['from']);
            $this->availability->reserve($newRoom->id, AvailabilityService::nights($quote['from'], $quote['to']), $stay->id);
            if ($reprice && $quote['type_changed']) {
                StayNight::where('stay_id', $stay->id)->where('night', '>=', $quote['from'])->where('void', false)
                    ->update(['void' => true, 'void_reason' => 'Đổi loại phòng']);
                $folioId = $this->folios->mainFolio($stay->booking)->id;
                foreach ($quote['nights'] as $n) {
                    $stay->nights()->create(['folio_id' => $folioId, 'night' => $n['night'], 'room_rate' => $n['room_rate'],
                        'extra_charge' => $n['extra_charge'], 'amount' => $n['amount'], 'rate_label' => $n['label'], 'rate_rule_id' => $n['rule_id']]);
                }
            }
            $stay->update(['room_id' => $newRoom->id, 'room_type_id' => $newRoom->room_type_id, 'room_locked' => true]);
            if ($inHouse && $oldRoom) {
                $this->housekeeping->markDirty($oldRoom, $stay->id, 'departure', "Khách chuyển sang phòng {$newRoom->number}");
            }
            $this->refreshDeposit($stay->booking);
            Audit::log('stay.move', $stay->booking, "Chuyển phòng {$oldRoom?->number} → {$newRoom->number}".($quote['type_changed'] ? ' (đổi loại phòng'.($reprice ? ', tính lại giá' : ', giữ giá').')' : ''),
                $reason, ['delta' => $quote['delta'], 'override' => $overrideReason]);
            return $stay->refresh();
        });
    }

    private function refreshDeposit(Booking $booking): void
    {
        if (!in_array($booking->status, ['hold', 'confirmed'], true)) return;
        $total = (int) StayNight::join('stays', 'stays.id', '=', 'stay_nights.stay_id')->where('stays.booking_id', $booking->id)
            ->where('stay_nights.void', false)->sum('stay_nights.amount');
        $booking->update(['deposit_required' => $this->pricing->deposit($total, $booking->deposit_percent, (int) Settings::value('booking', 'rounding'))]);
    }
}
