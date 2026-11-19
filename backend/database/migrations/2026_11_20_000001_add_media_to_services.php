<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Ảnh và mô tả cho thẻ dịch vụ. image_credit lưu tác giả/giấy phép khi dùng ảnh có giấy phép tự do. */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('services', function (Blueprint $t) {
            $t->string('description', 300)->nullable()->after('name');
            $t->string('image', 300)->nullable()->after('description');
            $t->json('image_credit')->nullable()->after('image');
            $t->unsignedSmallInteger('sort')->default(0)->after('active');
        });
    }

    public function down(): void
    {
        Schema::table('services', fn (Blueprint $t) => $t->dropColumn(['description', 'image', 'image_credit', 'sort']));
    }
};
