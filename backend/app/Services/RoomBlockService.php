<?php
namespace App\Services;

use App\Models\Room;
use App\Models\RoomBlock;
use Illuminate\Support\Facades\DB;

/** Bảo trì / ngừng bán theo khoảng ngày. Khoảng chặn giữ room_nights nên không thể bán chồng. */
class RoomBlockService
{
    public const LABELS = ['active' => 'Hoạt động', 'maintenance' => 'Bảo trì', 'out_of_service' => 'Ngừng bán'];

    public function __construct(private AvailabilityService $availability) {}

    public function create(Room $room, string $type, string $start, string $end, string $reason): RoomBlock
    {
        abort_unless(in_array($type, ['maintenance', 'out_of_service'], true), 422, 'Loại chặn không hợp lệ.');
        abort_if($end <= $start, 422, 'Ngày kết thúc phải sau ngày bắt đầu.');
        abort_if($start < Context::today()->toDateString(), 422, 'Không chặn ngày trong quá khứ.');
        return DB::transaction(function () use ($room, $type, $start, $end, $reason) {
            $nights = AvailabilityService::nights($start, $end);
            $conflict = DB::table('room_nights')->join('stays', 'stays.id', '=', 'room_nights.stay_id')
                ->join('bookings', 'bookings.id', '=', 'stays.booking_id')
                ->where('room_nights.room_id', $room->id)->whereIn('room_nights.night', $nights)
                ->distinct()->pluck('bookings.code')->all();
            abort_if($conflict, 409, 'Phòng đang có đặt phòng trong khoảng này: '.implode(', ', $conflict).'. Chuyển phòng cho khách trước khi chặn.');
            $block = RoomBlock::create(['room_id' => $room->id, 'type' => $type, 'start_date' => $start, 'end_date' => $end,
                'reason' => $reason, 'created_by' => auth()->id()]);
            $this->availability->reserve($room->id, $nights, null, $block->id);
            Audit::log('room.block', $room, self::LABELS[$type]." phòng {$room->number} từ ".date('d/m', strtotime($start)).' đến '.date('d/m', strtotime($end)), $reason);
            return $block;
        });
    }

    /** Mở bán lại từ hôm nay (giữ lịch sử các đêm đã chặn trong quá khứ). */
    public function release(RoomBlock $block, string $reason): RoomBlock
    {
        return DB::transaction(function () use ($block, $reason) {
            abort_if($block->released_at, 409, 'Khoảng chặn đã được mở trước đó.');
            $today = Context::today()->toDateString();
            DB::table('room_nights')->where('room_block_id', $block->id)->where('night', '>=', $today)->delete();
            $block->update(['released_at' => now(), 'released_by' => auth()->id(),
                'end_date' => max($block->start_date->toDateString(), min($block->end_date->toDateString(), $today))]);
            Audit::log('room.unblock', $block->room, "Mở bán lại phòng {$block->room->number}", $reason);
            return $block;
        });
    }

    /** Trạng thái khả năng sử dụng của phòng vào một ngày. */
    public static function availabilityOn(int $roomId, string $date): array
    {
        $block = RoomBlock::where('room_id', $roomId)->whereNull('released_at')
            ->where('start_date', '<=', $date)->where('end_date', '>', $date)->first();
        return $block ? ['status' => $block->type, 'block' => $block] : ['status' => 'active', 'block' => null];
    }
}
