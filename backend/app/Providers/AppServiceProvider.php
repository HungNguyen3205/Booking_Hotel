<?php
namespace App\Providers;

use App\Database\ImmediateSQLiteConnection;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Connection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        Connection::resolverFor('sqlite', fn ($pdo, $database, $prefix, $config) => new ImmediateSQLiteConnection($pdo, $database, $prefix, $config));
    }

    public function boot(): void
    {
        // Website gọi API qua proxy của Next.js nên IP thấy được là IP máy chạy Next.js. Chỉ tin X-Forwarded-For
        // từ các proxy liệt kê ở TRUSTED_PROXIES; reverse proxy trước Next.js phải ghi IP thật của khách vào header này.
        \Illuminate\Http\Middleware\TrustProxies::at(config('hotel.trusted_proxies'));

        // Mỗi loại thao tác có bộ đếm riêng (Laravel ghép tên limiter vào khóa). Trước đây dùng "throttle:X,1"
        // nên mọi route công khai chung một bộ đếm theo IP: vài lần tìm phòng đã làm khách bị chặn khi đặt phòng.
        $limits = [
            'public' => 240,       // đọc nội dung website
            'availability' => 60,  // tìm phòng trống
            'booking' => 10,       // gửi đặt phòng
            'lookup' => 20,        // tra cứu đặt phòng
            'transfer' => 5,       // báo đã chuyển khoản
            'login' => 8,          // đăng nhập quản trị
            'webhook' => 120,      // webhook cổng thanh toán
        ];
        foreach ($limits as $name => $perMinute) {
            RateLimiter::for($name, fn (Request $request) => Limit::perMinute($perMinute)->by($request->ip()));
        }
    }
}
