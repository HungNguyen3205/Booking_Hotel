<?php
namespace Tests\Feature;

use App\Models\Booking;
use App\Models\HousekeepingTask;
use App\Models\Payment;
use App\Models\RateRule;
use App\Models\Property;
use App\Models\Room;
use App\Models\Service;
use App\Models\Stay;
use App\Services\AvailabilityService;
use App\Services\BookingService;
use App\Services\Settings;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Kiểm thử các tình huống bắt buộc (mục K) và quy tắc nghiệp vụ chính. */
class OperationsTest extends TestCase
{
    // 1. Hai yêu cầu đặt cùng một phòng không gây bán trùng
    public function test_same_room_cannot_be_sold_twice(): void
    {
        $room = $this->roomNo('205');
        $stay = ['room_type_id' => $room->room_type_id, 'room_id' => $room->id, 'check_in' => $this->day(1), 'check_out' => $this->day(3)];
        $this->book($stay)->assertCreated();
        $this->book($stay)->assertStatus(409);
        // Chồng một phần cũng bị chặn
        $this->book(['check_in' => $this->day(2), 'check_out' => $this->day(4)] + $stay)->assertStatus(409);
        $this->assertSame(2, DB::table('room_nights')->where('room_id', $room->id)->count());

        // Lớp bảo vệ cuối ở cơ sở dữ liệu: khóa chính (phòng, đêm) chặn ghi trùng dù bỏ qua kiểm tra ứng dụng
        $this->expectException(QueryException::class);
        DB::table('room_nights')->insert(['room_id' => $room->id, 'night' => $this->day(1), 'stay_id' => null]);
    }

    public function test_last_room_of_type_goes_to_exactly_one_request(): void
    {
        $fam = $this->type('FAM');
        for ($i = 0; $i < 3; $i++) {
            $this->book(['room_type_id' => $fam->id, 'check_in' => $this->day(1), 'check_out' => $this->day(2)])->assertCreated();
        }
        $statuses = [];
        for ($i = 0; $i < 2; $i++) {
            $statuses[] = $this->book(['room_type_id' => $fam->id, 'check_in' => $this->day(1), 'check_out' => $this->day(2)])->status();
        }
        $this->assertSame([201, 409], $statuses);
        $this->assertSame(4, DB::table('room_nights')->where('night', $this->day(1))->count());
    }

    // 2. Hết hạn giữ chỗ thì tồn được giải phóng
    public function test_expired_hold_releases_inventory(): void
    {
        $fam = $this->type('FAM');
        $holds = [];
        for ($i = 0; $i < 4; $i++) {
            $holds[] = $this->bookingOf($this->book(['room_type_id' => $fam->id, 'check_in' => $this->day(1), 'check_out' => $this->day(3)],
                ['status' => 'hold', 'hold_minutes' => 30]));
        }
        $this->getJson('/api/public/availability?check_in='.$this->day(1).'&check_out='.$this->day(3).'&adults=2')
            ->assertSuccessful()->assertJsonPath('results.2.available', false);

        $this->travel(31)->minutes();
        $res = $this->getJson('/api/public/availability?check_in='.$this->day(1).'&check_out='.$this->day(3).'&adults=2')->assertSuccessful();
        $this->assertTrue($res->json('results.2.available'));
        $this->assertSame('cancelled', $holds[0]->refresh()->status);
        $this->assertSame(0, DB::table('room_nights')->count());
        $this->assertTrue(Stay::where('booking_id', $holds[0]->id)->first()->nights()->where('void', false)->doesntExist());
    }

    public function test_paid_deposit_confirms_hold_and_keeps_inventory(): void
    {
        $b = $this->bookingOf($this->book(['room_type_id' => $this->type('DBL')->id, 'check_in' => $this->day(1), 'check_out' => $this->day(2)],
            ['status' => 'hold', 'hold_minutes' => 30]));
        $this->actingAs($this->owner)->postJson('/api/admin/shifts', ['opening_cash' => 0])->assertSuccessful();
        $this->postJson("/api/admin/bookings/{$b->id}/payments", ['kind' => 'deposit', 'method' => 'cash', 'amount' => 135000])->assertSuccessful();
        $this->assertSame('confirmed', $b->refresh()->status);
        $this->travel(2)->hours();
        app(AvailabilityService::class)->releaseExpiredHolds();
        $this->assertSame('confirmed', $b->refresh()->status);
    }

    // 3. Khách trả và khách mới nhận cùng ngày
    public function test_same_day_turnover(): void
    {
        $room = $this->roomNo('206');
        $base = ['room_type_id' => $room->room_type_id, 'room_id' => $room->id];
        $a = $this->bookingOf($this->book($base + ['check_in' => $this->day(0), 'check_out' => $this->day(2)]));
        $this->postJson('/api/admin/stays/'.$a->stays()->first()->id.'/check-in', [])->assertSuccessful();
        // Khách sau nhận đúng ngày khách trước trả: tồn hợp lệ
        $b = $this->bookingOf($this->book($base + ['check_in' => $this->day(2), 'check_out' => $this->day(4)]));

        $this->travel(2)->days();
        $bStay = $b->stays()->first();
        // Khách trước chưa trả phòng -> chưa thể nhận
        $this->postJson("/api/admin/stays/{$bStay->id}/check-in", [])->assertStatus(409);
        $this->postJson("/api/admin/bookings/{$a->id}/payments", ['kind' => 'payment', 'method' => 'bank_transfer', 'amount' => 900000])->assertSuccessful();
        $this->postJson('/api/admin/stays/'.$a->stays()->first()->id.'/check-out', [])->assertSuccessful();
        // Phòng bẩn -> chưa nhận được (chủ có quyền ngoại lệ nhưng phải nhập lý do)
        $this->postJson("/api/admin/stays/{$bStay->id}/check-in", [])->assertStatus(422);
        $task = HousekeepingTask::where('room_id', $room->id)->where('status', 'open')->firstOrFail();
        $this->postJson("/api/admin/housekeeping/tasks/{$task->id}/start")->assertSuccessful();
        $this->postJson("/api/admin/housekeeping/tasks/{$task->id}/finish", [])->assertSuccessful();
        $this->postJson("/api/admin/housekeeping/tasks/{$task->id}/inspect", ['passed' => true])->assertSuccessful();
        $this->postJson("/api/admin/stays/{$bStay->id}/check-in", [])->assertSuccessful()->assertJsonPath('status', 'checked_in');
    }

