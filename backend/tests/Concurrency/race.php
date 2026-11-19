<?php
// Một tiến trình độc lập: khởi động Laravel và đặt 1 phòng gia đình cho đêm D+60.
require $argv[1].'/vendor/autoload.php';
$app = require $argv[1].'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
App\Services\Context::set(App\Models\Property::first());
$in = now()->addDays(60)->toDateString(); $out = now()->addDays(61)->toDateString();
$fam = App\Models\RoomType::where('code', 'FAM')->value('id');
// chờ tới mốc thời gian chung để các tiến trình chạy đồng thời
while (microtime(true) < (float) $argv[3]) usleep(1000);
try {
    $b = app(App\Services\BookingService::class)->create(['source' => 'phone', 'status' => 'confirmed',
        'customer' => ['full_name' => 'Race '.$argv[2], 'phone' => '09990000'.str_pad($argv[2], 2, '0', STR_PAD_LEFT)],
        'stays' => [['room_type_id' => $fam, 'check_in' => $in, 'check_out' => $out, 'adults' => 2]]]);
    echo "proc {$argv[2]}: OK {$b->code} room ".$b->stays()->first()->room->number."\n";
} catch (Throwable $e) {
    echo "proc {$argv[2]}: REJECTED ".($e instanceof Symfony\Component\HttpKernel\Exception\HttpExceptionInterface ? $e->getStatusCode() : get_class($e)).' '.$e->getMessage()."\n";
}
