<?php
namespace App\Services;

use App\Models\Booking;
use App\Models\Room;
use App\Models\RoomType;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Tồn phòng dùng chung cho admin và website.
 *
 * Quy ước khoảng lưu trú: [check_in, check_out) — đêm của ngày trả phòng không thuộc lượt ở,
 * nên khách trước trả và khách sau nhận cùng ngày không xung đột về tồn.
 * Mỗi cặp (phòng, đêm) là khóa chính của room_nights: hai giao dịch đồng thời không thể
 * cùng giữ một phòng-đêm, kể cả trên MySQL hay SQLite. Lần ghi thứ hai nhận lỗi và được báo xung đột.
 */
class AvailabilityService
{
    /** @return string[] danh sách đêm Y-m-d */
    public static function nights(string $checkIn, string $checkOut): array
    {
        $out = [];
        for ($d = CarbonImmutable::parse($checkIn); $d < CarbonImmutable::parse($checkOut); $d = $d->addDay()) {
            $out[] = $d->toDateString();
        }
        return $out;
    }

    /** Giữ các đêm cho một lượt ở hoặc khoảng chặn. Ném 409 nếu bất kỳ đêm nào đã bị giữ. */
    public function reserve(int $roomId, array $nights, ?int $stayId = null, ?int $blockId = null): void
    {
        if (!$nights) return;
        $taken = DB::table('room_nights')->where('room_id', $roomId)->whereIn('night', $nights)->pluck('night')->all();
        if ($taken) {
            $number = Room::whereKey($roomId)->value('number');
            abort(409, "Phòng $number đã có lượt ở hoặc lịch chặn vào đêm ".implode(', ', array_map(fn ($n) => date('d/m', strtotime($n)), $taken)).'.');
        }
        try {
            DB::table('room_nights')->insert(array_map(fn ($n) => [
                'room_id' => $roomId, 'night' => $n, 'stay_id' => $stayId, 'room_block_id' => $blockId,
            ], $nights));
        } catch (QueryException $e) {
            if ($this->isUniqueViolation($e)) {
                abort(409, 'Phòng vừa được người khác giữ trong khoảng ngày này. Vui lòng chọn lại.');
            }
            throw $e;
        }
    }

    public function release(int $stayId, ?string $fromNight = null): void
    {
        DB::table('room_nights')->where('stay_id', $stayId)
            ->when($fromNight, fn ($q) => $q->where('night', '>=', $fromNight))->delete();
    }

    public function isUniqueViolation(QueryException $e): bool
    {
        $code = (string) ($e->errorInfo[0] ?? $e->getCode());
        $message = $e->getMessage();
        return $code === '23000' || $code === '23505' || str_contains($message, 'UNIQUE constraint failed') || str_contains($message, 'Duplicate entry');
    }

    /** Phòng của một loại còn trống trọn khoảng ngày. */
    public function freeRooms(int $roomTypeId, string $checkIn, string $checkOut, ?int $exceptStayId = null): Collection
    {
        return Room::sellable()->where('room_type_id', $roomTypeId)
            ->whereNotExists(fn ($q) => $q->from('room_nights')->whereColumn('room_nights.room_id', 'rooms.id')
                ->where('night', '>=', $checkIn)->where('night', '<', $checkOut)
                ->when($exceptStayId, fn ($q) => $q->where(fn ($q) => $q->whereNull('stay_id')->orWhere('stay_id', '!=', $exceptStayId))))
            ->orderBy('sort')->orderBy('number')->get();
    }

    public function isRoomFree(int $roomId, string $checkIn, string $checkOut, ?int $exceptStayId = null): bool
    {
        return !DB::table('room_nights')->where('room_id', $roomId)
            ->where('night', '>=', $checkIn)->where('night', '<', $checkOut)
            ->when($exceptStayId, fn ($q) => $q->where(fn ($q) => $q->whereNull('stay_id')->orWhere('stay_id', '!=', $exceptStayId)))
            ->exists();
    }

    /** Số phòng trống theo loại cho khoảng ngày (dùng cho cả website và admin). */
    public function byType(int $propertyId, string $checkIn, string $checkOut, bool $publicOnly = false): Collection
    {
        $this->releaseExpiredHolds();
        return RoomType::where('property_id', $propertyId)->where('active', true)
            ->when($publicOnly, fn ($q) => $q->where('public', true))->orderBy('sort')->get()
            ->map(fn (RoomType $t) => ['type' => $t, 'available' => $this->freeRooms($t->id, $checkIn, $checkOut)->count()]);
    }

    /**
     * Hủy giữ chỗ quá hạn và giải phóng tồn. Chạy theo lịch (hotel:release-holds)
     * và trước mỗi lần tra tồn/tạo đặt phòng để không phụ thuộc cron.
     */
    public function releaseExpiredHolds(): int
    {
        $ids = Booking::where('status', 'hold')->whereNotNull('hold_expires_at')->where('hold_expires_at', '<', now())->pluck('id');
        $released = 0;
        foreach ($ids as $id) {
            DB::transaction(function () use ($id, &$released) {
                $booking = Booking::whereKey($id)->lockForUpdate()->first();
                if (!$booking || $booking->status !== 'hold' || !$booking->hold_expires_at?->isPast()) return;
                foreach ($booking->stays()->where('status', 'hold')->get() as $stay) {
                    $this->release($stay->id);
                    $stay->update(['status' => 'cancelled']);
                    $stay->nights()->update(['void' => true, 'void_reason' => 'Hết hạn giữ chỗ']);
                }
                $booking->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => 'Hết hạn giữ chỗ, hệ thống tự giải phóng']);
                Audit::log('booking.hold_expired', $booking, "Đặt phòng {$booking->code} hết hạn giữ chỗ, tồn đã được giải phóng");
                $released++;
            });
        }
        return $released;
    }
}
