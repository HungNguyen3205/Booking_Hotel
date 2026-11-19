<?php
namespace App\Services;

use App\Models\HousekeepingTask;
use App\Models\Room;
use Illuminate\Support\Facades\DB;

/** Buồng phòng: Bẩn → Đang dọn → Chờ kiểm tra → Sạch. Độc lập với trạng thái lưu trú. */
class HousekeepingService
{
    public const LABELS = ['dirty' => 'Bẩn', 'cleaning' => 'Đang dọn', 'inspecting' => 'Chờ kiểm tra', 'clean' => 'Sạch'];
    public const CHECKLIST = ['Thay ga, gối, chăn', 'Vệ sinh phòng tắm', 'Lau bụi, hút bụi sàn', 'Bổ sung đồ dùng một lần',
        'Kiểm tra minibar', 'Kiểm tra thiết bị (đèn, điều hòa, TV)', 'Đổ rác'];

    public function markDirty(Room $room, ?int $stayId, string $type, string $note): HousekeepingTask
    {
        $room->update(['housekeeping' => 'dirty']);
        $open = HousekeepingTask::where('room_id', $room->id)->whereIn('status', ['open', 'in_progress', 'inspecting'])->first();
        if ($open) {
            $open->update(['status' => 'open', 'stay_id' => $stayId ?? $open->stay_id, 'note' => $note]);
            return $open;
        }
        $task = HousekeepingTask::create([
            'room_id' => $room->id, 'stay_id' => $stayId, 'type' => $type, 'status' => 'open', 'priority' => $type === 'departure' ? 'high' : 'normal',
            'checklist' => array_map(fn ($label) => ['label' => $label, 'done' => false], self::CHECKLIST), 'note' => $note,
        ]);
        if (Settings::value('automation', 'auto_assign_housekeeping', $room->property_id)) {
            app(AutomationService::class)->assignOpenTasks($room->property_id);
        }
        return $task->refresh();
    }

    public function assign(HousekeepingTask $task, ?int $userId): HousekeepingTask
    {
        $task->update(['assigned_to' => $userId]);
        Audit::log('housekeeping.assign', $task->room, "Giao việc dọn phòng {$task->room->number}");
        return $task;
    }

    public function start(HousekeepingTask $task): HousekeepingTask
    {
        return DB::transaction(function () use ($task) {
            $task = HousekeepingTask::whereKey($task->id)->lockForUpdate()->firstOrFail();
            abort_unless($task->status === 'open', 409, 'Việc không ở trạng thái chờ dọn.');
            $task->update(['status' => 'in_progress', 'started_at' => now(), 'assigned_to' => $task->assigned_to ?? auth()->id()]);
            $task->room->update(['housekeeping' => 'cleaning']);
            return $task;
        });
    }

    public function finish(HousekeepingTask $task, ?array $checklist, ?string $note): HousekeepingTask
    {
        return DB::transaction(function () use ($task, $checklist, $note) {
            $task = HousekeepingTask::whereKey($task->id)->lockForUpdate()->firstOrFail();
            abort_unless($task->status === 'in_progress', 409, 'Bắt đầu dọn trước khi hoàn thành.');
            if ($checklist !== null) {
                abort_if(collect($checklist)->contains(fn ($i) => empty($i['done'])), 422, 'Hoàn thành đủ checklist trước khi báo xong.');
            }
            $inspect = (bool) Settings::value('booking', 'require_inspection');
            $task->update(['status' => $inspect ? 'inspecting' : 'done', 'finished_at' => now(), 'checklist' => $checklist ?? $task->checklist,
                'note' => $note ?? $task->note]);
            $task->room->update(['housekeeping' => $inspect ? 'inspecting' : 'clean']);
            Audit::log('housekeeping.finish', $task->room, "Dọn xong phòng {$task->room->number}".($inspect ? ', chờ kiểm tra' : ''));
            return $task;
        });
    }

    public function inspect(HousekeepingTask $task, bool $passed, ?string $note): HousekeepingTask
    {
        return DB::transaction(function () use ($task, $passed, $note) {
            $task = HousekeepingTask::whereKey($task->id)->lockForUpdate()->firstOrFail();
            abort_unless($task->status === 'inspecting', 409, 'Phòng chưa ở bước chờ kiểm tra.');
            abort_if(!$passed && !$note, 422, 'Ghi rõ điểm chưa đạt.');
            $task->update(['status' => $passed ? 'done' : 'open', 'inspected_by' => auth()->id(), 'inspected_at' => now(), 'note' => $note ?? $task->note]);
            $task->room->update(['housekeeping' => $passed ? 'clean' : 'dirty']);
            Audit::log('housekeeping.inspect', $task->room, "Kiểm tra phòng {$task->room->number}: ".($passed ? 'đạt, sẵn sàng bán' : 'chưa đạt'), $note);
            return $task;
        });
    }

    /** Đặt trạng thái buồng trực tiếp (quản lý). */
    public function setStatus(Room $room, string $status, string $reason): Room
    {
        abort_unless(array_key_exists($status, self::LABELS), 422, 'Trạng thái buồng không hợp lệ.');
        $from = $room->housekeeping;
        $room->update(['housekeeping' => $status]);
        if ($status === 'dirty') {
            $this->markDirty($room, null, 'stayover', $reason);
        } elseif ($status === 'clean') {
            HousekeepingTask::where('room_id', $room->id)->whereIn('status', ['open', 'in_progress', 'inspecting'])
                ->update(['status' => 'done', 'inspected_by' => auth()->id(), 'inspected_at' => now(), 'note' => 'Quản lý đặt Sạch: '.$reason]);
        }
        Audit::log('housekeeping.set_status', $room, "Phòng {$room->number}: ".self::LABELS[$from].' → '.self::LABELS[$status], $reason);
        return $room;
    }
}
