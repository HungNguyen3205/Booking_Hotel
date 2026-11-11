<?php
namespace Database\Seeders;

use App\Models\Room;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $email = config('hotel.admin_email');
        $password = config('hotel.admin_password');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password ?? '') < 12) {
            throw new \RuntimeException('Set HOTEL_ADMIN_EMAIL and HOTEL_ADMIN_PASSWORD (at least 12 characters).');
        }
        User::firstOrCreate(['email' => strtolower($email)], [
            'name' => 'Quản trị khách sạn', 'password' => $password, 'role' => 'admin',
        ]);

        foreach ([
            ['301', 'Deluxe King', 'Tông gỗ ấm, giường king và cửa sổ hướng phố dành cho kỳ nghỉ nhẹ nhàng.', '/images/deluxe.webp', 1450000, 2, 32, '1 giường King'],
            ['502', 'River View Twin', 'Hai giường đơn và khung cửa lớn mở ra tầm nhìn sông Hàn.', '/images/twin.webp', 1890000, 2, 38, '2 giường đơn'],
            ['801', 'Han River Suite', 'Phòng khách riêng, góc nhìn toàn cảnh và không gian rộng cho cả gia đình.', '/images/suite.webp', 2950000, 4, 62, '1 King + sofa bed'],
        ] as [$number, $name, $description, $image, $price, $capacity, $area, $bed]) {
            Room::withTrashed()->firstOrCreate(compact('number'), compact('name', 'description', 'image', 'price', 'capacity', 'area', 'bed'));
        }
    }
}
