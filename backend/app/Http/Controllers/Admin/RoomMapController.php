<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Floor;
use App\Models\HousekeepingTask;
use App\Models\Room;
use App\Models\RoomBlock;
use App\Models\RoomType;
use App\Models\Stay;
use App\Services\AvailabilityService;
use App\Services\Context;
use App\Services\FolioService;
use App\Services\HousekeepingService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Sơ đồ mặt bằng và lịch phòng dùng chung dữ liệu: rooms, stays, room_nights, room_blocks. */
class RoomMapController extends Controller
{
    public function map(Request $request, FolioService $folios, AvailabilityService $availability, \App\Services\AutomationService $automation)
    {
        $automation->ensureDaily();
        $availability->releaseExpiredHolds();
        $date = $request->validate(['date' => 'nullable|date_format:Y-m-d'])['date'] ?? Context::today()->toDateString();
        $isToday = $date === Context::today()->toDateString();
        $rooms = Room::with('type:id,name,code')->where('property_id', $this->pid())->whereNull('archived_at')->orderBy('sort')->orderBy('number')->get();
        $roomIds = $rooms->pluck('id');

        $stays = Stay::with(['booking:id,code,status,customer_id,bill_to_id,special_requests', 'booking.customer:id,full_name,vip,phone'])
            ->whereIn('room_id', $roomIds)->whereIn('status', ['hold', 'confirmed', 'checked_in', 'checked_out'])
            ->where('check_out', '>=', $date)
            ->where(fn ($q) => $q->where('check_in', '<=', CarbonImmutable::parse($date)->addDays(60)->toDateString()))
            ->orderBy('check_in')->get()->groupBy('room_id');
        $blocks = RoomBlock::whereIn('room_id', $roomIds)->whereNull('released_at')->where('start_date', '<=', $date)->where('end_date', '>', $date)
            ->get()->keyBy('room_id');
        $tasks = HousekeepingTask::with('assignee:id,name')->whereIn('room_id', $roomIds)->whereIn('status', ['open', 'in_progress', 'inspecting'])
            ->get()->keyBy('room_id');
        $showBalance = $this->allowed('balance.view');
        $balances = $showBalance ? $folios->balances($stays->flatten()->pluck('booking_id')->unique()->values()->all()) : [];

        $summary = ['vacant_ready' => 0, 'occupied' => 0, 'arriving' => 0, 'departing' => 0, 'dirty' => 0, 'blocked' => 0];
        $out = $rooms->map(function (Room $room) use ($stays, $blocks, $tasks, $date, $isToday, $balances, $showBalance, &$summary) {
            $list = $stays->get($room->id, collect());
            $inHouse = $list->first(fn ($s) => $s->status === 'checked_in' && ($isToday || ($s->check_in->toDateString() <= $date && $s->check_out->toDateString() > $date)))
                ?? (!$isToday ? $list->first(fn ($s) => in_array($s->status, ['hold', 'confirmed'], true) && $s->check_in->toDateString() < $date && $s->check_out->toDateString() > $date) : null);
            $departing = $list->first(fn ($s) => $s->check_out->toDateString() === $date && ($s->status === 'checked_in' || (!$isToday && in_array($s->status, ['confirmed', 'hold'], true))));
            $arriving = $list->first(fn ($s) => $s->check_in->toDateString() === $date && in_array($s->status, ['hold', 'confirmed'], true));
            $next = $list->first(fn ($s) => $s->check_in->toDateString() > $date && in_array($s->status, ['hold', 'confirmed'], true));
            $block = $blocks->get($room->id);

            $occupancy = match (true) {
                (bool) $departing => 'departing',
                (bool) $inHouse && $inHouse->status === 'checked_in' => 'occupied',
                (bool) $inHouse => 'reserved',
                (bool) $arriving => 'arriving',
                default => 'vacant',
            };
            $availability = $block?->type ?? 'active';
            if ($occupancy === 'occupied' || ($occupancy === 'departing')) $summary['occupied']++;
            if ($arriving) $summary['arriving']++;
            if ($departing) $summary['departing']++;
            if ($room->housekeeping !== 'clean') $summary['dirty']++;
            if ($availability !== 'active') $summary['blocked']++;
            if ($occupancy === 'vacant' && $room->housekeeping === 'clean' && $availability === 'active') $summary['vacant_ready']++;

            $card = fn (?Stay $s) => $s ? [
                'stay_id' => $s->id, 'booking_id' => $s->booking_id, 'code' => $s->booking->code, 'status' => $s->status,
                'guest' => $s->booking->customer?->full_name, 'vip' => (bool) $s->booking->customer?->vip,
                'adults' => $s->adults, 'children' => $s->children, 'check_in' => $s->check_in->toDateString(), 'check_out' => $s->check_out->toDateString(),
                'checked_in_at' => $s->checked_in_at?->toIso8601String(),
                'balance' => $showBalance ? ($balances[$s->booking_id] ?? 0) : null,
            ] : null;
            $task = $tasks->get($room->id);
            return [
                'id' => $room->id, 'number' => $room->number, 'floor_id' => $room->floor_id, 'room_type_id' => $room->room_type_id,
                'type_name' => $room->type->name, 'type_code' => $room->type->code,
                'wing' => $room->wing, 'map_x' => $room->map_x, 'map_y' => $room->map_y, 'map_w' => $room->map_w, 'map_h' => $room->map_h,
                'door_side' => $room->door_side, 'notes' => $room->notes,
                'housekeeping' => $room->housekeeping, 'housekeeping_label' => HousekeepingService::LABELS[$room->housekeeping],
                'availability' => $availability, 'block' => $block ? ['id' => $block->id, 'reason' => $block->reason,
                    'start' => $block->start_date->toDateString(), 'end' => $block->end_date->toDateString()] : null,
                'occupancy' => $occupancy,
                'current' => $card($inHouse ?? $departing),
                'departing' => $card($departing),
                'arriving' => $card($arriving),
                'next' => $card($next),
                'task' => $task ? ['id' => $task->id, 'status' => $task->status, 'assignee' => $task->assignee?->name] : null,
            ];
        });

        return [
            'date' => $date,
            'is_today' => $isToday,
            'summary' => $summary,
            'floors' => Floor::where('property_id', $this->pid())->orderBy('level')->get(),
            'room_types' => RoomType::where('property_id', $this->pid())->orderBy('sort')->get(['id', 'name', 'code']),
            'rooms' => $out,
            'show_balance' => $showBalance,
        ];
    }

