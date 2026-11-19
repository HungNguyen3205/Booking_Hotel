<?php
namespace Database\Seeders;

use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\Post;
use App\Models\Property;
use App\Models\Room;
use App\Models\RoomType;
use App\Models\Service;
use App\Models\Shift;
use App\Models\User;
use App\Services\BookingService;
use App\Services\Context;
use App\Services\FolioService;
use App\Services\FrontDeskService;
use App\Services\HousekeepingService;
use App\Services\InventoryService;
use App\Services\RoomBlockService;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Auth;

/**
 * DỮ LIỆU DEMO để thử nghiệm — tên khách, dịch vụ, đơn giá dịch vụ, tồn kho đều là giả định.
 * Không chạy trên môi trường thật (HOTEL_SEED_DEMO=false).
 * Mọi đặt phòng được tạo qua service nghiệp vụ nên số liệu nhất quán với vận hành thực.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $property = Property::firstOrFail();
        Context::set($property);
        $owner = User::where('role', 'owner')->firstOrFail();
        Auth::login($owner);

        $password = config('hotel.demo_password');
        if (strlen((string) $password) >= 10) {
            foreach ([['manager', 'Quản lý Demo', 'quanly'], ['receptionist', 'Lễ tân Demo', 'letan'], ['accountant', 'Kế toán Demo', 'ketoan'],
                         ['housekeeping', 'Buồng phòng Demo', 'buongphong'], ['technician', 'Kỹ thuật Demo', 'kythuat']] as [$role, $name, $user]) {
                $u = User::firstOrCreate(['email' => "$user@demo.glg.test"], ['name' => $name, 'password' => $password, 'role' => $role]);
                $u->properties()->syncWithoutDetaching([$property->id]);
            }
        } else {
            $this->command?->warn('Bỏ qua tài khoản demo theo vai trò: đặt HOTEL_DEMO_PASSWORD (≥ 10 ký tự).');
        }

        $inv = app(InventoryService::class);
        $items = [];
        foreach ([['MB-NUOC', 'Nước suối 500ml', 'minibar', 'chai', 10], ['MB-BIA', 'Bia lon', 'minibar', 'lon', 10], ['MB-SNACK', 'Snack', 'minibar', 'gói', 5],
                     ['VT-BCDR', 'Bàn chải + kem đánh răng', 'consumable', 'bộ', 30], ['DV-KHAN', 'Khăn tắm', 'linen', 'chiếc', 40]] as [$sku, $name, $cat, $unit, $min]) {
            $items[$sku] = InventoryItem::firstOrCreate(['property_id' => $property->id, 'sku' => $sku], ['name' => $name, 'category' => $cat, 'unit' => $unit, 'min_stock' => $min]);
            if ((int) $items[$sku]->refresh()->on_hand === 0) $inv->move($items[$sku]->id, 'receive', $sku === 'MB-SNACK' ? 6 : 60, 'Nhập kho đầu kỳ (demo)');
        }
        $credits = json_decode((string) @file_get_contents(base_path('../frontend/public/images/services/credits.json')), true) ?: [];
        $images = ['Nước suối (minibar)' => 'nuoc-suoi', 'Bia lon (minibar)' => 'bia', 'Snack (minibar)' => 'snack', 'Giặt ủi' => 'giat-ui',
            'Ăn sáng' => 'an-sang', 'Đưa đón sân bay' => 'dua-don', 'Thuê xe máy' => 'thue-xe', 'Massage thư giãn 60 phút' => 'massage',
            'Cà phê' => 'ca-phe', 'Lớp Yoga' => 'yoga'];
        $services = [];
        foreach ([['minibar', 'Nước suối (minibar)', 'chai', 15000, 'MB-NUOC'], ['minibar', 'Bia lon (minibar)', 'lon', 30000, 'MB-BIA'],
                     ['minibar', 'Snack (minibar)', 'gói', 20000, 'MB-SNACK'], ['laundry', 'Giặt ủi', 'kg', 40000, null], ['fnb', 'Ăn sáng', 'suất', 60000, null],
                     ['transfer', 'Đưa đón sân bay', 'chuyến', 200000, null], ['car', 'Thuê xe máy', 'ngày', 120000, null], ['spa', 'Massage thư giãn 60 phút', 'lượt', 300000, null],
                     ['coffee', 'Cà phê', 'ly', 30000, null], ['yoga', 'Lớp Yoga', 'buổi', 100000, null]] as [$cat, $name, $unit, $price, $sku]) {
            $services[$name] = Service::firstOrCreate(['property_id' => $property->id, 'name' => $name],
                ['category' => $cat, 'unit' => $unit, 'price' => $price, 'inventory_item_id' => $sku ? $items[$sku]->id : null, 'active' => true,
                    'image' => isset($images[$name]) ? "/images/services/{$images[$name]}.webp" : null,
                    'image_credit' => isset($images[$name], $credits[$images[$name]]) ? $credits[$images[$name]] : null]);
        }

        if (Customer::exists()) return;

        $bookings = app(BookingService::class);
        $desk = app(FrontDeskService::class);
        $folios = app(FolioService::class);
        $types = RoomType::pluck('id', 'code');
        $room = fn (string $number) => Room::where('number', $number)->value('id');
        $guest = fn (string $name, string $phone) => ['full_name' => $name, 'phone' => $phone, 'email' => null];
        $make = function (string $name, string $phone, string $type, ?string $roomNo, string $in, string $out, int $adults, string $source, string $status = 'confirmed', int $children = 0) use ($bookings, $types, $room, $guest) {
            return $bookings->create(['source' => $source, 'status' => $status, 'customer' => $guest($name, $phone), 'stays' => [[
                'room_type_id' => $types[$type], 'room_id' => $roomNo ? $room($roomNo) : null, 'check_in' => $in, 'check_out' => $out,
                'adults' => $adults, 'children' => $children]]]);
        };
        $company = Customer::create(['kind' => 'company', 'full_name' => 'Công ty Demo Du lịch', 'tax_code' => '0000000000', 'phone' => '0900000099', 'notes' => 'Hồ sơ demo']);

        $real = CarbonImmutable::now();
        // Lượt ở đã bắt đầu từ trước: lùi đồng hồ để tạo và nhận phòng đúng quy trình
        Carbon::setTestNow($real->subDays(3)->setTime(15, 0));
        $d = fn (int $offset) => $real->addDays($offset)->toDateString();
        $past = $make('Nguyễn Văn An (demo)', '0900000001', 'DBL', '205', $d(-3), $d(-1), 2, 'phone');
        $desk->checkIn($past->stays()->first(), []);
        $a = $make('Trần Thị Bình (demo)', '0900000002', 'DBL', '206', $d(-3), $d(0), 2, 'ota');
        $desk->checkIn($a->stays()->first(), []);
        $b = $make('Lê Minh Châu (demo)', '0900000003', 'FAM', '403', $d(-3), $d(2), 2, 'direct', 'confirmed', 2);
        $desk->checkIn($b->stays()->first(), []);
        $b->update(['bill_to_id' => $company->id]);

        Carbon::setTestNow($real->subDay()->setTime(10, 0));
        $folios->collect($a, $folios->mainFolio($a), 'payment', 'bank_transfer', 450000, 'CK-DEMO-1', 'Demo');
        $folios->collect($past, $folios->mainFolio($past), 'payment', 'bank_transfer', 900000, 'CK-DEMO-0', 'Demo');
        $desk->checkOut($past->stays()->first(), []);
        $c = $make('Phạm Quốc Dũng (demo)', '0900000004', 'SGL', '301', $d(-1), $d(3), 1, 'website');
        $bookings->confirm($c);
        Carbon::setTestNow($real->subDay()->setTime(14, 30));
        $desk->checkIn($c->stays()->first(), []);
        $folios->postService($folios->mainFolio($c), $services['Nước suối (minibar)'], 2, $c->stays()->first(), null);
        $folios->postService($folios->mainFolio($c), $services['Giặt ủi'], 2, $c->stays()->first(), null);
        Carbon::setTestNow();

        // Hôm nay: khách đến, giữ chỗ chờ cọc, phòng trống bẩn, bảo trì
        $e = $make('Hoàng Thu Hà (demo)', '0900000005', 'DBL', '207', $d(0), $d(2), 2, 'phone');
        $folios->collect($e, $folios->mainFolio($e), 'deposit', 'bank_transfer', 300000, 'CK-DEMO-2', 'Cọc demo');
        $make('Đỗ Gia Huy (demo)', '0900000006', 'SGL', null, $d(0), $d(1), 1, 'website', 'hold');
        $make('Vũ Ngọc Lan (demo)', '0900000007', 'FAM', '404', $d(1), $d(4), 2, 'agent', 'confirmed', 1);
        $bookings->create(['source' => 'direct', 'status' => 'confirmed', 'customer_id' => $company->id, 'bill_to_id' => $company->id,
            'group_name' => 'Đoàn Công ty Demo', 'customer' => null, 'stays' => [
                ['room_type_id' => $types['DBL'], 'check_in' => $d(5), 'check_out' => $d(7), 'adults' => 2],
                ['room_type_id' => $types['DBL'], 'check_in' => $d(5), 'check_out' => $d(7), 'adults' => 2],
                ['room_type_id' => $types['SGL'], 'check_in' => $d(5), 'check_out' => $d(7), 'adults' => 1],
            ]]);
        $make('Bùi Thanh Tâm (demo)', '0900000008', 'DBL', null, $d(2), $d(5), 2, 'ota');

        app(HousekeepingService::class)->setStatus(Room::where('number', '305')->firstOrFail(), 'dirty', 'Demo: phòng cần dọn');
        app(RoomBlockService::class)->create(Room::where('number', '308')->firstOrFail(), 'maintenance', $d(0), $d(2), 'Demo: sửa điều hòa');

        Shift::create(['property_id' => $property->id, 'user_id' => $owner->id, 'opened_at' => now(), 'opening_cash' => 2000000, 'note' => 'Ca demo']);

        Post::firstOrCreate(['slug' => 'chao-mung-den-glg'], ['type' => 'article', 'title' => 'Chào mừng đến GLG HOTEL & SPA',
            'excerpt' => 'Bài viết mẫu — thay bằng nội dung của khách sạn.', 'body' => "Đây là bài viết mẫu để kiểm tra giao diện.\n\nNội dung thực tế do khách sạn cập nhật trong trang quản trị.",
            'cover' => '/images/glg/cong-wellness.webp', 'cover_alt' => 'Cổng tre GLG Hotel Wellness', 'status' => 'draft']);
        Auth::logout();
    }
}
