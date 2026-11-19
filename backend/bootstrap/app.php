<?php

use App\Http\Middleware\PropertyContext;
use App\Http\Middleware\RequirePermission;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php', commands: __DIR__.'/../routes/console.php')
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->redirectGuestsTo(fn () => '/admin/dang-nhap');
        // Website gọi API qua proxy của Next.js (cùng máy) nên IP thấy được là 127.0.0.1. Chỉ tin X-Forwarded-For
        // từ các proxy liệt kê ở TRUSTED_PROXIES; reverse proxy trước Next.js phải ghi IP thật của khách vào header này.
        $middleware->trustProxies(at: array_values(array_filter(array_map('trim', explode(',', (string) env('TRUSTED_PROXIES', '127.0.0.1,::1'))))));
        $middleware->alias(['perm' => RequirePermission::class, 'property' => PropertyContext::class]);
        // Webhook xác thực bằng chữ ký HMAC, không dùng CSRF
        $middleware->validateCsrfTokens(except: ['api/webhooks/*']);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());
        // Không đưa dữ liệu nhạy cảm vào log
        $exceptions->dontFlash(['password', 'password_confirmation', 'id_number', 'current_password']);
    })
    ->create();
