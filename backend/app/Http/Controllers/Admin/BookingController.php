<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\PaymentMethod;
use App\Models\RatePlan;
use App\Models\Room;
use App\Services\Audit;
use App\Services\AvailabilityService;
use App\Services\BookingService;
use App\Services\Context;
use App\Services\FolioService;
use App\Services\PricingService;
use App\Services\Settings;
use App\Services\VietQr;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BookingController extends Controller
{
    public function __construct(private BookingService $service, private FolioService $folios) {}

    public function index(Request $request)
    {
        $f = $request->validate([
            'q' => 'nullable|string|max:100', 'status' => ['nullable', Rule::in(Booking::STATUSES)], 'source' => ['nullable', Rule::in(Booking::SOURCES)],
            'from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d', 'view' => 'nullable|in:arrivals,departures,in_house,holds,all',
        ]);
        $today = Context::today()->toDateString();
        $page = Booking::where('property_id', $this->pid())
            ->with(['customer:id,full_name,phone,vip', 'billTo:id,full_name', 'stays:id,booking_id,room_id,room_type_id,status,check_in,check_out,adults,children',
                'stays.room:id,number', 'stays.type:id,name,code'])
            ->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($f['source'] ?? null, fn ($q, $s) => $q->where('source', $s))
            ->when($f['q'] ?? null, fn ($q, $term) => $q->where(fn ($q) => $q->where('code', 'like', "%$term%")->orWhere('group_name', 'like', "%$term%")
                ->orWhereHas('customer', fn ($c) => $c->where('full_name', 'like', "%$term%")->orWhere('phone', 'like', '%'.preg_replace('/\D/', '', $term).'%'))))
            ->when($f['from'] ?? null, fn ($q, $d) => $q->whereHas('stays', fn ($s) => $s->where('check_out', '>', $d)))
            ->when($f['to'] ?? null, fn ($q, $d) => $q->whereHas('stays', fn ($s) => $s->where('check_in', '<=', $d)))
            ->when(($f['view'] ?? null) === 'arrivals', fn ($q) => $q->whereHas('stays', fn ($s) => $s->where('check_in', $today)->whereIn('status', ['hold', 'confirmed'])))
            ->when(($f['view'] ?? null) === 'departures', fn ($q) => $q->whereHas('stays', fn ($s) => $s->where('check_out', $today)->where('status', 'checked_in')))
            ->when(($f['view'] ?? null) === 'in_house', fn ($q) => $q->whereHas('stays', fn ($s) => $s->where('status', 'checked_in')))
            ->when(($f['view'] ?? null) === 'holds', fn ($q) => $q->where('status', 'hold'))
            ->latest('id')->paginate(25);
        if ($this->allowed('balance.view')) {
            $balances = $this->folios->balances($page->getCollection()->pluck('id')->all());
            $page->getCollection()->each(fn ($b) => $b->setAttribute('balance', $balances[$b->id] ?? 0));
        }
        return $page;
    }

    public function show(int $id, BookingService $service)
    {
        $booking = $this->booking($id)->load([
            'customer', 'billTo:id,full_name,kind', 'ratePlan:id,name', 'creator:id,name',
            'stays.room:id,number,housekeeping', 'stays.type:id,name,code,max_adults,max_children,max_occupancy',
            'stays.guests:id,full_name,phone,nationality,vip', 'stays.nights', 'folios.lines.poster:id,name', 'folios.payments.receiver:id,name',
        ]);
        $canPay = $this->allowed('payments.view');
        $folios = $booking->folios->map(fn ($f) => [
            'id' => $f->id, 'name' => $f->name, 'status' => $f->status, 'bill_to_id' => $f->bill_to_id,
            'totals' => $this->folios->folioTotals($f),
            'lines' => $f->lines->sortBy('id')->values(),
            'payments' => $canPay ? $f->payments->sortBy('id')->values() : [],
        ]);
        $history = AuditLog::with('user:id,name')->where('subject_type', 'Booking')->where('subject_id', $booking->id)->latest('id')->limit(100)->get();
        if ($this->allowed('guests.documents')) {
            $booking->customer->makeVisible('id_number');
        }
        return [
            'booking' => $booking,
            'totals' => $this->folios->bookingTotals($booking),
            'folios' => $folios,
            'history' => $history,
            'cancellation' => in_array($booking->status, ['hold', 'confirmed'], true) ? $service->cancellationQuote($booking) : null,
            'payment_qr' => $canPay && VietQr::configured() ? VietQr::payload(max(1000, $this->folios->bookingTotals($booking)['balance']), $booking->code) : null,
            'labels' => BookingService::LABELS,
        ];
    }

    /** Tra phòng trống + báo giá cho lễ tân (cùng nguồn với website). */
    public function quote(Request $request, AvailabilityService $availability, PricingService $pricing)
    {
        $d = $request->validate(['check_in' => 'required|date_format:Y-m-d', 'check_out' => 'required|date_format:Y-m-d|after:check_in',
            'adults' => 'nullable|integer|between:1,10', 'children' => 'nullable|integer|between:0,10', 'rate_plan_id' => 'nullable|integer']);
        $plan = !empty($d['rate_plan_id']) ? RatePlan::where('property_id', $this->pid())->findOrFail($d['rate_plan_id'])
            : RatePlan::where('property_id', $this->pid())->where('active', true)->orderBy('sort')->first();
        return [
            'rate_plan' => $plan,
            'types' => $availability->byType($this->pid(), $d['check_in'], $d['check_out'])->map(function ($row) use ($d, $plan, $pricing, $availability) {
                $t = $row['type'];
                $q = $pricing->quote($t, $plan, $d['check_in'], $d['check_out'], (int) ($d['adults'] ?? $t->base_adults), (int) ($d['children'] ?? 0));
                return ['id' => $t->id, 'name' => $t->name, 'code' => $t->code, 'max_adults' => $t->max_adults, 'max_children' => $t->max_children,
                    'max_occupancy' => $t->max_occupancy, 'available' => $row['available'],
                    'free_rooms' => $availability->freeRooms($t->id, $d['check_in'], $d['check_out'])->map(fn ($r) => ['id' => $r->id, 'number' => $r->number, 'housekeeping' => $r->housekeeping])->values(),
                    'total' => $q['total'], 'nights' => $q['nights']];
            })->values(),
        ];
    }

    public function options()
    {
        return [
            'rate_plans' => RatePlan::with('policy')->where('property_id', $this->pid())->where('active', true)->orderBy('sort')->get(),
            'payment_methods' => PaymentMethod::where('active', true)->orderBy('sort')->get(),
            'sources' => ['direct' => 'Trực tiếp', 'phone' => 'Điện thoại', 'website' => 'Website', 'agent' => 'Đại lý', 'ota' => 'OTA'],
            'settings' => Settings::get('booking'),
            'surcharges' => Settings::get('surcharges'),
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'source' => ['required', Rule::in(Booking::SOURCES)],
            'source_ref' => 'nullable|string|max:80',
            'status' => 'required|in:hold,confirmed',
            'hold_minutes' => 'nullable|integer|between:5,10080',
            'rate_plan_id' => 'nullable|integer',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'customer.full_name' => 'required_without:customer_id|nullable|string|max:120',
            'customer.phone' => ['nullable', 'string', 'regex:/^[+0-9 .()\-]{8,20}$/'],
            'customer.email' => 'nullable|email|max:200',
            'customer.nationality' => 'nullable|string|max:60',
            'bill_to_id' => 'nullable|integer|exists:customers,id',
            'group_name' => 'nullable|string|max:120',
            'special_requests' => 'nullable|string|max:1000',
            'internal_notes' => 'nullable|string|max:1000',
            'stays' => 'required|array|min:1|max:20',
            'stays.*.room_type_id' => 'required|integer',
            'stays.*.room_id' => 'nullable|integer',
            'stays.*.check_in' => 'required|date_format:Y-m-d',
            'stays.*.check_out' => 'required|date_format:Y-m-d',
            'stays.*.adults' => 'required|integer|between:1,10',
            'stays.*.children' => 'nullable|integer|between:0,10',
            'stays.*.extra_beds' => 'nullable|integer|between:0,3',
        ]);
        foreach ($data['stays'] as $s) {
            if (!empty($s['room_id'])) $this->room((int) $s['room_id']);
        }
        if ($data['source'] === 'website') abort(422, 'Nguồn website chỉ dành cho đơn đặt từ website.');
        return response()->json($this->service->create($data), 201);
    }

    public function update(Request $request, int $id)
    {
        $booking = $this->booking($id);
        $data = $request->validate([
            'source' => ['sometimes', Rule::in(Booking::SOURCES)], 'source_ref' => 'nullable|string|max:80',
            'bill_to_id' => 'nullable|integer|exists:customers,id', 'group_name' => 'nullable|string|max:120',
            'special_requests' => 'nullable|string|max:1000', 'internal_notes' => 'nullable|string|max:1000',
        ]);
        if (!empty($data['bill_to_id'])) {
            abort_unless(in_array(Customer::whereKey($data['bill_to_id'])->value('kind'), ['company', 'agent'], true), 422, 'Người chịu công nợ phải là công ty hoặc đại lý.');
        }
        $booking->fill($data);
        $diff = Audit::diff($booking);
        $booking->save();
        if ($diff) Audit::log('booking.update', $booking, 'Cập nhật thông tin đặt phòng', null, $diff);
        return $booking;
    }

    public function confirm(int $id)
    {
        return $this->service->confirm($this->booking($id));
    }

    public function extendHold(Request $request, int $id)
    {
        $d = $request->validate(['minutes' => 'required|integer|between:5,4320', 'reason' => 'required|string|max:300']);
        return $this->service->extendHold($this->booking($id), $d['minutes'], $d['reason']);
    }

    public function cancel(Request $request, int $id)
    {
        $d = $request->validate(['reason' => 'required|string|min:3|max:500', 'stay_ids' => 'nullable|array', 'stay_ids.*' => 'integer',
            'charge_fee' => 'boolean', 'mode' => 'nullable|in:cancel,no_show']);
        return $this->service->cancel($this->booking($id), $d['reason'], $d['stay_ids'] ?? null, (bool) ($d['charge_fee'] ?? false), $d['mode'] ?? 'cancel');
    }

    public function addStay(Request $request, int $id)
    {
        $booking = $this->booking($id);
        abort_unless(in_array($booking->status, ['hold', 'confirmed', 'checked_in'], true), 409, 'Không thể thêm phòng vào đặt phòng này.');
        $s = $request->validate(['room_type_id' => 'required|integer', 'room_id' => 'nullable|integer', 'check_in' => 'required|date_format:Y-m-d',
            'check_out' => 'required|date_format:Y-m-d|after:check_in', 'adults' => 'required|integer|between:1,10', 'children' => 'nullable|integer|between:0,10',
            'extra_beds' => 'nullable|integer|between:0,3']);
        abort_if($s['check_in'] < Context::today()->toDateString(), 422, 'Ngày nhận phòng không được trước ngày vận hành.');
        if (!empty($s['room_id'])) $this->room((int) $s['room_id']);
        return DB::transaction(function () use ($booking, $s) {
            $status = $booking->status === 'hold' ? 'hold' : 'confirmed';
            $res = $this->service->addStay($booking, $this->folios->mainFolio($booking)->id, $s, $booking->ratePlan, $status);
            Audit::log('booking.add_stay', $booking, 'Thêm phòng vào đặt phòng (giá '.number_format($res['total'], 0, ',', '.').'đ)');
            return $res['stay'];
        });
    }

    public function assignRoom(Request $request, int $stayId)
    {
        $d = $request->validate(['room_id' => 'required|integer', 'reason' => 'nullable|string|max:300']);
        $this->room($d['room_id']);
        return $this->service->assignRoom($this->stay($stayId), $d['room_id'], $d['reason'] ?? null);
    }

    public function freeRooms(int $stayId, AvailabilityService $availability)
    {
        $stay = $this->stay($stayId);
        $from = $stay->status === 'checked_in' ? max(Context::today()->toDateString(), $stay->check_in->toDateString()) : $stay->check_in->toDateString();
        return Room::with('type:id,name')->where('property_id', $this->pid())->whereNull('archived_at')->where('id', '!=', $stay->room_id)
            ->orderBy('sort')->get()->filter(fn ($r) => $availability->isRoomFree($r->id, $from, $stay->check_out->toDateString()))
            ->map(fn ($r) => ['id' => $r->id, 'number' => $r->number, 'room_type_id' => $r->room_type_id, 'type' => $r->type->name,
                'housekeeping' => $r->housekeeping, 'same_type' => $r->room_type_id === $stay->room_type_id])->values();
    }
}
