<?php
namespace App\Services;

use App\Models\Setting;

/**
 * Cấu hình theo cơ sở, lưu trong bảng settings. Giá trị mặc định chỉ dùng khi chưa cấu hình
 * và đều chỉnh được ở trang Cấu hình — không gắn cứng vào giao diện.
 */
class Settings
{
    public const DEFAULTS = [
        'booking' => [
            'hold_minutes_website' => 120,  // giữ chỗ chờ cọc cho đơn website
            'hold_minutes_staff' => 120,    // giữ chỗ do lễ tân tạo
            'max_nights' => 30,
            'max_rooms_per_booking' => 10,
            'hourly_enabled' => false,
            'require_inspection' => true,   // dọn xong phải kiểm tra mới thành "Sạch"
            'require_shift_for_cash' => true,
            'rounding' => 1000,             // làm tròn giá (VND)
        ],
        // Chưa có số liệu thực tế: mặc định 0, chủ khách sạn cấu hình
        'surcharges' => [
            'extra_adult' => 0,
            'extra_child' => 0,
            'extra_bed' => 0,
            'early_check_in' => 0,
            'late_check_out' => 0,
        ],
        // Tự động hóa: chủ khách sạn bật/tắt ở Cấu hình → Tự động hóa
        'automation' => [
            'auto_no_show' => true,               // quá ngày nhận phòng mà chưa đến -> Không đến, giải phóng phòng
            'no_show_charge_fee' => false,        // có tự ghi phí không đến theo chính sách hay không
            'daily_stayover_cleaning' => true,    // mỗi ngày tạo việc dọn cho phòng khách đang ở
            'auto_assign_housekeeping' => true,   // tự giao việc dọn cho nhân viên buồng phòng ít việc nhất
        ],
        'automation_state' => ['last_daily' => null, 'last_result' => null],
        'payment_qr' => [
            'enabled' => false,
            'bank_bin' => '',
            'bank_name' => '',
            'account_number' => '',
            'account_name' => '',
        ],
        'notifications' => [
            'email_enabled' => false,
            'zalo_enabled' => false,
            'booking_confirmation' => "Xin chào {name},\nGLG HOTEL & SPA đã nhận đặt phòng {code} từ {check_in} đến {check_out}.\nTổng tiền: {total}. Tiền cọc cần thanh toán: {deposit}.\nTrân trọng.",
        ],
        'policies' => [
            'booking' => 'Nội dung mẫu — cần khách sạn xác nhận. Giờ nhận phòng và trả phòng theo cấu hình của khách sạn. Đơn đặt qua website được giữ chỗ trong thời gian quy định để chờ thanh toán cọc.',
            'cancellation' => 'Nội dung mẫu — cần khách sạn xác nhận. Mức phí hủy và hoàn tiền áp dụng theo kế hoạch giá đã chọn khi đặt phòng.',
            'privacy' => 'Nội dung mẫu — cần khách sạn xác nhận. Thông tin cá nhân chỉ dùng để xử lý đặt phòng, lưu trú và khai báo theo quy định; không chia sẻ cho bên thứ ba ngoài các trường hợp pháp luật yêu cầu.',
        ],
        'site' => [
            'tagline' => 'Hotel · Spa · Wellness',
            'hero_title' => 'Một khoảng xanh để nghỉ lại giữa nhịp sống Đà Nẵng',
            'hero_subtitle' => 'Khách sạn boutique tại 1081 Ngô Quyền — mặt kính phủ cây xanh, cổng tre và Mộc Spa ngay trong khuôn viên.',
            'about' => 'GLG HOTEL & SPA nằm tại 1081 Ngô Quyền, Đà Nẵng. Nội dung giới thiệu chi tiết đang được khách sạn cập nhật.',
            'amenities' => [
                ['icon' => 'spa', 'title' => 'Mộc Spa · Massage', 'text' => 'Không gian thư giãn toàn thân ngay trong khuôn viên.'],
                ['icon' => 'coffee', 'title' => 'Coffee & khu đọc sách', 'text' => 'Góc cà phê và khu đọc sách cho khách lưu trú.'],
                ['icon' => 'yoga', 'title' => 'Gym · Yoga', 'text' => 'Khu tập luyện trong cùng tòa nhà.'],
                ['icon' => 'kids', 'title' => 'Khu vui chơi Kids', 'text' => 'Khu vui chơi cho trẻ em.'],
            ],
            'gallery' => [
                ['url' => '/images/glg/mat-tien.webp', 'alt' => 'Mặt tiền GLG HOTEL & SPA với mặt kính phủ cây xanh tại góc đường Ngô Quyền'],
                ['url' => '/images/glg/cong-wellness.webp', 'alt' => 'Cổng tre và bảng gỗ GLG Hotel Wellness'],
                ['url' => '/images/glg/moc-spa.webp', 'alt' => 'Lối vào Mộc Spa Massage với bảng gỗ khắc chữ'],
                ['url' => '/images/glg/hang-rao-tre.webp', 'alt' => 'Hàng rào tre, cây xanh và khu vui chơi Kids'],
            ],
            'map_url' => 'https://www.google.com/maps/search/?api=1&query=1081+Ng%C3%B4+Quy%E1%BB%81n+%C4%90%C3%A0+N%E1%BA%B5ng',
            'zalo' => '',
            'facebook' => '',
        ],
    ];

    public static function get(string $key, ?int $propertyId = null): array
    {
        $propertyId ??= Context::propertyId();
        $stored = Setting::where('property_id', $propertyId)->where('key', $key)->value('value');
        $stored = is_string($stored) ? json_decode($stored, true) : $stored;
        $stored = is_array($stored) ? array_filter($stored, fn ($v) => $v !== null) : [];
        return array_replace(self::DEFAULTS[$key] ?? [], $stored);
    }

    public static function value(string $key, string $field, ?int $propertyId = null): mixed
    {
        return self::get($key, $propertyId)[$field] ?? null;
    }

    public static function put(string $key, array $value, ?int $propertyId = null): array
    {
        $propertyId ??= Context::propertyId();
        $merged = array_replace(self::get($key, $propertyId), $value);
        Setting::updateOrCreate(['property_id' => $propertyId, 'key' => $key], ['value' => $merged]);
        return $merged;
    }
}
