<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\HousekeepingTask;
use App\Models\MaintenanceTicket;
use App\Models\Payment;
use App\Models\Room;
use App\Models\Shift;
use App\Models\Stay;
use App\Services\Audit;
use App\Services\AvailabilityService;
use App\Services\Context;
use App\Services\ReportService;
use App\Services\Settings;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    public function __construct(private ReportService $reports) {}

    public function dashboard(Request $request, AvailabilityService $availability, \App\Services\AutomationService $automation, \App\Services\FolioService $folios)
    {
        $automation->ensureDaily();
        $availability->releaseExpiredHolds();
        $d = $request->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d']);
        $today = Context::today()->toDateString();
        $from = $d['from'] ?? $today;
        $to = $d['to'] ?? $from;
        $stays = fn () => Stay::whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()));
        $rooms = Room::where('property_id', $this->pid())->whereNull('archived_at')->get(['id', 'housekeeping']);
        $blockedIds = \DB::table('room_nights')->whereIn('room_id', $rooms->pluck('id'))->whereNotNull('room_block_id')->where('night', $today)->pluck('room_id');
        $blockedToday = $blockedIds->count();
        $inHouse = $stays()->where('status', 'checked_in')->count();
        $occupiedRoomIds = $stays()->where('status', 'checked_in')->pluck('room_id');
        $data = [
            'today' => $today,
            'rooms_total' => $rooms->count(),
            'in_house' => $inHouse,
            'arrivals' => $stays()->where('check_in', $today)->whereIn('status', ['hold', 'confirmed'])->count(),
            'arrived' => $stays()->where('check_in', $today)->where('status', 'checked_in')->count(),
            'departures' => $stays()->where('check_out', $today)->where('status', 'checked_in')->count(),
            'departed' => $stays()->whereDate('checked_out_at', $today)->count(),
            'vacant_ready' => $rooms->whereNotIn('id', $occupiedRoomIds)->whereNotIn('id', $blockedIds)->where('housekeeping', 'clean')->count(),
            'dirty' => $rooms->where('housekeeping', '!=', 'clean')->count(),
            'blocked' => $blockedToday,
            'occupancy_today' => $rooms->count() - $blockedToday > 0 ? round($inHouse * 100 / ($rooms->count() - $blockedToday), 1) : 0,
            'holds' => Booking::where('property_id', $this->pid())->where('status', 'hold')->count(),
            'new_bookings' => Booking::where('property_id', $this->pid())->where('created_at', '>=', $from)->where('created_at', '<', CarbonImmutable::parse($to)->addDay())->count(),
            'tasks_open' => HousekeepingTask::whereIn('room_id', $rooms->pluck('id'))->whereIn('status', ['open', 'in_progress', 'inspecting'])->count(),
            'tickets_open' => MaintenanceTicket::where('property_id', $this->pid())->whereIn('status', ['open', 'in_progress'])->count(),
            'claims_pending' => Payment::where('status', 'pending')->whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()))->count(),
            'alerts' => $this->alerts($today),
            'todo' => $this->todo($today, $folios),
            'automation' => Settings::get('automation_state')['last_result'] ?? null,
        ];
        if ($this->allowed('revenue.view')) {
            $data['period'] = $this->reports->summary($this->pid(), $from, $to);
            $data['receivables_total'] = array_sum(array_column($this->reports->receivables($this->pid()), 'balance'));
            $data['trend'] = collect(range(6, 0))->map(function ($i) use ($to) {
                $day = CarbonImmutable::parse($to)->subDays($i)->toDateString();
                $s = $this->reports->summary($this->pid(), $day, $day);
                return ['date' => $day, 'room_revenue' => $s['room_revenue'], 'service_revenue' => $s['service_revenue'] + $s['other_revenue'], 'occupancy' => $s['occupancy']];
            });
        }
        return $data;
    }

    /** Danh sách việc cần làm hôm nay, đủ dữ liệu để thao tác ngay trên Tổng quan. */
    private function todo(string $today, \App\Services\FolioService $folios): array
    {
        $base = fn () => Stay::with(['room:id,number,housekeeping', 'type:id,name,code', 'booking:id,code,customer_id,status,hold_expires_at', 'booking.customer:id,full_name,phone,vip'])
            ->whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()));
        $card = fn (Stay $s) => ['stay_id' => $s->id, 'booking_id' => $s->booking_id, 'code' => $s->booking->code, 'status' => $s->status,
            'guest' => $s->booking->customer?->full_name, 'phone' => $s->booking->customer?->phone, 'vip' => (bool) $s->booking->customer?->vip,
            'room' => $s->room?->number, 'room_id' => $s->room_id, 'housekeeping' => $s->room?->housekeeping, 'type' => $s->type?->name,
            'check_in' => $s->check_in->toDateString(), 'check_out' => $s->check_out->toDateString(), 'adults' => $s->adults, 'children' => $s->children];
        $arrivals = $base()->where('check_in', $today)->whereIn('status', ['hold', 'confirmed'])->orderBy('room_id')->get();
        $departures = $base()->where('status', 'checked_in')->where('check_out', '<=', $today)->orderBy('room_id')->get();
        $balances = $this->allowed('balance.view') ? $folios->balances($departures->pluck('booking_id')->unique()->values()->all()) : [];
        return [
            'arrivals' => $arrivals->map($card)->values(),
            'departures' => $departures->map(fn ($s) => $card($s) + ['balance' => $balances[$s->booking_id] ?? null, 'overdue' => $s->check_out->toDateString() < $today])->values(),
            'holds' => Booking::with('customer:id,full_name')->where('property_id', $this->pid())->where('status', 'hold')->orderBy('hold_expires_at')->limit(20)->get()
                ->map(fn ($b) => ['booking_id' => $b->id, 'code' => $b->code, 'guest' => $b->customer?->full_name, 'hold_expires_at' => $b->hold_expires_at?->toIso8601String(),
                    'deposit_required' => $b->deposit_required]),
            'cleaning' => \App\Models\HousekeepingTask::with('room:id,number,housekeeping', 'assignee:id,name')
                ->whereHas('room', fn ($q) => $q->where('property_id', $this->pid()))->whereIn('status', ['open', 'in_progress', 'inspecting'])
                ->orderByRaw("CASE priority WHEN 'high' THEN 0 ELSE 1 END")->orderBy('id')->limit(30)->get()
                ->map(fn ($t) => ['id' => $t->id, 'room' => $t->room->number, 'room_id' => $t->room_id, 'status' => $t->status, 'type' => $t->type,
                    'priority' => $t->priority, 'assignee' => $t->assignee?->name,
                    'arrival_today' => Stay::where('room_id', $t->room_id)->where('check_in', $today)->whereIn('status', ['hold', 'confirmed'])->exists()]),
            'low_stock' => $this->allowed('inventory.view') ? \App\Models\InventoryItem::where('property_id', $this->pid())->where('active', true)
                ->whereColumn('on_hand', '<=', 'min_stock')->get(['id', 'name', 'unit', 'on_hand', 'min_stock']) : [],
        ];
    }

    private function alerts(string $today): array
    {
        $alerts = [];
        $late = Stay::with('room:id,number', 'booking:id,code')->whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()))
            ->where('status', 'checked_in')->where('check_out', '<', $today)->get();
        foreach ($late as $s) $alerts[] = ['level' => 'high', 'text' => "Phòng {$s->room?->number} quá ngày trả ({$s->booking->code}) — cần gia hạn hoặc trả phòng", 'booking_id' => $s->booking_id];
        $dirtyArrivals = Stay::with('room:id,number,housekeeping', 'booking:id,code')->whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()))
            ->where('check_in', $today)->whereIn('status', ['hold', 'confirmed'])->get()->filter(fn ($s) => $s->room && $s->room->housekeeping !== 'clean');
        foreach ($dirtyArrivals as $s) $alerts[] = ['level' => 'medium', 'text' => "Phòng {$s->room->number} có khách đến hôm nay nhưng chưa sạch", 'booking_id' => $s->booking_id];
        $expiring = Booking::where('property_id', $this->pid())->where('status', 'hold')->where('hold_expires_at', '<', now()->addMinutes(30))->get(['id', 'code', 'hold_expires_at']);
        foreach ($expiring as $b) $alerts[] = ['level' => 'medium', 'text' => "Giữ chỗ {$b->code} sắp hết hạn lúc ".$b->hold_expires_at->format('H:i'), 'booking_id' => $b->id];
        $unassigned = Stay::whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()))->whereNull('room_id')->whereIn('status', ['hold', 'confirmed'])->count();
        if ($unassigned) $alerts[] = ['level' => 'medium', 'text' => "$unassigned lượt ở chưa phân phòng"];
        return $alerts;
    }

    public function summary(Request $request)
    {
        [$from, $to] = $this->period($request);
        return [
            'summary' => $this->reports->summary($this->pid(), $from, $to),
            'by_room_type' => $this->reports->byRoomType($this->pid(), $from, $to),
            'by_source' => $this->reports->bySource($this->pid(), $from, $to),
            'shifts' => Shift::with('user:id,name', 'receiver:id,name')->where('property_id', $this->pid())
                ->where('opened_at', '>=', $from)->where('opened_at', '<', CarbonImmutable::parse($to)->addDay())->latest('id')->get(),
            'method_notes' => [
                'Kỳ báo cáo tính theo ngày vận hành (Asia/Ho_Chi_Minh), bao gồm ngày đầu và ngày cuối.',
                'Phòng-đêm khả dụng = số phòng đang sử dụng × số ngày − phòng-đêm bị chặn bảo trì/ngừng bán.',
                'Phòng-đêm đã bán và doanh thu phòng chỉ tính lượt ở đã nhận phòng hoặc đã trả phòng, theo giá đã chụp từng đêm.',
                'Doanh thu dịch vụ/phụ thu/phí tính theo ngày phát sinh, đã trừ dòng hủy, giảm giá và điều chỉnh.',
                'Công suất = đã bán ÷ khả dụng; ADR = doanh thu phòng ÷ đã bán; RevPAR = doanh thu phòng ÷ khả dụng.',
                'Tiền đã thu (cọc, thanh toán, hoàn tiền) tính theo thời điểm thu, khác với doanh thu.',
            ],
        ];
    }

    public function receivables()
    {
        return $this->reports->receivables($this->pid());
    }

    public function export(Request $request, string $type)
    {
        [$from, $to] = $this->period($request);
        Audit::log('report.export', null, "Xuất báo cáo $type $from → $to");
        $name = "bao-cao-$type-$from-$to.csv";
        return match ($type) {
            'room-types' => $this->csv($name, ['Loại phòng', 'Số phòng', 'Phòng-đêm khả dụng', 'Đã bán', 'Doanh thu phòng', 'Công suất %', 'ADR', 'RevPAR'],
                array_map('array_values', $this->reports->byRoomType($this->pid(), $from, $to))),
            'sources' => $this->csv($name, ['Nguồn', 'Số đặt phòng', 'Phòng-đêm', 'Giá trị phòng', 'Đã hủy', 'Không đến'],
                array_map('array_values', $this->reports->bySource($this->pid(), $from, $to))),
            'receivables' => $this->csv($name, ['ID', 'Mã', 'Trạng thái', 'Khách', 'Người chịu công nợ', 'Loại', 'Còn phải thu', 'Ngày trả', 'Số ngày'],
                array_map('array_values', $this->reports->receivables($this->pid()))),
            'payments' => $this->csv($name, ['Số phiếu', 'Thời điểm', 'Mã đặt phòng', 'Loại', 'Phương thức', 'Số tiền', 'Tham chiếu', 'Người thu'],
                Payment::with('booking:id,code', 'receiver:id,name')->where('status', 'completed')
                    ->whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()))
                    ->where('paid_at', '>=', $from)->where('paid_at', '<', CarbonImmutable::parse($to)->addDay())->orderBy('paid_at')->get()
                    ->map(fn ($p) => [$p->receipt_no, $p->paid_at?->format('d/m/Y H:i'), $p->booking?->code, $p->kind, $p->method,
                        $p->kind === 'refund' ? -$p->amount : $p->amount, $p->reference, $p->receiver?->name])),
            'summary' => $this->csv($name, ['Chỉ số', 'Giá trị'], collect($this->reports->summary($this->pid(), $from, $to))
                ->except(['period', 'collections', 'cashbook'])->map(fn ($v, $k) => [$k, $v])->values()),
            default => abort(404),
        };
    }

    public function audit(Request $request)
    {
        $d = $request->validate(['q' => 'nullable|string|max:100', 'action' => 'nullable|string|max:60', 'user_id' => 'nullable|integer',
            'subject_type' => 'nullable|string|max:40', 'subject_id' => 'nullable|integer']);
        return AuditLog::with('user:id,name')->where(fn ($q) => $q->where('property_id', $this->pid())->orWhereNull('property_id'))
            ->when($d['q'] ?? null, fn ($q, $t) => $q->where(fn ($q) => $q->where('summary', 'like', "%$t%")->orWhere('reason', 'like', "%$t%")))
            ->when($d['action'] ?? null, fn ($q, $a) => $q->where('action', 'like', "$a%"))
            ->when($d['user_id'] ?? null, fn ($q, $u) => $q->where('user_id', $u))
            ->when($d['subject_type'] ?? null, fn ($q, $t) => $q->where('subject_type', $t))
            ->when($d['subject_id'] ?? null, fn ($q, $i) => $q->where('subject_id', $i))
            ->latest('id')->paginate(50);
    }

    private function period(Request $request): array
    {
        $d = $request->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d']);
        $to = $d['to'] ?? Context::today()->toDateString();
        $from = $d['from'] ?? CarbonImmutable::parse($to)->startOfMonth()->toDateString();
        abort_if($from > $to, 422, 'Ngày bắt đầu phải trước ngày kết thúc.');
        abort_if(CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to)) > 366, 422, 'Kỳ báo cáo tối đa 1 năm.');
        return [$from, $to];
    }
}
