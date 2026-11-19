<?php
namespace App\Http\Controllers\Site;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Payment;
use App\Models\Post;
use App\Models\RatePlan;
use App\Models\RoomType;
use App\Services\Audit;
use App\Services\AvailabilityService;
use App\Services\BookingService;
use App\Services\Context;
use App\Services\FolioService;
use App\Services\PricingService;
use App\Services\Settings;
use App\Services\VietQr;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * API công khai cho website. Chỉ trả thông tin bán hàng: không tên khách khác, công nợ hay trạng thái nội bộ.
 * Dùng chung AvailabilityService/PricingService với admin nên tồn và giá luôn nhất quán.
 */
class SiteController extends Controller
{
    public function site()
    {
        $p = Context::property();
        return [
            'hotel' => $p->only(['name', 'address', 'phone', 'email', 'check_in_time', 'check_out_time', 'timezone', 'currency']),
            'site' => Settings::get('site'),
            'policies' => Settings::get('policies'),
            'room_types' => RoomType::where('property_id', $p->id)->where('active', true)->where('public', true)->orderBy('sort')->get()
                ->map(fn ($t) => $this->publicType($t)),
            'rate_plans' => RatePlan::with('policy')->where('property_id', $p->id)->where('active', true)->where('public', true)->orderBy('sort')->get()
                ->map(fn ($r) => $this->publicPlan($r)),
            'payment_qr_enabled' => VietQr::configured(),
        ];
    }

    public function roomType(string $slug)
    {
        $t = RoomType::where('property_id', Context::propertyId())->where('slug', $slug)->where('active', true)->where('public', true)->firstOrFail();
        return $this->publicType($t);
    }

    public function posts(Request $request)
    {
        $type = $request->query('type') === 'offer' ? 'offer' : 'article';
        return Post::where('type', $type)->where('status', 'published')->where('published_at', '<=', now())
            ->when($type === 'offer', fn ($q) => $q->where(fn ($q) => $q->whereNull('valid_to')->orWhere('valid_to', '>=', Context::today()->toDateString())))
            ->orderByDesc('published_at')->get(['slug', 'title', 'excerpt', 'cover', 'cover_alt', 'valid_from', 'valid_to', 'published_at', 'updated_at']);
    }

    public function post(string $slug)
    {
        return Post::where('slug', $slug)->where('status', 'published')->where('published_at', '<=', now())
            ->firstOrFail(['type', 'slug', 'title', 'excerpt', 'body', 'cover', 'cover_alt', 'valid_from', 'valid_to', 'published_at', 'updated_at']);
    }

    public function availability(Request $request, AvailabilityService $availability, PricingService $pricing)
    {
        $data = $this->stayInput($request);
        $plans = RatePlan::with('policy')->where('property_id', Context::propertyId())->where('active', true)->where('public', true)->orderBy('sort')->get();
        $rounding = (int) Settings::value('booking', 'rounding');
        $rooms = (int) $data['rooms'];
        $result = $availability->byType(Context::propertyId(), $data['check_in'], $data['check_out'], true)->map(function ($row) use ($data, $plans, $pricing, $rooms, $rounding) {
            /** @var RoomType $t */
            $t = $row['type'];
            $alloc = self::allocate($data['adults'], $data['children'], $rooms);
            $fits = collect($alloc)->every(fn ($a) => $a[0] <= $t->max_adults && $a[1] <= $t->max_children && $a[0] + $a[1] <= $t->max_occupancy);
            $bookable = $fits && $row['available'] >= $rooms;
            return [
                'room_type' => $this->publicType($t),
                'available' => $bookable,
                'remaining' => min($row['available'], 5), // chỉ hiển thị "còn ít phòng", không lộ toàn bộ tồn
                'reason' => !$fits ? 'Không đủ sức chứa cho số khách mỗi phòng' : ($row['available'] < $rooms ? 'Không đủ số phòng trống' : null),
                'plans' => $bookable ? $plans->map(function ($plan) use ($t, $data, $pricing, $alloc, $rounding) {
                    $total = 0;
                    $nights = null;
                    foreach ($alloc as [$a, $c]) {
                        $q = $pricing->quote($t, $plan, $data['check_in'], $data['check_out'], $a, $c);
                        $total += $q['total'];
                        $nights ??= $q['nights'];
                    }
                    return $this->publicPlan($plan) + ['total' => $total, 'nights' => $nights,
                        'deposit' => $pricing->deposit($total, $plan->deposit_percent, $rounding)];
                })->values() : [],
            ];
        })->values();
        return ['query' => $data, 'nights' => count(AvailabilityService::nights($data['check_in'], $data['check_out'])), 'results' => $result];
    }

