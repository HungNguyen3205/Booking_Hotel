<?php
namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Room;
use App\Services\BookingService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BookingController
{
    public function rooms(Request $request)
    {
        $query = Room::where('active', true)->orderBy('price');
        if ($request->hasAny(['check_in', 'check_out', 'guests'])) {
            $data = $this->stay($request);
            $reserved = DB::table('room_nights')->select('room_id')
                ->where('night', '>=', $data['check_in'])->where('night', '<', $data['check_out']);
            $query->where('capacity', '>=', $data['guests'])->whereNotIn('id', $reserved);
        }
        return $query->get(['id', 'name', 'description', 'image', 'price', 'capacity', 'area', 'bed']);
    }

    public function store(Request $request, BookingService $service)
    {
        $data = $this->stay($request) + $request->validate([
            'room_id' => 'required|integer|min:1',
            'quoted_rate' => 'required|integer|min:1',
            'request_key' => 'required|uuid',
            'guest_name' => 'required|string|max:120',
            'email' => 'required|email|max:200',
            'phone' => ['required', 'string', 'regex:/^[+0-9 .()\-]{7,25}$/'],
        ]);
        return response()->json($this->summary($service->create($data)), 201);
    }

    public function lookup(Request $request)
    {
        $data = $request->validate(['code' => 'required|string|max:32', 'email' => 'required|email|max:200']);
        $booking = Booking::where('code', strtoupper($data['code']))->whereRaw('lower(email) = ?', [strtolower($data['email'])])->first();
        abort_unless($booking, 404, 'Không tìm thấy đơn với mã và email đã nhập.');
        return $this->summary($booking);
    }

    private function stay(Request $request): array
    {
        $data = $request->validate([
            'check_in' => 'required|date_format:Y-m-d|after_or_equal:today',
            'check_out' => 'required|date_format:Y-m-d|after:check_in',
            'guests' => 'required|integer|between:1,12',
        ], [
            'check_in.after_or_equal' => 'Ngày nhận phòng phải từ hôm nay.',
            'check_out.after' => 'Ngày trả phòng phải sau ngày nhận phòng.',
        ]);
        if (CarbonImmutable::parse($data['check_in'])->diffInDays(CarbonImmutable::parse($data['check_out'])) > 30) {
            throw ValidationException::withMessages(['check_out' => 'Mỗi đơn tối đa 30 đêm.']);
        }
        return $data;
    }

    private function summary(Booking $booking): array
    {
        return $booking->only(['code', 'check_in', 'check_out', 'guests', 'total', 'status', 'paid_at'])
            + ['room_name' => $booking->room->name];
    }
}
