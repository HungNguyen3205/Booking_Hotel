<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gắn ảnh thật cho loại "Phòng đôi" (DBL) trên CSDL đã có dữ liệu.
 * Chỉ ghi khi loại phòng chưa có ảnh, để không đè ảnh đã tải lên qua admin.
 */
return new class extends Migration
{
    public function up(): void
    {
        $type = collect(config('hotel.room_types'))->firstWhere('code', 'DBL');
        if (!$type || empty($type['images'])) return;
        DB::table('room_types')->where('code', 'DBL')
            ->where(fn ($q) => $q->whereNull('images')->orWhere('images', '[]')->orWhere('images', ''))
            ->update(['images' => json_encode($type['images'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'updated_at' => now()]);
    }

    public function down(): void
    {
        // Không xóa ảnh: có thể đã được chỉnh sửa qua admin.
    }
};