    public function book(Request $request, BookingService $service, FolioService $folios)
    {
        $stay = $this->stayInput($request);
        $data = $request->validate([
            'request_key' => 'required|uuid',
            'room_type_id' => 'required|integer',
            'rate_plan_id' => 'required|integer',
            'expected_total' => 'required|integer|min:0',
            'customer.full_name' => 'required|string|min:2|max:120',
            'customer.phone' => ['required', 'string', 'regex:/^[+0-9 .()\-]{8,20}$/'],
            'customer.email' => 'required|email|max:200',
            'customer.nationality' => 'nullable|string|max:60',
            'special_requests' => 'nullable|string|max:1000',
            'accept_policy' => 'accepted',
        ], ['accept_policy.accepted' => 'Vui lòng đồng ý chính sách đặt và hủy phòng.']);
        $type = RoomType::where('property_id', Context::propertyId())->where('public', true)->where('active', true)->findOrFail($data['room_type_id']);
        RatePlan::where('property_id', Context::propertyId())->where('public', true)->where('active', true)->findOrFail($data['rate_plan_id']);
        $payload = [
            'source' => 'website', 'status' => 'hold', 'rate_plan_id' => $data['rate_plan_id'],
            'customer' => $data['customer'], 'special_requests' => $data['special_requests'] ?? null,
            'request_key' => $data['request_key'], 'expected_total' => (int) $data['expected_total'],
            'stays' => array_map(fn ($a) => ['room_type_id' => $type->id, 'check_in' => $stay['check_in'], 'check_out' => $stay['check_out'],
                'adults' => $a[0], 'children' => $a[1]], self::allocate($stay['adults'], $stay['children'], (int) $stay['rooms'])),
        ];
        $payload['request_hash'] = hash('sha256', json_encode([$stay, $data['room_type_id'], $data['rate_plan_id'], $data['customer'], $data['expected_total']]));
        $booking = $service->create($payload);
        return response()->json($this->summary($booking, $folios), 201);
    }

    public function lookup(Request $request, FolioService $folios)
    {
        $data = $request->validate(['code' => 'required|string|max:20', 'contact' => 'required|string|max:200']);
        return $this->summary($this->findForGuest($data['code'], $data['contact']), $folios);
    }

    /** Khách báo đã chuyển khoản: chỉ tạo yêu cầu đối soát, KHÔNG ghi nhận đã thu. */
    public function transferNotice(Request $request, string $code, FolioService $folios)
    {
        $data = $request->validate(['contact' => 'required|string|max:200', 'amount' => 'required|integer|min:1000|max:1000000000',
            'reference' => 'nullable|string|max:120']);
        $booking = $this->findForGuest($code, $data['contact']);
        abort_unless(in_array($booking->status, ['hold', 'confirmed'], true), 409, 'Đặt phòng không ở trạng thái chờ thanh toán.');
        abort_if(Payment::where('booking_id', $booking->id)->where('status', 'pending')->count() >= 3, 429, 'Đã có yêu cầu đối soát đang chờ xử lý.');
        $method = \App\Models\PaymentMethod::where('type', 'bank_transfer')->where('active', true)->orderBy('sort')->value('code');
        abort_unless($method, 409, 'Khách sạn chưa bật phương thức chuyển khoản.');
        Payment::create(['booking_id' => $booking->id, 'folio_id' => $folios->mainFolio($booking)->id, 'customer_id' => $booking->customer_id,
            'kind' => 'deposit', 'method' => $method, 'amount' => (int) $data['amount'], 'status' => 'pending',
            'reference' => $data['reference'] ?? null, 'note' => 'Khách báo đã chuyển khoản qua website — chờ đối soát']);
        Audit::log('payment.claim', $booking, "Khách báo đã chuyển khoản ".number_format((int) $data['amount'], 0, ',', '.').'đ — chờ đối soát');
        return $this->summary($booking, $folios);
    }

    /** Chia đều khách vào các phòng: tổng khớp đúng số khách. @return array<int, array{0:int,1:int}> */
    public static function allocate(int $adults, int $children, int $rooms): array
    {
        $out = [];
        for ($i = 0; $i < $rooms; $i++) {
            $out[] = [intdiv($adults, $rooms) + ($i < $adults % $rooms ? 1 : 0), intdiv($children, $rooms) + ($i < $children % $rooms ? 1 : 0)];
        }
        return $out;
    }

