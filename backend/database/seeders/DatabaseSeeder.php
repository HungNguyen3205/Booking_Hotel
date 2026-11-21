<?php
namespace Database\Seeders;

use App\Models\CancellationPolicy;
use App\Models\Floor;
use App\Models\PaymentMethod;
use App\Models\Property;
use App\Models\RatePlan;
use App\Models\Role;
use App\Models\Room;
use App\Models\RoomType;
use App\Models\User;
use App\Services\Context;
use App\Support\Permissions;
use Illuminate\Database\Seeder;

/**
 * Khởi tạo cấu hình ban đầu. Chạy lại an toàn (firstOrCreate).
 * Dữ liệu demo (khách, đặt phòng, dịch vụ, kho, tài khoản thử) nằm ở DemoSeeder và chỉ chạy khi HOTEL_SEED_DEMO=true.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $email = config('hotel.admin_email');
        $password = config('hotel.admin_password');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen((string) $password) < 12) {
            throw new \RuntimeException('Đặt HOTEL_ADMIN_EMAIL và HOTEL_ADMIN_PASSWORD (tối thiểu 12 ký tự) trong .env trước khi seed.');
        }

        foreach (Permissions::ROLES as $key => [$name, $perms]) {
            Role::firstOrCreate(['key' => $key], ['name' => $name, 'permissions' => $perms, 'system' => true]);
        }

        $cfg = config('hotel.property');
        $property = Property::firstOrCreate(['code' => $cfg['code']], collect($cfg)->except('code')->all());
        Context::set($property);

        $owner = User::firstOrCreate(['email' => strtolower($email)], ['name' => 'Chủ khách sạn', 'password' => $password, 'role' => 'owner']);
        $owner->properties()->syncWithoutDetaching([$property->id]);

        foreach ([['cash', 'Tiền mặt', 'cash', 1], ['bank_transfer', 'Chuyển khoản / QR', 'bank_transfer', 2], ['card', 'Thẻ (POS)', 'card', 3]] as [$code, $name, $type, $sort]) {
            PaymentMethod::firstOrCreate(['code' => $code], ['name' => $name, 'type' => $type, 'sort' => $sort, 'active' => true]);
        }

        $policy = CancellationPolicy::firstOrCreate(['property_id' => $property->id, 'name' => 'Chính sách tiêu chuẩn (tạm)'], [
            'description' => 'Giá trị tạm thời, cần khách sạn xác nhận: hủy miễn phí trước 48 giờ so với giờ nhận phòng; hủy muộn hoặc không đến tính phí 100% đêm đầu. Tiền cọc đã thu được hoàn theo chính sách sau khi trừ phí.',
            'free_cancel_hours' => 48, 'late_cancel_fee_percent' => 100, 'no_show_fee_percent' => 100, 'refundable' => true,
        ]);
        RatePlan::firstOrCreate(['property_id' => $property->id, 'code' => 'STD'], [
            'name' => 'Giá tiêu chuẩn', 'description' => 'Giá phòng theo đêm, chưa gồm dịch vụ khác.', 'cancellation_policy_id' => $policy->id,
            'deposit_percent' => 30, 'adjust_percent' => 0, 'includes_breakfast' => false, 'public' => true, 'active' => true, 'sort' => 1,
        ]);

        $types = [];
        foreach (config('hotel.room_types') as $i => $t) {
            $types[$t['code']] = RoomType::firstOrCreate(['property_id' => $property->id, 'code' => $t['code']], collect($t)->except(['count', 'code'])->all() + [
                'short_description' => "{$t['name']} {$t['area']} m², tối đa {$t['max_occupancy']} khách.",
                'description' => 'Nội dung mô tả chi tiết và hình ảnh thực tế của loại phòng đang được khách sạn cập nhật.',
                'bed' => null, 'amenities' => [], 'images' => [], 'sort' => $i + 1, 'max_extra_beds' => 0,
            ]);
        }

        if (Room::where('property_id', $property->id)->exists()) return;

        // Sơ đồ chữ U MINH HỌA: chưa có mặt bằng thực tế. Số tầng, số phòng, vị trí cầu thang đều là giả định có nhãn,
        // chỉnh lại ở Cấu hình → Phòng & sơ đồ khi có bản vẽ. layout_confirmed = false.
        $plan = [
            ['level' => 2, 'name' => 'Tầng 2', 'rooms' => [['SGL', 4], ['DBL', 4]], 'split' => [3, 2, 3]],
            ['level' => 3, 'name' => 'Tầng 3', 'rooms' => [['SGL', 4], ['DBL', 4]], 'split' => [3, 2, 3]],
            ['level' => 4, 'name' => 'Tầng 4', 'rooms' => [['DBL', 2], ['FAM', 4]], 'split' => [2, 2, 2]],
        ];
        foreach ($plan as $f) {
            $floor = Floor::create(['property_id' => $property->id, 'name' => $f['name'], 'level' => $f['level'], 'map_width' => 1000, 'map_height' => 640,
                'layout_confirmed' => false, 'landmarks' => [
                    ['type' => 'corridor', 'label' => 'Hành lang', 'x' => 240, 'y' => 40, 'w' => 60, 'h' => 420],
                    ['type' => 'corridor', 'label' => 'Hành lang', 'x' => 240, 'y' => 400, 'w' => 520, 'h' => 60],
                    ['type' => 'corridor', 'label' => 'Hành lang', 'x' => 700, 'y' => 40, 'w' => 60, 'h' => 420],
                    ['type' => 'courtyard', 'label' => 'Khoảng giữa chữ U (chưa xác định)', 'x' => 320, 'y' => 60, 'w' => 360, 'h' => 320],
                    ['type' => 'stairs', 'label' => 'Cầu thang (minh họa)', 'x' => 40, 'y' => 470, 'w' => 190, 'h' => 130],
                    ['type' => 'service', 'label' => 'Kho tầng (minh họa)', 'x' => 770, 'y' => 470, 'w' => 190, 'h' => 130],
                ]]);
            $codes = [];
            foreach ($f['rooms'] as [$code, $n]) for ($k = 0; $k < $n; $k++) $codes[] = $code;
            [$left, $base, $right] = $f['split'];
            $no = 1;
            $slots = [];
            for ($k = 0; $k < $left; $k++) $slots[] = ['wing' => 'left', 'x' => 40, 'y' => 40 + $k * intdiv(360, $left), 'w' => 190, 'h' => intdiv(360, $left) - 10, 'door' => 'e'];
            for ($k = 0; $k < $base; $k++) $slots[] = ['wing' => 'base', 'x' => 250 + $k * intdiv(500, $base), 'y' => 470, 'w' => intdiv(500, $base) - 10, 'h' => 130, 'door' => 'n'];
            for ($k = $right - 1; $k >= 0; $k--) $slots[] = ['wing' => 'right', 'x' => 770, 'y' => 40 + $k * intdiv(360, $right), 'w' => 190, 'h' => intdiv(360, $right) - 10, 'door' => 'w'];
            foreach ($slots as $i => $slot) {
                Room::create(['property_id' => $property->id, 'floor_id' => $floor->id, 'room_type_id' => $types[$codes[$i]]->id,
                    'number' => $f['level'].str_pad((string) $no++, 2, '0', STR_PAD_LEFT), 'housekeeping' => 'clean', 'wing' => $slot['wing'],
                    'map_x' => $slot['x'], 'map_y' => $slot['y'], 'map_w' => $slot['w'], 'map_h' => $slot['h'], 'door_side' => $slot['door'], 'sort' => $f['level'] * 100 + $i]);
            }
        }

        if (config('hotel.seed_demo')) {
            $this->call(DemoSeeder::class);
        }
    }
}
