<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hạ tầng, cơ sở, phân quyền, cấu hình, phòng và giá.
 * Tiền luôn lưu số nguyên VND (bigInteger), không dùng số thực.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('sessions', function (Blueprint $t) {
            $t->string('id')->primary();
            $t->foreignId('user_id')->nullable()->index();
            $t->string('ip_address', 45)->nullable();
            $t->text('user_agent')->nullable();
            $t->longText('payload');
            $t->integer('last_activity')->index();
        });
        Schema::create('cache', function (Blueprint $t) {
            $t->string('key')->primary();
            $t->mediumText('value');
            $t->integer('expiration');
        });
        Schema::create('cache_locks', function (Blueprint $t) {
            $t->string('key')->primary();
            $t->string('owner');
            $t->integer('expiration');
        });

        Schema::create('properties', function (Blueprint $t) {
            $t->id();
            $t->string('code', 20)->unique();
            $t->string('name');
            $t->string('address')->nullable();
            $t->string('phone', 40)->nullable();
            $t->string('email')->nullable();
            $t->string('timezone', 64)->default('Asia/Ho_Chi_Minh');
            $t->string('currency', 3)->default('VND');
            $t->string('check_in_time', 5)->default('14:00');
            $t->string('check_out_time', 5)->default('12:00');
            $t->boolean('active')->default(true);
            $t->timestamps();
        });

        Schema::create('roles', function (Blueprint $t) {
            $t->string('key', 40)->primary();
            $t->string('name');
            $t->json('permissions');
            $t->boolean('system')->default(false);
            $t->timestamps();
        });

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('email')->unique();
            $t->string('phone', 40)->nullable();
            $t->string('password');
            $t->string('role', 40)->index();
            $t->foreign('role')->references('key')->on('roles')->restrictOnDelete();
            $t->boolean('active')->default(true);
            $t->rememberToken();
            $t->timestamp('last_login_at')->nullable();
            $t->timestamps();
        });

        Schema::create('property_user', function (Blueprint $t) {
            $t->foreignId('property_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->primary(['property_id', 'user_id']);
        });

        Schema::create('settings', function (Blueprint $t) {
            $t->foreignId('property_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('key', 80);
            $t->json('value')->nullable();
            $t->timestamps();
            $t->unique(['property_id', 'key']);
        });

        Schema::create('floors', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->string('name', 60);
            $t->smallInteger('level');
            $t->unsignedSmallInteger('map_width')->default(1000);
            $t->unsignedSmallInteger('map_height')->default(640);
            $t->json('landmarks')->nullable(); // [{type, label, x, y, w, h}]
            $t->boolean('layout_confirmed')->default(false); // true khi đã khớp mặt bằng thực tế
            $t->timestamps();
            $t->unique(['property_id', 'level']);
        });

        Schema::create('room_types', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->string('code', 20);
            $t->string('slug', 80)->unique();
            $t->string('name');
            $t->string('short_description', 300)->nullable();
            $t->text('description')->nullable();
            $t->unsignedSmallInteger('area');
            $t->string('bed', 120)->nullable(); // chưa có thông tin thực tế thì để trống
            $t->unsignedTinyInteger('base_adults');      // số người lớn đã gồm trong giá
            $t->unsignedTinyInteger('max_adults');
            $t->unsignedTinyInteger('max_children');
            $t->unsignedTinyInteger('max_occupancy');
            $t->unsignedTinyInteger('max_extra_beds')->default(0);
            $t->unsignedBigInteger('base_rate');          // giá bán tham chiếu / đêm
            $t->unsignedBigInteger('hourly_rate')->nullable();
            $t->json('amenities')->nullable();
            $t->json('images')->nullable();               // [{url, alt}]
            $t->string('seo_title')->nullable();
            $t->string('seo_description', 300)->nullable();
            $t->boolean('active')->default(true);
            $t->boolean('public')->default(true);
            $t->unsignedSmallInteger('sort')->default(0);
            $t->timestamps();
            $t->unique(['property_id', 'code']);
        });

        Schema::create('rooms', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->foreignId('floor_id')->constrained()->restrictOnDelete();
            $t->foreignId('room_type_id')->constrained()->restrictOnDelete();
            $t->string('number', 20);
            // Buồng phòng độc lập với lưu trú; khả năng sử dụng suy ra từ room_blocks theo ngày
            $t->string('housekeeping', 20)->default('clean');          // dirty | cleaning | inspecting | clean
            // Cấu hình sơ đồ: tọa độ theo hệ quy chiếu của tầng
            $t->string('wing', 10)->nullable();                        // left | base | right
            $t->unsignedSmallInteger('map_x')->default(0);
            $t->unsignedSmallInteger('map_y')->default(0);
            $t->unsignedSmallInteger('map_w')->default(120);
            $t->unsignedSmallInteger('map_h')->default(90);
            $t->string('door_side', 1)->default('s');                 // n | s | e | w
            $t->unsignedSmallInteger('sort')->default(0);
            $t->string('notes', 500)->nullable();
            $t->timestamp('archived_at')->nullable();                  // ngừng sử dụng, không xóa
            $t->timestamps();
            $t->unique(['property_id', 'number']);
        });

        Schema::create('room_blocks', function (Blueprint $t) {
            $t->id();
            $t->foreignId('room_id')->constrained()->restrictOnDelete();
            $t->string('type', 20); // maintenance | out_of_service
            $t->date('start_date');
            $t->date('end_date'); // không bao gồm
            $t->string('reason', 500);
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('released_at')->nullable();
            $t->foreignId('released_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('cancellation_policies', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->string('name');
            $t->text('description');
            $t->unsignedSmallInteger('free_cancel_hours')->default(48); // hủy trước X giờ so với giờ nhận phòng thì miễn phí
            $t->unsignedTinyInteger('late_cancel_fee_percent')->default(100); // % của đêm đầu
            $t->unsignedTinyInteger('no_show_fee_percent')->default(100);     // % của đêm đầu
            $t->boolean('refundable')->default(true);
            $t->timestamps();
        });

        Schema::create('rate_plans', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->string('code', 30);
            $t->string('name');
            $t->text('description')->nullable();
            $t->foreignId('cancellation_policy_id')->nullable()->constrained()->nullOnDelete();
            $t->unsignedTinyInteger('deposit_percent')->default(30);
            $t->smallInteger('adjust_percent')->default(0); // điều chỉnh so với giá cơ sở, ví dụ -10
            $t->boolean('includes_breakfast')->default(false);
            $t->boolean('public')->default(true);
            $t->boolean('active')->default(true);
            $t->unsignedSmallInteger('sort')->default(0);
            $t->timestamps();
            $t->unique(['property_id', 'code']);
        });

        // Quy tắc giá: ngày thường/cuối tuần/lễ/mùa. Xem PricingService để biết thứ tự ưu tiên.
        Schema::create('rate_rules', function (Blueprint $t) {
            $t->id();
            $t->foreignId('room_type_id')->constrained()->cascadeOnDelete();
            $t->foreignId('rate_plan_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('kind', 20); // weekend | season | holiday
            $t->string('name');
            $t->date('start_date')->nullable();
            $t->date('end_date')->nullable(); // bao gồm
            $t->json('days_of_week')->nullable(); // 0=CN..6=T7, dùng cho weekend
            $t->unsignedBigInteger('price');
            $t->unsignedSmallInteger('priority')->default(0);
            $t->boolean('active')->default(true);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['rate_rules', 'rate_plans', 'cancellation_policies', 'room_blocks', 'rooms', 'room_types', 'floors',
                     'settings', 'property_user', 'users', 'roles', 'properties', 'cache_locks', 'cache', 'sessions'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