    public function calendar(Request $request, FolioService $folios, AvailabilityService $availability)
    {
        $availability->releaseExpiredHolds();
        $data = $request->validate(['from' => 'required|date_format:Y-m-d', 'to' => 'required|date_format:Y-m-d|after_or_equal:from']);
        abort_if(CarbonImmutable::parse($data['from'])->diffInDays(CarbonImmutable::parse($data['to'])) > 62, 422, 'Tối đa 62 ngày mỗi lần xem.');
        $rooms = Room::with('type:id,name,code', 'floor:id,name,level')->where('property_id', $this->pid())->whereNull('archived_at')
            ->orderBy('sort')->orderBy('number')->get(['id', 'number', 'room_type_id', 'floor_id', 'housekeeping', 'sort']);

        // Gom các đêm liên tiếp cùng (phòng, lượt ở) thành một thanh
        $nights = DB::table('room_nights')->whereIn('room_id', $rooms->pluck('id'))->whereNotNull('stay_id')
            ->whereBetween('night', [$data['from'], $data['to']])->orderBy('room_id')->orderBy('stay_id')->orderBy('night')->get();
        $stays = Stay::with('booking:id,code,status,customer_id', 'booking.customer:id,full_name,vip')->whereIn('id', $nights->pluck('stay_id')->unique())->get()->keyBy('id');
        $showBalance = $this->allowed('balance.view');
        $balances = $showBalance ? $folios->balances($stays->pluck('booking_id')->unique()->values()->all()) : [];
        $segments = [];
        $current = null;
        foreach ($nights as $n) {
            $next = CarbonImmutable::parse($n->night)->addDay()->toDateString();
            if ($current && $current['room_id'] === $n->room_id && $current['stay_id'] === $n->stay_id && $current['end'] === $n->night) {
                $current['end'] = $next;
                continue;
            }
            if ($current) $segments[] = $current;
            $current = ['room_id' => $n->room_id, 'stay_id' => $n->stay_id, 'start' => $n->night, 'end' => $next];
        }
        if ($current) $segments[] = $current;
        $segments = array_map(function ($seg) use ($stays, $balances, $showBalance) {
            $s = $stays[$seg['stay_id']];
            return $seg + ['booking_id' => $s->booking_id, 'code' => $s->booking->code, 'status' => $s->status, 'guest' => $s->booking->customer?->full_name,
                'vip' => (bool) $s->booking->customer?->vip, 'adults' => $s->adults, 'children' => $s->children,
                'check_in' => $s->check_in->toDateString(), 'check_out' => $s->check_out->toDateString(),
                'balance' => $showBalance ? ($balances[$s->booking_id] ?? 0) : null];
        }, $segments);

        $blocks = RoomBlock::whereIn('room_id', $rooms->pluck('id'))->where('start_date', '<=', $data['to'])->where('end_date', '>', $data['from'])
            ->where(fn ($q) => $q->whereNull('released_at')->orWhereColumn('end_date', '>', 'start_date'))
            ->get(['id', 'room_id', 'type', 'start_date', 'end_date', 'reason', 'released_at']);

        return ['from' => $data['from'], 'to' => $data['to'], 'today' => Context::today()->toDateString(),
            'rooms' => $rooms, 'segments' => $segments, 'blocks' => $blocks, 'show_balance' => $showBalance];
    }
}
