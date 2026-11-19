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
