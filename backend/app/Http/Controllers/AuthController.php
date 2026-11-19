<?php
namespace App\Http\Controllers;

use App\Services\Audit;
use App\Support\Permissions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function session(Request $request)
    {
        return ['csrf' => csrf_token(), 'user' => $request->user() ? $this->profile($request) : null];
    }

    public function login(Request $request)
    {
        $data = $request->validate(['email' => 'required|email|max:200', 'password' => 'required|string|max:128']);
        $ok = Auth::attempt(['email' => strtolower($data['email']), 'password' => $data['password'], 'active' => true]);
        abort_unless($ok, 422, 'Email hoặc mật khẩu chưa đúng, hoặc tài khoản đã bị khóa.');
        $request->session()->regenerate();
        $request->user()->update(['last_login_at' => now()]);
        if ($first = $request->user()->properties()->orderBy('properties.id')->first()) \App\Services\Context::set($first);
        Audit::log('auth.login', $request->user(), 'Đăng nhập');
        return ['csrf' => csrf_token(), 'user' => $this->profile($request)];
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return response()->noContent();
    }

    private function profile(Request $request): array
    {
        $user = $request->user();
        $perms = $user->permissions();
        return [
            'id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'role' => $user->role,
            'role_name' => $user->roleModel?->name,
            'permissions' => in_array('*', $perms, true) ? Permissions::all() : array_values($perms),
            'properties' => $user->properties()->where('active', true)->get(['properties.id', 'code', 'name', 'timezone', 'currency', 'check_in_time', 'check_out_time']),
        ];
    }
}
