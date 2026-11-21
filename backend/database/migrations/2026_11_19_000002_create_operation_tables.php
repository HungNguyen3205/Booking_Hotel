<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Khách hàng, đặt phòng/lưu trú, hồ sơ thanh toán, buồng phòng, dịch vụ, kho, nhật ký.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $t) {
            $t->id();
            $t->string('kind', 20)->default('guest'); // guest | company | agent
            $t->foreignId('company_id')->nullable()->constrained('customers')->nullOnDelete(); // khách thuộc công ty/đại lý
            $t->string('full_name');
            $t->string('phone', 40)->nullable()->index();
            $t->string('email')->nullable()->index();
            $t->string('tax_code', 40)->nullable();
            $t->string('nationality', 60)->nullable();
            $t->date('date_of_birth')->nullable();
            $t->string('gender', 10)->nullable();
            $t->string('address', 300)->nullable();
            // Giấy tờ: mã hóa khi lưu; hash để kiểm soát trùng mà không lộ số
            $t->string('id_type', 20)->nullable(); // cccd | passport | other
            $t->text('id_number')->nullable();
            $t->string('id_number_hash', 64)->nullable()->index();
            $t->boolean('vip')->default(false);
            $t->text('preferences')->nullable();
            $t->text('notes')->nullable();
            $t->unsignedBigInteger('credit_limit')->default(0);
            $t->foreignId('merged_into_id')->nullable()->constrained('customers')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('bookings', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->string('code', 20)->unique();
            $t->uuid('request_key')->nullable()->unique(); // idempotency từ website
            $t->string('request_hash', 64)->nullable();
            $t->string('status', 20)->index(); // hold | confirmed | checked_in | checked_out | cancelled | no_show
            $t->string('source', 20); // direct | phone | website | agent | ota
            $t->string('source_ref', 80)->nullable();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete(); // người đặt
            $t->foreignId('bill_to_id')->nullable()->constrained('customers')->nullOnDelete(); // công ty/đại lý chịu công nợ
            $t->foreignId('rate_plan_id')->nullable()->constrained()->nullOnDelete();
            $t->string('group_name')->nullable();
            $t->timestamp('hold_expires_at')->nullable()->index();
            $t->unsignedTinyInteger('deposit_percent')->default(0);
            $t->unsignedBigInteger('deposit_required')->default(0);
            $t->text('special_requests')->nullable();
            $t->text('internal_notes')->nullable();
            $t->string('cancel_reason', 500)->nullable();
            $t->timestamp('cancelled_at')->nullable();
            $t->json('policy_snapshot')->nullable(); // chính sách cọc/hủy tại thời điểm đặt
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        // Mỗi dòng là một phòng trong đặt phòng (một lượt lưu trú)
        Schema::create('stays', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->constrained()->restrictOnDelete();
            $t->foreignId('room_type_id')->constrained()->restrictOnDelete();
            $t->foreignId('room_id')->nullable()->constrained()->restrictOnDelete();
            $t->boolean('room_locked')->default(false); // false: phòng được hệ thống tự phân, có thể đổi
            $t->foreignId('rate_plan_id')->nullable()->constrained()->nullOnDelete();
            $t->string('status', 20)->index(); // hold | confirmed | checked_in | checked_out | cancelled | no_show
            $t->date('check_in')->index();
            $t->date('check_out')->index(); // ngày trả, không tính đêm
            $t->unsignedTinyInteger('adults');
            $t->unsignedTinyInteger('children')->default(0);
            $t->unsignedTinyInteger('extra_beds')->default(0);
            $t->timestamp('checked_in_at')->nullable();
            $t->timestamp('checked_out_at')->nullable();
            $t->foreignId('checked_in_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('checked_out_by')->nullable()->constrained('users')->nullOnDelete();
            $t->string('dirty_override_reason', 500)->nullable();
            $t->timestamps();
        });

        Schema::create('stay_guests', function (Blueprint $t) {
            $t->id();
            $t->foreignId('stay_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->boolean('is_primary')->default(false);
            $t->timestamps();
            $t->unique(['stay_id', 'customer_id']);
        });

        Schema::create('folios', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->constrained()->restrictOnDelete();
            $t->foreignId('bill_to_id')->nullable()->constrained('customers')->nullOnDelete();
            $t->string('name', 120);
            $t->string('status', 20)->default('open'); // open | closed
            $t->timestamp('closed_at')->nullable();
            $t->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        // Giá từng đêm: chụp lại để thay đổi bảng giá không ảnh hưởng lịch sử
        Schema::create('stay_nights', function (Blueprint $t) {
            $t->id();
            $t->foreignId('stay_id')->constrained()->restrictOnDelete();
            $t->foreignId('folio_id')->constrained()->restrictOnDelete();
            $t->date('night')->index();
            $t->unsignedBigInteger('room_rate');
            $t->unsignedBigInteger('extra_charge')->default(0);
            $t->unsignedBigInteger('amount');
            $t->string('rate_label', 120);
            $t->foreignId('rate_rule_id')->nullable()->constrained()->nullOnDelete();
            $t->boolean('void')->default(false);
            $t->string('void_reason', 300)->nullable();
            $t->timestamps();
        });

        // Khóa tồn: mỗi cặp (phòng, đêm) chỉ có một lượt ở hoặc một khoảng chặn
        Schema::create('room_nights', function (Blueprint $t) {
            $t->foreignId('room_id')->constrained()->restrictOnDelete();
            $t->date('night');
            $t->foreignId('stay_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignId('room_block_id')->nullable()->constrained()->cascadeOnDelete();
            $t->primary(['room_id', 'night']);
            $t->index('stay_id');
        });

        Schema::create('services', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->string('category', 20); // minibar | laundry | fnb | transfer | car | spa | coffee | yoga | other
            $t->string('name');
            $t->string('unit', 30)->default('lần');
            $t->unsignedBigInteger('price');
            $t->unsignedBigInteger('inventory_item_id')->nullable();
            $t->boolean('active')->default(true);
            $t->timestamps();
        });

        // Combo (chuẩn bị mở rộng Hotel–Spa–Coffee–Yoga)
        Schema::create('service_packages', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->string('name');
            $t->text('description')->nullable();
            $t->json('items'); // [{service_id, quantity}]
            $t->unsignedBigInteger('price');
            $t->boolean('active')->default(false);
            $t->timestamps();
        });

        Schema::create('folio_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('folio_id')->constrained()->restrictOnDelete();
            $t->foreignId('stay_id')->nullable()->constrained()->nullOnDelete();
            $t->string('type', 20); // service | surcharge | discount | adjustment | fee
            $t->foreignId('service_id')->nullable()->constrained()->nullOnDelete();
            $t->string('description', 300);
            $t->integer('quantity')->default(1);
            $t->bigInteger('unit_price');
            $t->bigInteger('amount'); // có dấu: giảm giá/điều chỉnh giảm là số âm
            $t->date('business_date')->index();
            $t->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            // Không xóa: hủy bằng dòng đảo
            $t->foreignId('reverses_id')->nullable()->constrained('folio_lines')->nullOnDelete();
            $t->timestamp('voided_at')->nullable();
            $t->string('reason', 500)->nullable();
            $t->timestamps();
        });

        Schema::create('payment_methods', function (Blueprint $t) {
            $t->string('code', 30)->primary();
            $t->string('name');
            $t->string('type', 20); // cash | bank_transfer | qr | card | other
            $t->boolean('active')->default(true);
            $t->unsignedSmallInteger('sort')->default(0);
            $t->timestamps();
        });

        Schema::create('shifts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->foreignId('user_id')->constrained()->restrictOnDelete();
            $t->timestamp('opened_at');
            $t->unsignedBigInteger('opening_cash')->default(0);
            $t->timestamp('closed_at')->nullable();
            $t->unsignedBigInteger('expected_cash')->nullable();
            $t->unsignedBigInteger('counted_cash')->nullable();
            $t->bigInteger('difference')->nullable();
            $t->foreignId('handed_to')->nullable()->constrained('users')->nullOnDelete();
            $t->string('note', 500)->nullable();
            $t->timestamps();
        });

        Schema::create('payments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->nullable()->constrained()->restrictOnDelete();
            $t->foreignId('folio_id')->nullable()->constrained()->restrictOnDelete();
            $t->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $t->string('kind', 20); // deposit | payment | refund
            $t->string('method', 30);
            $t->foreign('method')->references('code')->on('payment_methods')->restrictOnDelete();
            $t->unsignedBigInteger('amount');
            $t->string('status', 20)->default('completed'); // pending | completed | failed | cancelled
            $t->string('reference', 120)->nullable();
            $t->string('provider', 40)->nullable();
            $t->string('external_id', 120)->nullable();
            $t->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $t->string('note', 500)->nullable();
            $t->string('receipt_no', 30)->nullable()->unique();
            $t->timestamp('paid_at')->nullable()->index();
            $t->timestamps();
            $t->unique(['provider', 'external_id']);
        });

        Schema::create('cash_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            $t->string('type', 10); // income | expense
            $t->string('category', 60);
            $t->string('method', 30);
            $t->unsignedBigInteger('amount');
            $t->string('description', 500);
            $t->date('business_date')->index();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('reverses_id')->nullable()->constrained('cash_entries')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('inventory_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->string('sku', 40);
            $t->string('name');
            $t->string('category', 20); // minibar | consumable | linen
            $t->string('unit', 20);
            $t->integer('on_hand')->default(0);
            $t->integer('min_stock')->default(0);
            $t->unsignedBigInteger('unit_cost')->default(0);
            $t->boolean('active')->default(true);
            $t->timestamps();
            $t->unique(['property_id', 'sku']);
        });

        Schema::create('inventory_movements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('inventory_item_id')->constrained()->restrictOnDelete();
            $t->string('type', 20); // receive | issue | sale | sale_reversal | count | adjust | damage | loss
            $t->integer('quantity'); // có dấu
            $t->integer('balance_after');
            $t->string('ref_type', 40)->nullable();
            $t->unsignedBigInteger('ref_id')->nullable();
            $t->string('note', 500)->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            // Một dòng phí minibar chỉ trừ kho một lần
            $t->unique(['ref_type', 'ref_id', 'inventory_item_id', 'type'], 'inv_mov_ref_item_type_unique'); // tên ngắn: MySQL giới hạn 64 ký tự
        });

        Schema::create('housekeeping_tasks', function (Blueprint $t) {
            $t->id();
            $t->foreignId('room_id')->constrained()->restrictOnDelete();
            $t->foreignId('stay_id')->nullable()->constrained()->nullOnDelete();
            $t->string('type', 20)->default('departure'); // departure | stayover | deep | inspection
            $t->string('status', 20)->default('open');    // open | in_progress | inspecting | done | cancelled
            $t->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $t->json('checklist')->nullable();
            $t->string('priority', 10)->default('normal');
            $t->timestamp('started_at')->nullable();
            $t->timestamp('finished_at')->nullable();
            $t->foreignId('inspected_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('inspected_at')->nullable();
            $t->string('note', 500)->nullable();
            $t->timestamps();
        });

        Schema::create('maintenance_tickets', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->foreignId('room_id')->nullable()->constrained()->restrictOnDelete();
            $t->string('title');
            $t->text('description')->nullable();
            $t->string('severity', 10)->default('normal'); // low | normal | high
            $t->string('status', 20)->default('open');     // open | in_progress | resolved | cancelled
            $t->foreignId('room_block_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('reported_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('resolved_at')->nullable();
            $t->string('resolution', 500)->nullable();
            $t->timestamps();
        });

        Schema::create('lost_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->foreignId('room_id')->nullable()->constrained()->nullOnDelete();
            $t->string('description', 300);
            $t->foreignId('found_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('found_at');
            $t->string('status', 20)->default('stored'); // stored | returned | disposed
            $t->string('note', 500)->nullable();
            $t->timestamps();
        });

        Schema::create('feedback', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('booking_id')->nullable()->constrained()->nullOnDelete();
            $t->string('type', 20)->default('feedback'); // feedback | complaint
            $t->unsignedTinyInteger('rating')->nullable();
            $t->text('content');
            $t->string('status', 20)->default('open'); // open | resolved
            $t->string('resolution', 500)->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('staff_shifts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->constrained()->restrictOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->date('work_date')->index();
            $t->string('shift', 20); // morning | afternoon | night | custom
            $t->string('starts_at', 5);
            $t->string('ends_at', 5);
            $t->string('note', 300)->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'work_date', 'shift']);
        });

        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('property_id')->nullable();
            $t->string('action', 60)->index();
            $t->string('subject_type', 40)->nullable();
            $t->unsignedBigInteger('subject_id')->nullable();
            $t->string('summary', 500);
            $t->string('reason', 500)->nullable();
            $t->json('changes')->nullable(); // đã lọc dữ liệu nhạy cảm
            $t->string('ip', 45)->nullable();
            $t->timestamp('created_at')->useCurrent()->index();
            $t->index(['subject_type', 'subject_id']);
        });

        Schema::create('notifications_outbox', function (Blueprint $t) {
            $t->id();
            $t->string('channel', 20); // email | zalo | sms
            $t->string('recipient', 200);
            $t->string('template', 60);
            $t->json('payload');
            $t->string('status', 30); // queued | sent | failed | not_configured
            $t->string('error', 500)->nullable();
            $t->string('ref_type', 40)->nullable();
            $t->unsignedBigInteger('ref_id')->nullable();
            $t->timestamps();
        });

        Schema::create('webhook_events', function (Blueprint $t) {
            $t->id();
            $t->string('provider', 40);
            $t->string('event_id', 120);
            $t->json('payload');
            $t->string('result', 40)->nullable();
            $t->timestamp('processed_at')->nullable();
            $t->timestamps();
            $t->unique(['provider', 'event_id']);
        });

        Schema::create('posts', function (Blueprint $t) {
            $t->id();
            $t->string('type', 20)->default('article'); // article | offer
            $t->string('slug', 120)->unique();
            $t->string('title');
            $t->string('excerpt', 300)->nullable();
            $t->longText('body');
            $t->string('cover')->nullable();
            $t->string('cover_alt')->nullable();
            $t->date('valid_from')->nullable();
            $t->date('valid_to')->nullable();
            $t->string('status', 20)->default('draft'); // draft | published
            $t->timestamp('published_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['posts', 'webhook_events', 'notifications_outbox', 'audit_logs', 'staff_shifts', 'feedback', 'lost_items',
                     'maintenance_tickets', 'housekeeping_tasks', 'inventory_movements', 'inventory_items', 'cash_entries', 'payments',
                     'shifts', 'payment_methods', 'folio_lines', 'service_packages', 'services', 'room_nights', 'stay_nights', 'folios',
                     'stay_guests', 'stays', 'bookings', 'customers'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
