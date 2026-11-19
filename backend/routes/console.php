<?php

use App\Services\AvailabilityService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Storage;

Artisan::command('hotel:release-holds', function (AvailabilityService $availability) {
    $count = $availability->releaseExpiredHolds();
    $this->info("Đã giải phóng $count giữ chỗ hết hạn.");
})->purpose('Hủy giữ chỗ quá hạn và giải phóng tồn phòng');

Artisan::command('hotel:backup {--keep=14}', function () {
    $driver = DB::connection()->getDriverName();
    $name = 'backups/glg-'.now()->format('Ymd-His');
    if ($driver === 'sqlite') {
        // VACUUM INTO tạo bản sao nhất quán kể cả khi đang có ghi
        $target = Storage::disk('local')->path($name.'.sqlite');
        @mkdir(dirname($target), 0775, true);
        DB::statement('VACUUM INTO ?', [$target]);
        $this->info("Đã sao lưu: $target");
    } else {
        $this->warn('Với MySQL/MariaDB, dùng mysqldump --single-transaction (xem README).');
        return 1;
    }
    $files = collect(Storage::disk('local')->files('backups'))->sort()->values();
    foreach ($files->slice(0, max(0, $files->count() - (int) $this->option('keep'))) as $old) Storage::disk('local')->delete($old);
    return 0;
})->purpose('Sao lưu cơ sở dữ liệu');

Artisan::command('hotel:daily', function (App\Services\AutomationService $automation) {
    foreach (App\Models\Property::where('active', true)->get() as $p) {
        $r = $automation->runDaily($p);
        $this->info("{$p->name}: ".json_encode($r, JSON_UNESCAPED_UNICODE));
    }
})->purpose('Tự động hóa cuối ngày: không đến, dọn phòng ở, giao việc');

Schedule::command('hotel:daily')->dailyAt('00:10');
Schedule::command('hotel:release-holds')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('hotel:backup')->dailyAt('02:30');
