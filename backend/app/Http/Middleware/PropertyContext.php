<?php
namespace App\Http\Middleware;

use App\Models\Property;
use App\Services\Context;
use Closure;
use Illuminate\Http\Request;

/** Xác định cơ sở đang thao tác (header X-Property-Id) và kiểm tra người dùng được phân quyền cơ sở đó. */
class PropertyContext
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        abort_unless($user && $user->active, 401, 'Vui lòng đăng nhập.');
        $id = (int) $request->header('X-Property-Id', 0);
        $query = $user->properties()->where('properties.active', true);
        $property = $id ? $query->where('properties.id', $id)->first() : $query->orderBy('properties.id')->first();
        abort_unless($property instanceof Property, 403, 'Tài khoản chưa được phân quyền cơ sở này.');
        Context::set($property);
        return $next($request);
    }
}