    private function findForGuest(string $code, string $contact): Booking
    {
        $contact = strtolower(trim($contact));
        $phone = preg_replace('/[^0-9+]/', '', $contact);
        $booking = Booking::where('property_id', Context::propertyId())->where('code', strtoupper(trim($code)))->with('customer')->first();
        $emailOk = $booking && ($booking->customer->email ?? '') !== '' && hash_equals(strtolower($booking->customer->email), $contact);
        $phoneCode = $booking && ctype_digit(substr($booking->code, 0, 9));
        $phoneOk = !$phoneCode && $booking && $phone !== '' && ($booking->customer->phone ?? '') !== '' && hash_equals($booking->customer->phone, $phone);
        abort_unless($emailOk || $phoneOk, 404, $phoneCode
            ? 'Mã đặt phòng là số điện thoại: vui lòng nhập email đã dùng khi đặt phòng để xác minh.'
            : 'Không tìm thấy đặt phòng với mã và thông tin liên hệ đã nhập.');
        return $booking;
    }

    private function stayInput(Request $request): array
    {
        $data = $request->validate([
            'check_in' => 'required|date_format:Y-m-d',
            'check_out' => 'required|date_format:Y-m-d|after:check_in',
            'adults' => 'required|integer|between:1,30',
            'children' => 'nullable|integer|between:0,20',
            'rooms' => 'nullable|integer|between:1,10',
        ], ['check_out.after' => 'Ngày trả phòng phải sau ngày nhận phòng.']);
        if ($data['check_in'] < Context::today()->toDateString()) {
            throw ValidationException::withMessages(['check_in' => 'Ngày nhận phòng phải từ hôm nay.']);
        }
        $max = (int) Settings::value('booking', 'max_nights');
        if (CarbonImmutable::parse($data['check_in'])->diffInDays(CarbonImmutable::parse($data['check_out'])) > $max) {
            throw ValidationException::withMessages(['check_out' => "Mỗi lần đặt tối đa $max đêm."]);
        }
        $data['adults'] = (int) $data['adults'];
        $data['children'] = (int) ($data['children'] ?? 0);
        $data['rooms'] = (int) ($data['rooms'] ?? 1);
        if ($data['rooms'] > $data['adults']) {
            throw ValidationException::withMessages(['rooms' => 'Mỗi phòng cần ít nhất một người lớn.']);
        }
        return $data;
    }

    private function publicType(RoomType $t): array
    {
        return $t->only(['id', 'slug', 'name', 'short_description', 'description', 'area', 'bed', 'base_adults', 'max_adults', 'max_children',
            'max_occupancy', 'max_extra_beds', 'base_rate', 'amenities', 'images', 'seo_title', 'seo_description', 'updated_at']);
    }

    private function publicPlan(RatePlan $r): array
    {
        return ['id' => $r->id, 'name' => $r->name, 'description' => $r->description, 'includes_breakfast' => $r->includes_breakfast,
            'deposit_percent' => $r->deposit_percent, 'refundable' => $r->policy?->refundable,
            'free_cancel_hours' => $r->policy?->free_cancel_hours, 'policy' => $r->policy?->description];
    }

    private function summary(Booking $booking, FolioService $folios): array
    {
        $booking->load(['stays.type:id,name,slug', 'folios', 'customer:id,full_name']);
        $totals = $folios->bookingTotals($booking);
        $remaining = max(0, $booking->deposit_required - $totals['paid']);
        return [
            'code' => $booking->code,
            'status' => $booking->status,
            'status_label' => BookingService::LABELS[$booking->status],
            'guest_name' => $booking->customer->full_name,
            'hold_expires_at' => $booking->hold_expires_at?->toIso8601String(),
            'rooms' => $booking->stays->map(fn ($s) => ['room_type' => $s->type->name, 'slug' => $s->type->slug, 'check_in' => $s->check_in->toDateString(),
                'check_out' => $s->check_out->toDateString(), 'adults' => $s->adults, 'children' => $s->children, 'status' => $s->status])->values(),
            'total' => $totals['charges'],
            'paid' => $totals['paid'],
            'pending_claims' => $totals['pending_claims'],
            'deposit_required' => $booking->deposit_required,
            'deposit_remaining' => $remaining,
            'policy' => $booking->policy_snapshot,
            'payment' => $remaining > 0 && in_array($booking->status, ['hold', 'confirmed'], true)
                ? VietQr::payload($remaining, $booking->code, $booking->property_id) : null,
        ];
    }
}