    // 4. Chuyển phòng/gia hạn có kiểm tra tồn và tính tiền
    public function test_extend_checks_conflicts_and_prices_new_nights(): void
    {
        $room = $this->roomNo('207');
        $base = ['room_type_id' => $room->room_type_id, 'room_id' => $room->id];
        $a = $this->bookingOf($this->book($base + ['check_in' => $this->day(0), 'check_out' => $this->day(2)]));
        $this->bookingOf($this->book($base + ['check_in' => $this->day(3), 'check_out' => $this->day(5)]));
        $stay = $a->stays()->first();

        $quote = $this->postJson("/api/admin/stays/{$stay->id}/dates/quote", ['check_in' => $this->day(0), 'check_out' => $this->day(3)])->assertSuccessful();
        $this->assertTrue($quote->json('ok'));
        $this->assertSame(450000, $quote->json('delta'));
        $this->postJson("/api/admin/stays/{$stay->id}/dates", ['check_in' => $this->day(0), 'check_out' => $this->day(3), 'expected_delta' => 450000])->assertSuccessful();

        $conflict = $this->postJson("/api/admin/stays/{$stay->id}/dates/quote", ['check_in' => $this->day(0), 'check_out' => $this->day(4)])->assertSuccessful();
        $this->assertFalse($conflict->json('ok'));
        $this->assertSame([$this->day(3)], $conflict->json('conflicts'));
        $this->assertNotEmpty($conflict->json('alternatives'));
        $this->postJson("/api/admin/stays/{$stay->id}/dates", ['check_in' => $this->day(0), 'check_out' => $this->day(4)])->assertStatus(409);
        $this->assertSame(1350000, app(\App\Services\FolioService::class)->bookingTotals($a->refresh()->load('folios'))['charges']);
    }

    public function test_move_quote_shows_price_difference(): void
    {
        $from = $this->roomNo('205');
        $to = $this->roomNo('403'); // phòng gia đình
        $a = $this->bookingOf($this->book(['room_type_id' => $from->room_type_id, 'room_id' => $from->id, 'check_in' => $this->day(0), 'check_out' => $this->day(3)]));
        $stay = $a->stays()->first();
        $this->postJson("/api/admin/stays/{$stay->id}/check-in", [])->assertSuccessful();

        $q = $this->postJson("/api/admin/stays/{$stay->id}/move/quote", ['room_id' => $to->id, 'reprice' => true])->assertSuccessful();
        $this->assertSame(450000, $q->json('delta')); // 3 đêm × (600k − 450k)
        $keep = $this->postJson("/api/admin/stays/{$stay->id}/move/quote", ['room_id' => $to->id, 'reprice' => false])->assertSuccessful();
        $this->assertSame(0, $keep->json('delta')); // nâng hạng giữ giá
    }

    public function test_move_requires_reason_and_free_room(): void
    {
        $from = $this->roomNo('205');
        $to = $this->roomNo('403');
        $a = $this->bookingOf($this->book(['room_type_id' => $from->room_type_id, 'room_id' => $from->id, 'check_in' => $this->day(0), 'check_out' => $this->day(3)]));
        $stay = $a->stays()->first();
        $this->postJson("/api/admin/stays/{$stay->id}/check-in", [])->assertSuccessful();
        $this->postJson("/api/admin/stays/{$stay->id}/move", ['room_id' => $to->id])->assertStatus(422);

        $this->postJson("/api/admin/stays/{$stay->id}/move", ['room_id' => $to->id, 'reprice' => true, 'reason' => 'Khách cần phòng rộng', 'expected_delta' => 450000])
            ->assertSuccessful()->assertJsonPath('room_id', $to->id);
        $this->assertSame('dirty', $from->refresh()->housekeeping);
        $this->assertTrue(HousekeepingTask::where('room_id', $from->id)->where('status', 'open')->exists());
        $this->assertSame(1800000, app(\App\Services\FolioService::class)->bookingTotals($a->refresh()->load('folios'))['charges']);
        // Đêm cũ thuộc phòng cũ được giữ trong lịch sử, đêm còn lại thuộc phòng mới
        $this->assertSame(0, DB::table('room_nights')->where('room_id', $from->id)->where('night', '>=', $this->day(0))->count());
        $this->assertSame(3, DB::table('room_nights')->where('room_id', $to->id)->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'stay.move', 'reason' => 'Khách cần phòng rộng', 'user_id' => $this->owner->id]);

