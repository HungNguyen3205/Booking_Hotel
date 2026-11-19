<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Bảng rỗng dùng để giao dịch SQLite giành khóa ghi ngay từ đầu (xem ImmediateSQLiteConnection). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('write_gate', fn (Blueprint $t) => $t->id());
    }

    public function down(): void
    {
        Schema::dropIfExists('write_gate');
    }
};
