<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->string('role')->default('staff');
            $table->rememberToken();
            $table->timestamps();
        });
        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
        Schema::create('cache', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->mediumText('value');
            $table->integer('expiration');
        });
        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->string('name');
            $table->text('description');
            $table->string('image')->nullable();
            $table->unsignedInteger('price');
            $table->unsignedTinyInteger('capacity');
            $table->unsignedSmallInteger('area');
            $table->string('bed');
            $table->boolean('active')->default(true);
            $table->softDeletes();
            $table->timestamps();
        });
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained()->restrictOnDelete();
            $table->string('code', 32)->unique();
            $table->uuid('request_key')->unique();
            $table->string('request_hash', 64);
            $table->string('guest_name');
            $table->string('email');
            $table->string('phone', 32);
            $table->date('check_in');
            $table->date('check_out');
            $table->unsignedTinyInteger('guests');
            $table->unsignedInteger('nightly_rate');
            $table->unsignedBigInteger('total');
            $table->string('status')->default('pending')->index();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
        Schema::create('room_nights', function (Blueprint $table) {
            $table->foreignId('room_id')->constrained()->restrictOnDelete();
            $table->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $table->date('night');
            $table->primary(['room_id', 'night']);
        });
    }

    public function down(): void
    {
        foreach (['room_nights', 'bookings', 'rooms', 'cache', 'sessions', 'users'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