        // Phòng đích đã có khách khác -> không chuyển được
        $other = $this->bookingOf($this->book(['room_type_id' => $from->room_type_id, 'room_id' => $this->roomNo('206')->id, 'check_in' => $this->day(0), 'check_out' => $this->day(1)]));
        $this->postJson('/api/admin/stays/'.$other->stays()->first()->id.'/move', ['room_id' => $to->id, 'reason' => 'thử'])->assertStatus(409);
    }

    // 5. Checkout cập nhật công nợ và chuyển phòng sang cần dọn
    public function test_checkout_requires_settlement_or_records_debt_and_dirties_room(): void
    {
        $room = $this->roomNo('301');
        $a = $this->bookingOf($this->book(['room_type_id' => $room->room_type_id, 'room_id' => $room->id, 'check_in' => $this->day(0), 'check_out' => $this->day(1)]));
        $stay = $a->stays()->first();
        $this->postJson("/api/admin/stays/{$stay->id}/check-in", [])->assertSuccessful();
        $this->travel(1)->days();
        $this->postJson("/api/admin/stays/{$stay->id}/check-out", [])->assertStatus(409)->assertJsonFragment(['message' => 'Còn phải thu 350.000đ. Thu đủ trước khi trả phòng hoặc chọn ghi công nợ.']);

        $receptionist = $this->staff('receptionist');
        $this->actingAs($receptionist)->postJson("/api/admin/stays/{$stay->id}/check-out", ['settle_later' => true, 'reason' => 'x'])->assertStatus(403);
        $this->actingAs($this->owner)->postJson("/api/admin/stays/{$stay->id}/check-out", ['settle_later' => true, 'reason' => 'Khách quen, chuyển khoản sau'])->assertSuccessful();
        $this->assertSame('dirty', $room->refresh()->housekeeping);
        $this->assertSame('checked_out', $a->refresh()->status);
        $debt = collect($this->getJson('/api/admin/receivables')->assertSuccessful()->json())->firstWhere('booking_id', $a->id);
        $this->assertSame(350000, $debt['balance']);
    }

    public function test_early_departure_voids_unused_nights_and_frees_room(): void
    {
        $room = $this->roomNo('302');
        $a = $this->bookingOf($this->book(['room_type_id' => $room->room_type_id, 'room_id' => $room->id, 'check_in' => $this->day(0), 'check_out' => $this->day(3)]));
        $stay = $a->stays()->first();
        $this->postJson("/api/admin/stays/{$stay->id}/check-in", [])->assertSuccessful();
        $this->travel(1)->days();
        $q = $this->postJson("/api/admin/stays/{$stay->id}/check-out/quote", [])->assertSuccessful();
        $this->assertSame(1050000, $q->json('balance_before'));  // 3 đêm chưa thu
        $this->assertSame(700000, $q->json('voided_amount'));    // 2 đêm chưa ở bị hủy
        $this->assertSame(350000, $q->json('balance_after'));    // chỉ thu 1 đêm đã ở
        $this->postJson("/api/admin/bookings/{$a->id}/payments", ['kind' => 'payment', 'method' => 'bank_transfer', 'amount' => 350000])->assertSuccessful();
        $this->postJson("/api/admin/stays/{$stay->id}/check-out", ['expected_balance' => 999])->assertStatus(409);
        $this->postJson("/api/admin/stays/{$stay->id}/check-out", ['expected_balance' => 0])->assertSuccessful()->assertJsonPath('check_out', $this->day(0));
        $this->assertSame(1, DB::table('room_nights')->where('room_id', $room->id)->count());
    }

    // 6. Không nhận phòng chưa sẵn sàng nếu không có quyền ngoại lệ
    public function test_dirty_room_checkin_needs_override_permission_and_reason(): void
    {
        $room = $this->roomNo('303');
        $room->update(['housekeeping' => 'dirty']);
        $a = $this->bookingOf($this->book(['room_type_id' => $room->room_type_id, 'room_id' => $room->id, 'check_in' => $this->day(0), 'check_out' => $this->day(1)]));
        $stay = $a->stays()->first();
        $this->actingAs($this->staff('receptionist'))->postJson("/api/admin/stays/{$stay->id}/check-in", ['override_reason' => 'Khách gấp'])->assertStatus(403);
        $manager = $this->staff('manager');
        $this->actingAs($manager)->postJson("/api/admin/stays/{$stay->id}/check-in", [])->assertStatus(422);
        $this->actingAs($manager)->postJson("/api/admin/stays/{$stay->id}/check-in", ['override_reason' => 'Khách gấp, phòng đã lau nhanh'])->assertSuccessful();
        $this->assertSame('Khách gấp, phòng đã lau nhanh', $stay->refresh()->dirty_override_reason);
        $this->assertDatabaseHas('audit_logs', ['action' => 'stay.check_in', 'user_id' => $manager->id, 'reason' => 'Khách gấp, phòng đã lau nhanh']);
    }

    // 7. Cọc, thu thêm, hoàn tiền và số còn phải thu khớp nhau
    public function test_deposit_payment_refund_balance_reconcile(): void
    {
        $fam = $this->type('FAM');
        $a = $this->bookingOf($this->book(['room_type_id' => $fam->id, 'check_in' => $this->day(1), 'check_out' => $this->day(3), 'adults' => 2]));
        $this->assertSame(360000, $a->deposit_required); // 30% của 1.200.000
        $this->postJson("/api/admin/bookings/{$a->id}/payments", ['kind' => 'deposit', 'method' => 'cash', 'amount' => 360000])
            ->assertStatus(409); // tiền mặt cần mở ca
        $this->postJson('/api/admin/shifts', ['opening_cash' => 500000])->assertSuccessful();
        $this->postJson("/api/admin/bookings/{$a->id}/payments", ['kind' => 'deposit', 'method' => 'cash', 'amount' => 360000])->assertSuccessful();
        $folio = $a->folios()->first();
        $minibar = Service::create(['property_id' => Property::first()->id, 'category' => 'laundry', 'name' => 'Giặt', 'unit' => 'kg', 'price' => 50000]);
        $line = $this->postJson("/api/admin/folios/{$folio->id}/services", ['service_id' => $minibar->id, 'quantity' => 2])->assertSuccessful();
        $this->postJson("/api/admin/folios/{$folio->id}/lines", ['type' => 'discount', 'description' => 'Giảm giá', 'amount' => -100000])->assertStatus(422);
        $this->postJson("/api/admin/folios/{$folio->id}/lines", ['type' => 'discount', 'description' => 'Giảm giá', 'amount' => -100000, 'reason' => 'Khách thân thiết'])->assertSuccessful();
        $this->postJson("/api/admin/bookings/{$a->id}/payments", ['kind' => 'payment', 'method' => 'cash', 'amount' => 2000000])->assertStatus(422);
        $this->postJson("/api/admin/bookings/{$a->id}/payments", ['kind' => 'payment', 'method' => 'bank_transfer', 'amount' => 840000])->assertSuccessful();
        $this->postJson('/api/admin/folio-lines/'.$line->json('id').'/void', ['reason' => 'Ghi nhầm'])->assertSuccessful();
        $this->postJson("/api/admin/bookings/{$a->id}/refunds", ['method' => 'cash', 'amount' => 2000000, 'reason' => 'x'])->assertStatus(422);
        $this->postJson("/api/admin/bookings/{$a->id}/refunds", ['method' => 'cash', 'amount' => 100000, 'reason' => 'Hoàn phần giặt ủi đã hủy'])->assertSuccessful();

        $t = app(\App\Services\FolioService::class)->bookingTotals($a->refresh()->load('folios'));
        // Phát sinh: 1.200.000 + 100.000 − 100.000 (hủy) − 100.000 (giảm) = 1.100.000; Đã thu: 360.000 + 840.000 − 100.000 = 1.100.000
        $this->assertSame(1100000, $t['charges']);
        $this->assertSame(360000, $t['deposits']);
        $this->assertSame(840000, $t['payments']);
        $this->assertSame(100000, $t['refunds']);
        $this->assertSame(0, $t['balance']);
        $shift = $this->getJson('/api/admin/shifts/current')->json('shift');
        $this->assertSame(500000 + 360000 - 100000, $shift['expected_cash']);
        $this->assertSame(2, DB::table('folio_lines')->where('type', 'service')->count()); // dòng gốc + dòng đảo, không xóa
    }

    // 8. Webhook lặp không tạo khoản thu lặp
    public function test_webhook_is_authenticated_and_idempotent(): void
    {
        $a = $this->bookingOf($this->book(['room_type_id' => $this->type('DBL')->id, 'check_in' => $this->day(1), 'check_out' => $this->day(2)], ['status' => 'hold']));
        $body = json_encode(['event_id' => 'evt-1', 'transaction_id' => 'tx-1', 'amount' => 135000, 'content' => "CK {$a->code} coc phong"]);
        $sig = hash_hmac('sha256', $body, 'test-webhook-secret');
        $send = fn ($b, $s) => $this->call('POST', '/api/webhooks/payments/bank', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_SIGNATURE' => $s, 'HTTP_ACCEPT' => 'application/json'], $b);
        $send($body, 'bad')->assertStatus(401);
        $send($body, $sig)->assertSuccessful()->assertJsonPath('result', 'recorded');
        $send($body, $sig)->assertSuccessful()->assertJsonPath('result', 'duplicate');
        // Cùng giao dịch nhưng event_id khác (nhà cung cấp gửi lại) vẫn không ghi lặp
        $body2 = json_encode(['event_id' => 'evt-2', 'transaction_id' => 'tx-1', 'amount' => 135000, 'content' => "CK {$a->code}"]);
        $send($body2, hash_hmac('sha256', $body2, 'test-webhook-secret'))->assertSuccessful()->assertJsonPath('result', 'duplicate_transaction');
        $this->assertSame(1, Payment::where('booking_id', $a->id)->where('status', 'completed')->count());
        $this->assertSame('confirmed', $a->refresh()->status);
    }

    public function test_guest_transfer_claim_is_not_counted_as_paid(): void
    {
        $res = $this->publicBooking();
        $code = $res->json('code');
        $this->postJson("/api/public/bookings/$code/transfer-notice", ['contact' => 'khach@example.test', 'amount' => 135000])->assertSuccessful()
            ->assertJsonPath('paid', 0)->assertJsonPath('pending_claims', 135000);
        $b = Booking::where('code', $code)->first();
        $this->assertSame('hold', $b->status);
        $claim = Payment::where('booking_id', $b->id)->where('status', 'pending')->first();
        $this->actingAs($this->owner)->postJson("/api/admin/payment-claims/{$claim->id}/confirm", ['amount' => 135000, 'reference' => 'FT123'])->assertSuccessful();
        $this->assertSame('confirmed', $b->refresh()->status);
    }

    // 9. Nhân viên không truy cập được nghiệp vụ ngoài quyền
    public function test_permissions_are_enforced_by_backend(): void
    {
        $hk = $this->staff('housekeeping');
        $a = $this->bookingOf($this->book(['room_type_id' => $this->type('DBL')->id, 'check_in' => $this->day(1), 'check_out' => $this->day(2)]));
        $this->actingAs($hk)->getJson('/api/admin/bookings')->assertStatus(403);
        $this->actingAs($hk)->postJson("/api/admin/bookings/{$a->id}/payments", ['kind' => 'payment', 'method' => 'bank_transfer', 'amount' => 1000])->assertStatus(403);
        $this->actingAs($hk)->getJson('/api/admin/reports/summary')->assertStatus(403);
        $this->actingAs($hk)->getJson('/api/admin/housekeeping/tasks')->assertSuccessful();
        $this->actingAs($hk)->getJson('/api/admin/room-map')->assertSuccessful()->assertJsonPath('show_balance', false);

        $rec = $this->staff('receptionist');
        $this->actingAs($rec)->postJson("/api/admin/bookings/{$a->id}/refunds", ['method' => 'cash', 'amount' => 1000, 'reason' => 'x'])->assertStatus(403);
        $folio = $a->folios()->first();
        $this->actingAs($rec)->postJson("/api/admin/folios/{$folio->id}/lines", ['type' => 'discount', 'description' => 'x', 'amount' => -1000, 'reason' => 'x'])->assertStatus(403);
        $this->actingAs($rec)->putJson('/api/admin/setup/rate-rules/1', [])->assertStatus(403);
        $this->actingAs($rec)->getJson('/api/admin/reports/export/payments')->assertStatus(403);

        $tech = $this->staff('technician');
        $this->actingAs($tech)->postJson("/api/admin/stays/{$a->stays()->first()->id}/check-in")->assertStatus(403);

        // Không thuộc cơ sở -> bị chặn
        $outsider = \App\Models\User::create(['name' => 'Ngoài', 'email' => 'x@test.local', 'password' => 'secret-password-1', 'role' => 'manager']);
        $this->actingAs($outsider)->getJson('/api/admin/bookings')->assertStatus(403);
        // Tài khoản bị khóa
        $rec->update(['active' => false]);
        $this->actingAs($rec->refresh())->getJson('/api/admin/bookings')->assertStatus(401);
        $this->postJson('/api/logout');
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/admin/bookings')->assertStatus(401);
    }

    public function test_guest_document_number_is_encrypted_and_hidden_without_permission(): void
    {
        $c = \App\Models\Customer::create(['full_name' => 'Khách giấy tờ', 'id_type' => 'cccd', 'id_number' => '012345678901',
            'id_number_hash' => \App\Models\Customer::hashDocument('012345678901')]);
        $this->assertNotSame('012345678901', DB::table('customers')->where('id', $c->id)->value('id_number'));
        $this->actingAs($this->owner)->getJson("/api/admin/customers/{$c->id}")->assertSuccessful()->assertJsonPath('customer.id_number', '012345678901');
        $acc = $this->staff('accountant');
        $this->actingAs($acc)->getJson("/api/admin/customers/{$c->id}")->assertSuccessful()->assertJsonMissingPath('customer.id_number');
    }

    // 10. Website và admin hiển thị tồn phòng nhất quán
    public function test_website_and_admin_share_inventory(): void
    {
        $sgl = $this->type('SGL');
        for ($i = 0; $i < 5; $i++) {
            $this->book(['room_type_id' => $sgl->id, 'check_in' => $this->day(1), 'check_out' => $this->day(2)])->assertCreated();
        }
        $this->publicBooking(); // đặt thêm 1 phòng đơn qua website
        $admin = collect($this->actingAs($this->owner)->getJson('/api/admin/availability?check_in='.$this->day(1).'&check_out='.$this->day(2))->json('types'))
            ->firstWhere('code', 'SGL');
        $this->assertSame(2, $admin['available']);
        $public = collect($this->getJson('/api/public/availability?check_in='.$this->day(1).'&check_out='.$this->day(2).'&adults=1')->json('results'))
            ->firstWhere('room_type.id', $sgl->id);
        $this->assertTrue($public['available']);
        $this->assertSame(2, $public['remaining']);
        $public3 = collect($this->getJson('/api/public/availability?check_in='.$this->day(1).'&check_out='.$this->day(2).'&adults=3&rooms=3')->json('results'))
            ->firstWhere('room_type.id', $sgl->id);
        $this->assertFalse($public3['available']);
        // Phản hồi công khai không chứa dữ liệu khách hay nội bộ
        $raw = $this->getJson('/api/public/availability?check_in='.$this->day(1).'&check_out='.$this->day(2).'&adults=1')->getContent();
        $this->assertStringNotContainsString('Khách Test', $raw);
        $this->assertStringNotContainsString('"number"', $raw);
    }

    public function test_website_booking_is_idempotent_and_validates_price(): void
    {
        $key = (string) Str::uuid();
        $first = $this->publicBooking($key);
        $again = $this->publicBooking($key);
        $this->assertSame($first->json('code'), $again->json('code'));
        $this->assertSame(1, Booking::count());
        $this->publicBooking(null, ['expected_total' => 1])->assertStatus(409);
        $lookup = $this->postJson('/api/public/bookings/lookup', ['code' => $first->json('code'), 'contact' => 'KHACH@example.test'])->assertSuccessful();
        $this->assertSame('hold', $lookup->json('status'));
        $this->postJson('/api/public/bookings/lookup', ['code' => $first->json('code'), 'contact' => 'nguoi-khac@example.test'])->assertStatus(404);
    }

    public function test_pricing_precedence_and_snapshot(): void
    {
        $dbl = $this->type('DBL');
        $night = now()->addDays(10);
        RateRule::create(['room_type_id' => $dbl->id, 'kind' => 'weekend', 'name' => 'Cuối tuần', 'days_of_week' => [$night->dayOfWeek], 'price' => 500000]);
        RateRule::create(['room_type_id' => $dbl->id, 'kind' => 'season', 'name' => 'Mùa cao điểm', 'start_date' => $night->toDateString(), 'end_date' => $night->toDateString(), 'price' => 550000]);
        $holiday = RateRule::create(['room_type_id' => $dbl->id, 'kind' => 'holiday', 'name' => 'Lễ', 'start_date' => $night->toDateString(), 'end_date' => $night->toDateString(), 'price' => 700000]);
        $q = app(\App\Services\PricingService::class)->quote($dbl, null, $night->toDateString(), $night->copy()->addDay()->toDateString(), 2);
        $this->assertSame(700000, $q['total']); // Lễ > Mùa > Cuối tuần
        RateRule::create(['room_type_id' => $dbl->id, 'kind' => 'weekend', 'name' => 'Ưu tiên tay', 'days_of_week' => [$night->dayOfWeek], 'price' => 480000, 'priority' => 10]);
        $q = app(\App\Services\PricingService::class)->quote($dbl, null, $night->toDateString(), $night->copy()->addDay()->toDateString(), 2);
        $this->assertSame(480000, $q['total']); // priority cao thắng

        $b = $this->bookingOf($this->book(['room_type_id' => $dbl->id, 'check_in' => $night->toDateString(), 'check_out' => $night->copy()->addDay()->toDateString(), 'adults' => 2]));
        RateRule::query()->update(['price' => 999000]);
        $dbl->update(['base_rate' => 999000]);
        $this->assertSame(480000, (int) $b->stays()->first()->nights()->sum('amount')); // giá đã chụp không đổi
    }

    public function test_cancellation_fee_follows_policy_and_no_show(): void
    {
        $dbl = $this->type('DBL');
        $early = $this->bookingOf($this->book(['room_type_id' => $dbl->id, 'check_in' => $this->day(5), 'check_out' => $this->day(6)]));
        $this->postJson("/api/admin/bookings/{$early->id}/cancel", ['reason' => 'Khách đổi kế hoạch', 'charge_fee' => true])->assertSuccessful()->assertJsonPath('status', 'cancelled');
        $this->assertSame(0, app(\App\Services\FolioService::class)->bookingTotals($early->refresh()->load('folios'))['charges']);

        $late = $this->bookingOf($this->book(['room_type_id' => $dbl->id, 'check_in' => $this->day(1), 'check_out' => $this->day(3)]));
        $this->postJson("/api/admin/bookings/{$late->id}/cancel", ['reason' => 'Hủy sát ngày', 'charge_fee' => true])->assertSuccessful();
        $this->assertSame(450000, app(\App\Services\FolioService::class)->bookingTotals($late->refresh()->load('folios'))['charges']);
        $this->assertSame(0, DB::table('room_nights')->count());

        $ns = $this->bookingOf($this->book(['room_type_id' => $dbl->id, 'check_in' => $this->day(1), 'check_out' => $this->day(2)]));
        $this->postJson("/api/admin/bookings/{$ns->id}/cancel", ['reason' => 'Không đến', 'mode' => 'no_show'])->assertStatus(409);
        $this->travel(1)->days();
        $this->postJson("/api/admin/bookings/{$ns->id}/cancel", ['reason' => 'Không đến', 'mode' => 'no_show', 'charge_fee' => true])->assertSuccessful()->assertJsonPath('status', 'no_show');
    }

    public function test_minibar_sale_deducts_stock_once_and_restores_on_void(): void
    {
        $item = \App\Models\InventoryItem::create(['property_id' => Property::first()->id, 'sku' => 'W', 'name' => 'Nước', 'category' => 'minibar', 'unit' => 'chai', 'min_stock' => 2]);
        $this->actingAs($this->owner)->postJson('/api/admin/inventory/movements', ['inventory_item_id' => $item->id, 'type' => 'receive', 'quantity' => 10])->assertSuccessful();
        $svc = Service::create(['property_id' => Property::first()->id, 'category' => 'minibar', 'name' => 'Nước minibar', 'unit' => 'chai', 'price' => 15000, 'inventory_item_id' => $item->id]);
        $a = $this->bookingOf($this->book(['room_type_id' => $this->type('DBL')->id, 'check_in' => $this->day(0), 'check_out' => $this->day(1)]));
        $line = $this->postJson('/api/admin/folios/'.$a->folios()->first()->id.'/services', ['service_id' => $svc->id, 'quantity' => 3])->assertSuccessful();
        $this->assertSame(7, $item->refresh()->on_hand);
        $this->assertThrows(fn () => app(\App\Services\InventoryService::class)->sale($item->id, 3, 'folio_line', $line->json('id')));
        $this->assertSame(7, $item->refresh()->on_hand);
        $this->postJson('/api/admin/folio-lines/'.$line->json('id').'/void', ['reason' => 'Khách không dùng'])->assertSuccessful();
        $this->postJson('/api/admin/folio-lines/'.$line->json('id').'/void', ['reason' => 'Lặp'])->assertStatus(409);
        $this->assertSame(10, $item->refresh()->on_hand);
    }

    public function test_walk_in_sale_reversal_restores_stock_once(): void
    {
        $item = \App\Models\InventoryItem::create(['property_id' => Property::first()->id, 'sku' => 'CF', 'name' => 'Cà phê gói', 'category' => 'consumable', 'unit' => 'gói', 'min_stock' => 1]);
        $this->actingAs($this->owner)->postJson('/api/admin/inventory/movements', ['inventory_item_id' => $item->id, 'type' => 'receive', 'quantity' => 5])->assertSuccessful();
        $svc = Service::create(['property_id' => Property::first()->id, 'category' => 'coffee', 'name' => 'Cà phê', 'unit' => 'ly', 'price' => 30000, 'inventory_item_id' => $item->id]);
        $this->postJson('/api/admin/shifts', ['opening_cash' => 0])->assertSuccessful();
        $entry = $this->postJson('/api/admin/services/walk-in', ['service_id' => $svc->id, 'quantity' => 2, 'method' => 'cash'])->assertSuccessful();
        $this->assertSame(3, $item->refresh()->on_hand);
        $this->postJson('/api/admin/cash-entries/'.$entry->json('id').'/reverse', ['reason' => 'Khách đổi ý'])->assertSuccessful();
        $this->postJson('/api/admin/cash-entries/'.$entry->json('id').'/reverse', ['reason' => 'Lặp'])->assertStatus(409);
        $this->assertSame(5, $item->refresh()->on_hand);
        $this->assertSame(0, app(\App\Services\ReportService::class)->summary(1, $this->day(0), $this->day(0))['service_revenue']);
    }

    public function test_dashboard_charts_match_bookings(): void
    {
        $room = $this->roomNo('301');
        $guest = $this->bookingOf($this->book(['room_type_id' => $room->room_type_id, 'room_id' => $room->id, 'check_in' => $this->day(0), 'check_out' => $this->day(2)]));
        $this->postJson('/api/admin/stays/'.$guest->stays()->first()->id.'/check-in', [])->assertSuccessful();
        $this->bookingOf($this->book(['room_type_id' => $this->type('SGL')->id, 'check_in' => $this->day(1), 'check_out' => $this->day(3)], ['source' => 'direct']));

        $res = $this->getJson('/api/admin/dashboard')->assertSuccessful();
        $total = Room::count();
        $this->assertSame($total, array_sum($res->json('charts.room_status')));
        $this->assertSame(1, $res->json('charts.room_status.occupied'));
        $forecast = $res->json('charts.forecast');
        $this->assertCount(14, $forecast);
        $this->assertSame([1, 2, 1, 0], array_column(array_slice($forecast, 0, 4), 'sold'));
        $this->assertSame($total, $forecast[0]['available']);
        $sources = collect($res->json('charts.sources'))->pluck('bookings', 'source');
        $this->assertSame(1, $sources['phone']);
        $this->assertSame(1, $sources['direct']);
        $this->assertCount(14, $res->json('trend'));

        // Lễ tân không có quyền doanh thu: vẫn thấy biểu đồ vận hành, không thấy nguồn/doanh thu
        $res = $this->actingAs($this->staff('receptionist'))->getJson('/api/admin/dashboard')->assertSuccessful();
        $this->assertNotNull($res->json('charts.forecast'));
        $this->assertNull($res->json('charts.sources'));
        $this->assertNull($res->json('trend'));
    }

    public function test_daily_automation_marks_no_show_creates_stayover_cleaning_and_assigns(): void
    {
        $hk = $this->staff('housekeeping');
        $late = $this->bookingOf($this->book(['room_type_id' => $this->type('DBL')->id, 'check_in' => $this->day(0), 'check_out' => $this->day(2)]));
        $room = $this->roomNo('301');
        $guest = $this->bookingOf($this->book(['room_type_id' => $room->room_type_id, 'room_id' => $room->id, 'check_in' => $this->day(0), 'check_out' => $this->day(3)]));
        $this->postJson('/api/admin/stays/'.$guest->stays()->first()->id.'/check-in', [])->assertSuccessful();

        $this->travel(1)->days();
        $this->getJson('/api/admin/dashboard')->assertSuccessful()->assertJsonPath('automation.no_shows', 1)->assertJsonPath('automation.stayover_tasks', 1);
        $this->assertSame('no_show', $late->refresh()->status);
        $this->assertSame(0, DB::table('room_nights')->whereIn('stay_id', $late->stays()->pluck('id'))->count());
        $task = \App\Models\HousekeepingTask::where('room_id', $room->id)->where('status', 'open')->firstOrFail();
        $this->assertSame($hk->id, $task->assigned_to);
        $this->assertDatabaseHas('audit_logs', ['action' => 'automation.daily', 'user_id' => null]);
        // Chạy lại trong ngày: không làm lặp
        $this->getJson('/api/admin/dashboard')->assertSuccessful();
        $this->assertSame(1, \App\Models\AuditLog::where('action', 'automation.daily')->count());
    }

    public function test_booking_code_is_guest_phone_and_unique(): void
    {
        $dbl = $this->type('DBL')->id;
        $mk = fn (string $phone, int $d) => $this->bookingOf($this->actingAs($this->owner)->postJson('/api/admin/bookings', ['source' => 'phone', 'status' => 'hold',
            'customer' => ['full_name' => 'Khách mã SĐT', 'phone' => $phone], 'stays' => [['room_type_id' => $dbl, 'check_in' => $this->day($d), 'check_out' => $this->day($d + 1), 'adults' => 1]]]));
        $this->assertSame('0905123456', $mk('0905 123 456', 1)->code);
        $this->assertSame('0905123456B', $mk('+84905123456', 2)->code);
        $company = \App\Models\Customer::create(['kind' => 'company', 'full_name' => 'Cty không SĐT']);
        $b = $this->bookingOf($this->postJson('/api/admin/bookings', ['source' => 'direct', 'status' => 'hold', 'customer_id' => $company->id,
            'stays' => [['room_type_id' => $dbl, 'check_in' => $this->day(3), 'check_out' => $this->day(4), 'adults' => 1]]]));
        $this->assertMatchesRegularExpression('/^GLG[A-Z0-9]{6}$/', $b->code);

        // Webhook nhận ra mã B trong nội dung chuyển khoản
        $body = json_encode(['event_id' => 'e-ph', 'transaction_id' => 't-ph', 'amount' => 135000, 'content' => 'CHUYEN TIEN 0905123456B COC']);
        $this->call('POST', '/api/webhooks/payments/bank', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_SIGNATURE' => hash_hmac('sha256', $body, 'test-webhook-secret')], $body)->assertJsonPath('result', 'recorded');
        $this->assertSame('confirmed', \App\Models\Booking::where('code', '0905123456B')->value('status'));
        $this->assertSame('hold', \App\Models\Booking::where('code', '0905123456')->value('status'));

        // Tra cứu công khai mã SĐT: phải dùng email, không chấp nhận chính số điện thoại
        $this->postJson('/api/public/bookings/lookup', ['code' => '0905123456', 'contact' => '0905123456'])->assertStatus(404);
    }

    public function test_booking_code_follows_phone_entered_even_if_email_matches_old_profile(): void
    {
        $first = $this->pub($this->publicBooking());
        $this->assertSame('0912345678', $first->code);
        // Cùng email nhưng khách nhập số điện thoại mới: mã phải là số mới, số mới phải được lưu
        $second = $this->pub($this->publicBooking(null, ['check_in' => $this->day(3), 'check_out' => $this->day(4),
            'customer' => ['full_name' => 'Khách Website', 'phone' => '0987 654 321', 'email' => 'khach@example.test']]));
        $this->assertSame('0987654321', $second->code);
        $this->assertSame('0987654321', $second->customer->phone);
        $this->assertNotSame($first->customer_id, $second->customer_id);
        // Cùng số điện thoại (dạng +84) dùng lại đúng hồ sơ, mã thêm hậu tố
        $third = $this->pub($this->publicBooking(null, ['check_in' => $this->day(5), 'check_out' => $this->day(6),
            'customer' => ['full_name' => 'Khách Website', 'phone' => '+84912345678', 'email' => 'khach@example.test']]));
        $this->assertSame('0912345678B', $third->code);
        $this->assertSame($first->customer_id, $third->customer_id);
        // Hồ sơ chỉ có email (chưa có SĐT): dùng lại và bổ sung số
        $emailOnly = \App\Models\Customer::create(['kind' => 'guest', 'full_name' => 'Khách chỉ email', 'email' => 'chi-email@example.test']);
        $fourth = $this->pub($this->publicBooking(null, ['check_in' => $this->day(7), 'check_out' => $this->day(8),
            'customer' => ['full_name' => 'Khách chỉ email', 'phone' => '0933111222', 'email' => 'chi-email@example.test']]));
        $this->assertSame($emailOnly->id, $fourth->customer_id);
        $this->assertSame('0933111222', $emailOnly->fresh()->phone);
    }

    public function test_room_block_prevents_sale_and_cannot_overlap_bookings(): void
    {
        $room = $this->roomNo('304');
        $this->actingAs($this->owner)->postJson("/api/admin/rooms/{$room->id}/blocks", ['type' => 'maintenance', 'start_date' => $this->day(0), 'end_date' => $this->day(2), 'reason' => 'Sửa điều hòa'])->assertSuccessful();
        $this->book(['room_type_id' => $room->room_type_id, 'room_id' => $room->id, 'check_in' => $this->day(1), 'check_out' => $this->day(2)])->assertStatus(409);
        $this->bookingOf($this->book(['room_type_id' => $room->room_type_id, 'room_id' => $room->id, 'check_in' => $this->day(3), 'check_out' => $this->day(4)]));
        $this->postJson("/api/admin/rooms/{$room->id}/blocks", ['type' => 'out_of_service', 'start_date' => $this->day(3), 'end_date' => $this->day(5), 'reason' => 'Thay rèm'])->assertStatus(409);
        $map = collect($this->getJson('/api/admin/room-map')->json('rooms'))->firstWhere('number', '304');
        $this->assertSame('maintenance', $map['availability']);
        $this->getJson('/api/admin/setup/rooms')->assertSuccessful();
        $this->deleteJson("/api/admin/setup/rooms/{$room->id}")->assertStatus(409); // đã có giao dịch -> chỉ ngừng sử dụng
    }

    public function test_searching_does_not_use_up_booking_rate_limit(): void
    {
        $q = '/api/public/availability?check_in='.$this->day(1).'&check_out='.$this->day(2).'&adults=1&rooms=1';
        for ($i = 0; $i < 15; $i++) $this->getJson($q)->assertSuccessful();
        $this->pub($this->publicBooking()); // trước khi sửa: 429 vì chung bộ đếm với tìm phòng
        // Giới hạn đặt phòng vẫn có hiệu lực (10/phút/IP) và tính riêng theo IP thật sau proxy tin cậy
        for ($i = 0; $i < 9; $i++) $this->publicBooking(null, ['expected_total' => 1])->assertStatus(409);
        $this->publicBooking()->assertStatus(429);
        $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1', 'HTTP_X_FORWARDED_FOR' => '203.0.113.7'])
            ->publicBooking(null, ['expected_total' => 1])->assertStatus(409);
    }

    private function pub($response): Booking
    {
        $response->assertCreated();
        return Booking::where('code', $response->json('code'))->firstOrFail();
    }

    private function publicBooking(?string $key = null, array $override = [])
    {
        $sgl = $this->type('SGL');
        $plan = \App\Models\RatePlan::first();
        return $this->postJson('/api/public/bookings', $override + [
            'request_key' => $key ?? (string) Str::uuid(), 'check_in' => $this->day(1), 'check_out' => $this->day(2), 'adults' => 1,
            'room_type_id' => $sgl->id, 'rate_plan_id' => $plan->id, 'expected_total' => 350000, 'accept_policy' => true,
            'customer' => ['full_name' => 'Khách Website', 'phone' => '0912345678', 'email' => 'khach@example.test'],
        ]);
    }
}
