<?php

/*
 * Dữ liệu khởi tạo ban đầu (chỉ dùng khi seed). Sau khi khởi tạo, mọi giá trị chỉnh trong trang Cấu hình.
 * Các giá trị đánh dấu "TẠM" chưa được khách sạn cung cấp và cần xác nhận.
 */
return [
    'payment_webhook_secret' => env('PAYMENT_WEBHOOK_SECRET', ''),

    // Ảnh mặc định theo nhóm dịch vụ (ảnh có giấy phép tự do, xem frontend/public/images/services/credits.json).
    // Dịch vụ không có ảnh riêng sẽ dùng ảnh của nhóm; "other" dùng ảnh thật của khách sạn.
    'service_category_images' => [
        'minibar' => '/images/services/nuoc-suoi.webp', 'laundry' => '/images/services/giat-ui.webp', 'fnb' => '/images/services/an-sang.webp',
        'transfer' => '/images/services/dua-don.webp', 'car' => '/images/services/thue-xe.webp', 'spa' => '/images/services/massage.webp',
        'coffee' => '/images/services/ca-phe.webp', 'yoga' => '/images/services/yoga.webp', 'other' => '/images/glg/cong-wellness-sm.webp',
    ],
    'seed_demo' => (bool) env('HOTEL_SEED_DEMO', true),
    'demo_password' => env('HOTEL_DEMO_PASSWORD', ''),

    'property' => [
        'code' => 'GLG-DN',
        'name' => 'GLG HOTEL & SPA',
        'address' => '1081 Ngô Quyền, Đà Nẵng',
        'phone' => null,   // chưa cung cấp
        'email' => null,   // chưa cung cấp
        'check_in_time' => '14:00',  // TẠM
        'check_out_time' => '12:00', // TẠM
    ],

    // Cơ cấu phòng dự kiến (theo yêu cầu). Sức chứa phòng đơn/đôi: TẠM.
    'room_types' => [
        ['code' => 'SGL', 'slug' => 'phong-don', 'name' => 'Phòng đơn', 'count' => 8, 'area' => 18, 'base_rate' => 350000,
            'base_adults' => 1, 'max_adults' => 2, 'max_children' => 1, 'max_occupancy' => 2],
        ['code' => 'DBL', 'slug' => 'phong-doi', 'name' => 'Phòng đôi', 'count' => 10, 'area' => 25, 'base_rate' => 450000,
            'base_adults' => 2, 'max_adults' => 2, 'max_children' => 1, 'max_occupancy' => 3],
        ['code' => 'FAM', 'slug' => 'phong-gia-dinh', 'name' => 'Phòng gia đình', 'count' => 4, 'area' => 32, 'base_rate' => 600000,
            'base_adults' => 2, 'max_adults' => 2, 'max_children' => 2, 'max_occupancy' => 4],
    ],
];
