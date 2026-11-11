<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class Administrator
{
    public function handle(Request $request, Closure $next)
    {
        abort_unless($request->user()->role === 'admin', 403, 'Chỉ quản trị viên có quyền này.');
        return $next($request);
    }
}
