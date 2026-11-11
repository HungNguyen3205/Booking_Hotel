<?php
namespace App\Services;

use App\Models\Booking;
use App\Models\Room;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BookingService
{
    public const TRANSITIONS = [
        'pending' => ['confirmed', 'cancelled'],
        'confirmed' => ['checked_in', 'cancelled'],
        'checked_in' => ['checked_out'],
        'checked_out' => [],
        'cancelled' => [],
    ];

    public function create(array $data): Booking
    {
        $hash = hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
        return DB::transaction(function () use ($data, $hash) {
            $existing = Booking::where('request_key', $data['request_key'])->first();
            if ($existing) {
                abort_unless(hash_equals($existing->request_hash, $hash), 409, 'Yêu cầu đã được dùng cho thông tin đặt phòng khác.');
                return $existing;
            }

            $room = Room::find($data['room_id']);
            abort_unless($room?->active && $room->capacity >= $data['guests'], 409, 'Phòng đã ngừng nhận khách hoặc không đủ sức chứa.');
            abort_unless($room->price === (int) $data['quoted_rate'], 409, 'Giá phòng đã thay đổi. Vui lòng tìm phòng lại để xem giá mới.');
            abort_if(DB::table('room_nights')->where('room_id', $room->id)
                ->where('night', '>=', $data['check_in'])->where('night', '<', $data['check_out'])->exists(),
                409, 'Phòng vừa được đặt trong khoảng ngày này.');

            $arrival = CarbonImmutable::parse($data['check_in']);
            $departure = CarbonImmutable::parse($data['check_out']);
            unset($data['quoted_rate']);
            $booking = Booking::create($data + [
                'code' => 'HR-'.strtoupper(Str::random(12)),
                'request_hash' => $hash,
                'nightly_rate' => $room->price,
                'total' => (int) $arrival->diffInDays($departure) * $room->price,
                'status' => 'pending',
            ]);

            $nights = [];
            for ($night = $arrival; $night < $departure; $night = $night->addDay()) {
                $nights[] = ['room_id' => $room->id, 'booking_id' => $booking->id, 'night' => $night->toDateString()];
            }
            DB::table('room_nights')->insert($nights);
            return $booking;
        });
    }

    public function transition(int $id, string $status): Booking
    {
        return DB::transaction(function () use ($id, $status) {
            $booking = Booking::findOrFail($id);
            if ($booking->status === $status) {
                return $booking;
            }
            abort_unless(in_array($status, self::TRANSITIONS[$booking->status], true), 409, 'Không thể chuyển sang trạng thái này.');
            abort_if($status === 'checked_in' && ($booking->check_in > today()->toDateString()
                || $booking->check_out <= today()->toDateString()), 409, 'Chỉ nhận phòng trong thời gian lưu trú.');
            abort_if($status === 'checked_out' && !$booking->paid_at, 409, 'Ghi nhận thanh toán trước khi trả phòng.');
            abort_if($status === 'cancelled' && $booking->paid_at, 409, 'Đơn đã thu tiền. Vui lòng xử lý với quản lý.');
            $booking->update(['status' => $status]);
            if ($status === 'cancelled' || $status === 'checked_out') {
                DB::table('room_nights')->where('booking_id', $id)->delete();
            }
            return $booking;
        });
    }

    public function markPaid(int $id): Booking
    {
        return DB::transaction(function () use ($id) {
            $booking = Booking::findOrFail($id);
            abort_unless(in_array($booking->status, ['confirmed', 'checked_in'], true), 409, 'Đơn cần được xác nhận trước khi ghi nhận thu tiền.');
            if (!$booking->paid_at) {
                $booking->update(['paid_at' => now()]);
            }
            return $booking;
        });
    }
}
