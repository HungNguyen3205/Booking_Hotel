<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\HousekeepingTask;
use App\Models\LostItem;
use App\Models\MaintenanceTicket;
use App\Models\RoomBlock;
use App\Models\User;
use App\Services\Audit;
use App\Services\Context;
use App\Services\HousekeepingService;
use App\Services\RoomBlockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HousekeepingController extends Controller
{
    public function __construct(private HousekeepingService $hk) {}

    public function tasks(Request $request)
    {
        $mine = $request->boolean('mine');
        return [
            'tasks' => HousekeepingTask::with('room:id,number,floor_id,housekeeping', 'room.floor:id,name', 'assignee:id,name')
                ->whereHas('room', fn ($q) => $q->where('property_id', $this->pid()))
                ->when($mine, fn ($q) => $q->where('assigned_to', auth()->id()))
                ->where(fn ($q) => $q->whereIn('status', ['open', 'in_progress', 'inspecting'])->orWhere('updated_at', '>=', Context::today()))
                ->orderByRaw("CASE status WHEN 'inspecting' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'open' THEN 2 ELSE 3 END")->orderBy('id')->get(),
            'staff' => User::where('active', true)->whereIn('role', ['housekeeping', 'technician', 'manager', 'owner'])
                ->whereHas('properties', fn ($q) => $q->where('properties.id', $this->pid()))->get(['id', 'name', 'role']),
            'labels' => HousekeepingService::LABELS,
        ];
    }

    public function assign(Request $request, int $id)
    {
        $d = $request->validate(['user_id' => 'nullable|integer|exists:users,id']);
        return $this->hk->assign($this->task($id), $d['user_id'] ?? null);
    }

    public function start(int $id)
    {
        $task = $this->task($id);
        $this->ensureOwnOrManager($task);
        return $this->hk->start($task);
    }

    public function finish(Request $request, int $id)
    {
        $task = $this->task($id);
        $this->ensureOwnOrManager($task);
        $d = $request->validate(['checklist' => 'nullable|array', 'checklist.*.label' => 'required|string|max:120', 'checklist.*.done' => 'boolean',
            'note' => 'nullable|string|max:500']);
        return $this->hk->finish($task, $d['checklist'] ?? null, $d['note'] ?? null);
    }

    public function inspect(Request $request, int $id)
    {
        $d = $request->validate(['passed' => 'required|boolean', 'note' => 'nullable|string|max:500']);
        return $this->hk->inspect($this->task($id), $d['passed'], $d['note'] ?? null);
    }

    public function setStatus(Request $request, int $roomId)
    {
        $d = $request->validate(['status' => 'required|in:dirty,cleaning,inspecting,clean', 'reason' => 'required|string|min:3|max:300']);
        return $this->hk->setStatus($this->room($roomId), $d['status'], $d['reason']);
    }

    // ---- Bảo trì / ngừng bán ----
    public function tickets()
    {
        return MaintenanceTicket::with('room:id,number', 'assignee:id,name', 'reporter:id,name', 'block')
            ->where('property_id', $this->pid())
            ->orderByRaw("CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END")->latest('id')->limit(200)->get();
    }

    public function report(Request $request, RoomBlockService $blocks)
    {
        $d = $request->validate(['room_id' => 'nullable|integer', 'title' => 'required|string|max:200', 'description' => 'nullable|string|max:2000',
            'severity' => 'nullable|in:low,normal,high', 'block' => 'boolean', 'block_type' => 'nullable|in:maintenance,out_of_service',
            'block_start' => 'nullable|date_format:Y-m-d', 'block_end' => 'nullable|date_format:Y-m-d']);
        $room = !empty($d['room_id']) ? $this->room($d['room_id']) : null;
        return DB::transaction(function () use ($d, $room, $blocks) {
            $block = null;
            if (!empty($d['block'])) {
                abort_unless($room, 422, 'Chọn phòng cần chặn.');
                abort_unless($this->allowed('maintenance.manage'), 403, 'Không có quyền chặn phòng bảo trì.');
                $block = $blocks->create($room, $d['block_type'] ?? 'maintenance', $d['block_start'] ?? Context::today()->toDateString(),
                    $d['block_end'] ?? Context::today()->addDay()->toDateString(), $d['title']);
            }
            $ticket = MaintenanceTicket::create(['property_id' => $this->pid(), 'room_id' => $room?->id, 'title' => $d['title'], 'description' => $d['description'] ?? null,
                'severity' => $d['severity'] ?? 'normal', 'room_block_id' => $block?->id, 'reported_by' => auth()->id()]);
            Audit::log('maintenance.report', $ticket, 'Báo hỏng'.($room ? " phòng {$room->number}" : '').": {$d['title']}");
            return $ticket->load('room:id,number', 'block');
        });
    }

    public function updateTicket(Request $request, int $id, RoomBlockService $blocks)
    {
        $t = MaintenanceTicket::where('property_id', $this->pid())->findOrFail($id);
        $d = $request->validate(['status' => 'required|in:open,in_progress,resolved,cancelled', 'assigned_to' => 'nullable|integer|exists:users,id',
            'resolution' => 'nullable|string|max:500', 'release_block' => 'boolean']);
        abort_if(in_array($d['status'], ['resolved', 'cancelled'], true) && empty($d['resolution']), 422, 'Ghi kết quả xử lý.');
        return DB::transaction(function () use ($t, $d, $blocks) {
            $t->update(['status' => $d['status'], 'assigned_to' => $d['assigned_to'] ?? $t->assigned_to, 'resolution' => $d['resolution'] ?? $t->resolution,
                'resolved_at' => $d['status'] === 'resolved' ? now() : null]);
            if (!empty($d['release_block']) && $t->room_block_id && ($block = RoomBlock::find($t->room_block_id)) && !$block->released_at) {
                $blocks->release($block, 'Hoàn tất sửa chữa: '.($d['resolution'] ?? ''));
            }
            Audit::log('maintenance.update', $t, "Cập nhật sự cố #{$t->id}: {$d['status']}", $d['resolution'] ?? null);
            return $t->load('room:id,number', 'block');
        });
    }

    // ---- Đồ thất lạc ----
    public function lostItems()
    {
        return LostItem::with('room:id,number')->where('property_id', $this->pid())->latest('id')->limit(200)->get();
    }

    public function storeLost(Request $request)
    {
        $d = $request->validate(['room_id' => 'nullable|integer', 'description' => 'required|string|max:300', 'note' => 'nullable|string|max:500']);
        if (!empty($d['room_id'])) $this->room($d['room_id']);
        $item = LostItem::create($d + ['property_id' => $this->pid(), 'found_by' => auth()->id(), 'found_at' => now()]);
        Audit::log('lost.create', $item, 'Ghi nhận đồ thất lạc: '.$d['description']);
        return $item;
    }

    public function updateLost(Request $request, int $id)
    {
        $d = $request->validate(['status' => 'required|in:stored,returned,disposed', 'note' => 'required|string|max:500']);
        $item = LostItem::where('property_id', $this->pid())->findOrFail($id);
        $item->update($d);
        Audit::log('lost.update', $item, 'Cập nhật đồ thất lạc', $d['note']);
        return $item;
    }

    private function task(int $id): HousekeepingTask
    {
        return HousekeepingTask::whereHas('room', fn ($q) => $q->where('property_id', $this->pid()))->findOrFail($id);
    }

    private function ensureOwnOrManager(HousekeepingTask $task): void
    {
        abort_unless($this->allowed('housekeeping.manage') || ($this->allowed('housekeeping.work') && in_array($task->assigned_to, [null, auth()->id()], true)),
            403, 'Việc này đã giao cho nhân viên khác.');
    }
}
