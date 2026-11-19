<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/** Backend luôn kiểm tra quyền theo hành động; giao diện ẩn nút chỉ để gọn. Dùng: perm:bookings.create */
class RequirePermission
{
    public function handle(Request $request, Closure $next, string ...$permissions)
    {
        $user = $request->user();
        abort_unless($user && $user->active, 401, 'Vui lòng đăng nhập.');
        abort_unless($user->hasPermission(...$permissions), 403, 'Bạn không có quyền thực hiện thao tác này.');
        return $next($request);
    }
}
