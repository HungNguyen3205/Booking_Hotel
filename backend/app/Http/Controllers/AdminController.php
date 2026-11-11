<?php
namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Room;
use App\Models\User;
use App\Services\BookingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminController
{
    public function login(Request $request)
    {
        $credentials = $request->validate(['email' => 'required|email', 'password' => 'required|string|max:128']);
        $credentials['email'] = strtolower($credentials['email']);
        abort_unless(Auth::attempt($credentials), 422, 'Email hoặc mật khẩu chưa đúng.');
        $request->session()->regenerate();
        return ['user' => $request->user(), 'csrf' => csrf_token()];
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return response()->noContent();
    }

    public function dashboard()
    {
        $today = today()->toDateString();
        return [
            'rooms' => Room::where('active', true)->count(),
            'arrivals' => Booking::where('check_in', $today)->whereIn('status', ['pending', 'confirmed'])->count(),
            'occupied' => Booking::where('status', 'checked_in')->count(),
            'pending' => Booking::where('status', 'pending')->count(),
            'revenue' => Booking::whereBetween('paid_at', [today(), today()->endOfDay()])->sum('total'),
        ];
    }

    public function bookings(Request $request)
    {
        $data = $request->validate(['status' => ['nullable', Rule::in(array_keys(BookingService::TRANSITIONS))], 'q' => 'nullable|string|max:100']);
        return Booking::with('room:id,number,name')->latest('id')
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['q'] ?? null, fn ($query, $term) => $query->where(fn ($search) => $search
                ->where('code', 'like', "%$term%")->orWhere('guest_name', 'like', "%$term%")->orWhere('email', 'like', "%$term%")))
            ->paginate(20);
    }

    public function status(Request $request, int $id, BookingService $service)
    {
        $data = $request->validate(['status' => ['required', Rule::in(array_keys(BookingService::TRANSITIONS))]]);
        return $service->transition($id, $data['status']);
    }

    public function pay(int $id, BookingService $service)
    {
        return $service->markPaid($id);
    }

    public function rooms()
    {
        return Room::orderBy('number')->get();
    }

    public function saveRoom(Request $request, ?Room $room = null)
    {
        $number = Rule::unique('rooms', 'number');
        if ($room) {
            $number->ignore($room->id);
        }
        $data = $request->validate([
            'number' => ['required', 'string', 'max:20', $number],
            'name' => 'required|string|max:120',
            'description' => 'required|string|max:1500',
            'image' => ['nullable', 'string', 'max:255', 'regex:#^(https://[^\s]+|/images/[a-zA-Z0-9._-]+)$#'],
            'price' => 'required|integer|between:1,100000000',
            'capacity' => 'required|integer|between:1,12',
            'area' => 'required|integer|between:1,10000',
            'bed' => 'required|string|max:100',
            'active' => 'required|boolean',
        ]);
        return DB::transaction(function () use ($data, $room) {
            if (!$room) {
                return Room::create($data);
            }
            abort_if(Booking::where('room_id', $room->id)->whereIn('status', ['pending', 'confirmed', 'checked_in'])
                ->where('guests', '>', $data['capacity'])->exists(), 409, 'Sức chứa thấp hơn số khách trong đơn đang hoạt động.');
            $room->update($data);
            return $room;
        });
    }

    public function removeRoom(Room $room)
    {
        return DB::transaction(function () use ($room) {
            abort_if(Booking::where('room_id', $room->id)->whereIn('status', ['pending', 'confirmed', 'checked_in'])->exists(),
                409, 'Phòng còn đơn đang hoạt động. Hãy xử lý các đơn trước khi xóa.');
            $room->delete();
            return response()->noContent();
        });
    }

    public function staff()
    {
        return User::where('role', 'staff')->orderBy('name')->get();
    }

    public function saveStaff(Request $request, ?User $employee = null)
    {
        abort_if($employee && $employee->role !== 'staff', 404);
        $request->merge(['email' => strtolower((string) $request->input('email'))]);
        $email = Rule::unique('users', 'email');
        if ($employee) {
            $email->ignore($employee->id);
        }
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => ['required', 'email', 'max:200', $email],
            'password' => [$employee ? 'nullable' : 'required', 'string', 'min:12', 'max:72'],
        ]);
        if (empty($data['password'])) {
            unset($data['password']);
        }
        if (!$employee) {
            return User::create($data + ['role' => 'staff']);
        }
        DB::transaction(function () use ($employee, $data) {
            $employee->update($data);
            if (isset($data['password'])) {
                DB::table('sessions')->where('user_id', $employee->id)->delete();
            }
        });
        return $employee;
    }

    public function removeStaff(User $employee)
    {
        abort_unless($employee->role === 'staff', 404);
        DB::transaction(function () use ($employee) {
            DB::table('sessions')->where('user_id', $employee->id)->delete();
            $employee->delete();
        });
        return response()->noContent();
    }
}
