<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\StaffShift;
use App\Models\User;
use App\Services\Audit;
use App\Support\Permissions;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class StaffController extends Controller
{
    public function index()
    {
        return [
            'users' => User::with('roleModel:key,name')->whereHas('properties', fn ($q) => $q->where('properties.id', $this->pid()))
                ->orderBy('name')->get(['id', 'name', 'email', 'phone', 'role', 'active', 'last_login_at']),
            'roles' => Role::orderBy('name')->get(),
            'permission_groups' => Permissions::GROUPS,
        ];
    }

    public function store(Request $request)
    {
        $d = $request->validate(['name' => 'required|string|max:120', 'email' => 'required|email|max:200|unique:users,email',
            'phone' => 'nullable|string|max:40', 'role' => 'required|exists:roles,key', 'password' => ['required', Password::min(10)], 'active' => 'boolean']);
        $this->guardOwnerRole($d['role']);
        $d['email'] = strtolower($d['email']);
        $user = User::create($d);
        $user->properties()->attach($this->pid());
        Audit::log('staff.create', $user, "Tạo tài khoản {$user->name} ({$user->role})");
        return response()->json($user, 201);
    }

    public function update(Request $request, int $id)
    {
        $user = $this->member($id);
        $d = $request->validate(['name' => 'sometimes|string|max:120', 'email' => ['sometimes', 'email', 'max:200', Rule::unique('users', 'email')->ignore($id)],
            'phone' => 'nullable|string|max:40', 'role' => 'sometimes|exists:roles,key', 'password' => ['nullable', Password::min(10)], 'active' => 'boolean']);
        if (isset($d['role'])) $this->guardOwnerRole($d['role']);
        abort_if($user->role === 'owner' && auth()->user()->role !== 'owner', 403, 'Chỉ chủ khách sạn sửa được tài khoản chủ.');
        abort_if($user->id === auth()->id() && (($d['active'] ?? true) === false || (isset($d['role']) && $d['role'] !== $user->role)), 422, 'Không tự khóa hoặc đổi vai trò của chính mình.');
        if (empty($d['password'])) unset($d['password']);
        $user->fill($d);
        $diff = Audit::diff($user);
        $user->save();
        Audit::log('staff.update', $user, "Cập nhật tài khoản {$user->name}", null, $diff);
        return $user;
    }

    public function saveRole(Request $request, string $key)
    {
        $d = $request->validate(['name' => 'required|string|max:80', 'permissions' => 'required|array', 'permissions.*' => ['string', Rule::in(Permissions::all())]]);
        abort_if($key === 'owner', 422, 'Vai trò chủ khách sạn luôn có toàn quyền.');
        abort_unless(preg_match('/^[a-z_]{3,40}$/', $key), 422, 'Mã vai trò chỉ gồm chữ thường và dấu gạch dưới.');
        $role = Role::firstOrNew(['key' => $key]);
        $before = $role->permissions ?? [];
        $role->fill(['name' => $d['name'], 'permissions' => array_values(array_unique($d['permissions']))])->save();
        Audit::log('role.save', $role, "Cập nhật quyền vai trò {$role->name}", null,
            ['added' => array_values(array_diff($role->permissions, $before)), 'removed' => array_values(array_diff($before, $role->permissions))]);
        return $role;
    }

    // ---- Phân ca ----
    public function roster(Request $request)
    {
        $d = $request->validate(['from' => 'required|date_format:Y-m-d', 'to' => 'required|date_format:Y-m-d']);
        return StaffShift::with('user:id,name,role')->where('property_id', $this->pid())->whereBetween('work_date', [$d['from'], $d['to']])
            ->orderBy('work_date')->orderBy('starts_at')->get();
    }

    public function saveRoster(Request $request)
    {
        $d = $request->validate(['user_id' => 'required|integer', 'work_date' => 'required|date_format:Y-m-d', 'shift' => 'required|in:morning,afternoon,night,custom',
            'starts_at' => 'required|date_format:H:i', 'ends_at' => 'required|date_format:H:i', 'note' => 'nullable|string|max:300']);
        $this->member($d['user_id']);
        $s = StaffShift::updateOrCreate(['user_id' => $d['user_id'], 'work_date' => $d['work_date'], 'shift' => $d['shift']], $d + ['property_id' => $this->pid()]);
        Audit::log('roster.save', $s, 'Phân ca '.$d['work_date']);
        return $s->load('user:id,name,role');
    }

    public function deleteRoster(int $id)
    {
        $s = StaffShift::where('property_id', $this->pid())->findOrFail($id);
        Audit::log('roster.delete', $s, 'Bỏ phân ca '.$s->work_date->toDateString());
        $s->delete(); // lịch phân ca kế hoạch, không phải giao dịch
        return response()->noContent();
    }

    private function member(int $id): User
    {
        return User::whereHas('properties', fn ($q) => $q->where('properties.id', $this->pid()))->findOrFail($id);
    }

    private function guardOwnerRole(string $role): void
    {
        abort_if($role === 'owner' && auth()->user()->role !== 'owner', 403, 'Chỉ chủ khách sạn cấp được vai trò chủ.');
    }
}
