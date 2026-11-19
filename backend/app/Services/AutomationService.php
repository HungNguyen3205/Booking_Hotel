<?php
namespace App\Services;

use App\Models\Booking;
use App\Models\HousekeepingTask;
use App\Models\Property;
use App\Models\Room;
use App\Models\Stay;
use App\Models\StaffShift;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Tự động hóa vận hành để chủ khách sạn thao tác ít nhất.
 *
 * Chạy mỗi ngày một lần ("kiểm toán đêm"): theo lịch `hotel:daily` và tự kích hoạt khi có người mở
 * Tổng quan/Sơ đồ (không phụ thuộc cron). Mỗi việc bật/tắt được ở Cấu hình → Tự động hóa.
 * Mọi việc hệ thống tự làm đều ghi nhật ký với người thực hiện = "Hệ thống".
 */
class AutomationService
{
    public function __construct(
        private AvailabilityService $availability,
        private BookingService $bookings,
        private HousekeepingService $housekeeping,
    ) {}

    /** Gọi nhẹ ở mỗi lần mở màn hình vận hành: chỉ chạy nếu hôm nay chưa chạy. */
    public function ensureDaily(?Property $property = null): ?array
    {
        $property ??= Context::property();
        $today = Context::today()->toDateString();
        if ((Settings::get('automation_state', $property->id)['last_daily'] ?? null) === $today) return null;
        $lock = Cache::lock("automation:daily:{$property->id}", 120);
        if (!$lock->get()) return null;
        try {
            if ((Settings::get('automation_state', $property->id)['last_daily'] ?? null) === $today) return null;
            return $this->runDaily($property);
        } finally {
            $lock->release();
        }
    }

    public function runDaily(Property $property): array
    {
        return Audit::asSystem(fn () => $this->doDaily($property));
    }

    private function doDaily(Property $property): array
    {
        Context::set($property);
        $cfg = Settings::get('automation', $property->id);
        $today = Context::today()->toDateString();
        $done = ['date' => $today, 'holds_released' => 0, 'no_shows' => 0, 'stayover_tasks' => 0, 'assigned' => 0, 'errors' => []];

        $done['holds_released'] = $this->availability->releaseExpiredHolds();

        if ($cfg['auto_no_show']) {
            $ids = Stay::whereHas('booking', fn ($q) => $q->where('property_id', $property->id))
                ->where('status', 'confirmed')->where('check_in', '<', $today)->distinct()->pluck('booking_id');
            foreach (Booking::whereIn('id', $ids)->get() as $b) {
                try {
                    $stayIds = $b->stays()->where('status', 'confirmed')->where('check_in', '<', $today)->pluck('id')->all();
                    $this->bookings->cancel($b, 'Tự động: quá ngày nhận phòng mà khách chưa đến', $stayIds, (bool) $cfg['no_show_charge_fee'], 'no_show');
                    $done['no_shows'] += count($stayIds);
                } catch (Throwable $e) {
                    $done['errors'][] = "Không đến {$b->code}: ".$e->getMessage();
                }
            }
        }

        if ($cfg['daily_stayover_cleaning']) {
            $stays = Stay::with('room')->whereHas('booking', fn ($q) => $q->where('property_id', $property->id))
                ->where('status', 'checked_in')->where('check_in', '<', $today)->where('check_out', '>', $today)->get();
            foreach ($stays as $s) {
                if (!$s->room || HousekeepingTask::where('room_id', $s->room_id)->whereIn('status', ['open', 'in_progress', 'inspecting'])->exists()) continue;
                $this->housekeeping->markDirty($s->room, $s->id, 'stayover', 'Tự động: dọn phòng khách đang ở hằng ngày');
                $done['stayover_tasks']++;
            }
        }

        if ($cfg['auto_assign_housekeeping']) {
            $done['assigned'] = $this->assignOpenTasks($property->id);
        }

        Settings::put('automation_state', ['last_daily' => $today, 'last_result' => $done], $property->id);
        Audit::log('automation.daily', null, sprintf('Hệ thống tự chạy cuối ngày: giải phóng %d giữ chỗ, %d lượt không đến, %d việc dọn phòng ở, giao %d việc',
            $done['holds_released'], $done['no_shows'], $done['stayover_tasks'], $done['assigned']), null, $done);
        return $done;
    }

    /** Nhân viên buồng phòng trong ca hôm nay (theo phân ca); không có phân ca thì mọi nhân viên buồng phòng đang hoạt động. */
    public function housekeepers(int $propertyId): array
    {
        $base = User::where('active', true)->where('role', 'housekeeping')->whereHas('properties', fn ($q) => $q->where('properties.id', $propertyId));
        $onShift = StaffShift::where('property_id', $propertyId)->where('work_date', Context::today()->toDateString())->pluck('user_id');
        $ids = (clone $base)->whereIn('id', $onShift)->pluck('id')->all();
        return $ids ?: $base->pluck('id')->all();
    }

    /** Giao đều việc chưa có người nhận cho nhân viên đang ít việc nhất. */
    public function assignOpenTasks(int $propertyId): int
    {
        $staff = $this->housekeepers($propertyId);
        if (!$staff) return 0;
        $load = [];
        foreach ($staff as $id) {
            $load[$id] = HousekeepingTask::where('assigned_to', $id)->whereIn('status', ['open', 'in_progress', 'inspecting'])->count();
        }
        $tasks = HousekeepingTask::whereNull('assigned_to')->where('status', 'open')
            ->whereIn('room_id', Room::where('property_id', $propertyId)->pluck('id'))->orderBy('id')->get();
        foreach ($tasks as $task) {
            asort($load);
            $userId = array_key_first($load);
            $task->update(['assigned_to' => $userId]);
            $load[$userId]++;
        }
        if ($tasks->count()) {
            Audit::asSystem(fn () => Audit::log('automation.assign', null, "Hệ thống tự giao {$tasks->count()} việc dọn phòng cho nhân viên buồng phòng"));
        }
        return $tasks->count();
    }
}
