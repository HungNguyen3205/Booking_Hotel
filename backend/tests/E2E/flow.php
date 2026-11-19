<?php
/**
 * Kiểm thử đầu-cuối qua proxy Next.js (cookie phiên + CSRF thật), dùng tài khoản demo.
 * Chạy khi cả backend (8000) và frontend (3000) đang chạy, CSDL đã seed demo:
 *   php tests/E2E/flow.php http://localhost:3000 "<HOTEL_DEMO_PASSWORD>"
 * Kịch bản: lễ tân giữ chỗ → thu cọc → nhận phòng → minibar → gia hạn → trả phòng (bị chặn khi còn nợ) → thu đủ → trả phòng
 *           → buồng phòng dọn, kiểm tra → phòng mở bán lại trên website; buồng phòng không thu tiền được.
 */
[$self, $base, $password] = $argv + [null, 'http://localhost:3000', ''];
$base = rtrim($base, '/').'/api';
$jars = [];
$fail = 0;

function req(string $who, string $method, string $path, ?array $body = null): array
{
    global $base, $jars;
    $jars[$who] ??= ['jar' => tempnam(sys_get_temp_dir(), 'glg'), 'csrf' => ''];
    $ch = curl_init($base.$path);
    $headers = ['Accept: application/json', 'X-CSRF-TOKEN: '.$jars[$who]['csrf']];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers,
        CURLOPT_COOKIEJAR => $jars[$who]['jar'], CURLOPT_COOKIEFILE => $jars[$who]['jar']]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, json_decode((string) $raw, true)];
}

function login(string $who, string $email, string $password): void
{
    global $jars;
    [, $s] = req($who, 'GET', '/session');
    $jars[$who]['csrf'] = $s['csrf'];
    [$code, $r] = req($who, 'POST', '/login', ['email' => $email, 'password' => $password]);
    $jars[$who]['csrf'] = $r['csrf'] ?? '';
    check("Đăng nhập $email", $code === 200, $r['user']['role_name'] ?? json_encode($r));
}

function check(string $label, bool $ok, string $detail = ''): void
{
    global $fail;
    if (!$ok) $fail++;
    printf("%s %s%s\n", $ok ? '✔' : '✘', $label, $detail !== '' ? " — $detail" : '');
}

$today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Ho_Chi_Minh')))->format('Y-m-d');
$day = fn (int $n) => (new DateTimeImmutable($today))->modify("+$n day")->format('Y-m-d');
login('letan', 'letan@demo.glg.test', $password);
login('hk', 'buongphong@demo.glg.test', $password);

[, $map] = req('letan', 'GET', '/admin/room-map');
$room = null;
foreach ($map['rooms'] as $r) {
    if ($r['occupancy'] === 'vacant' && $r['housekeeping'] === 'clean' && $r['availability'] === 'active' && $r['type_code'] === 'DBL' && !$r['next']) { $room = $r; break; }
}
check('Tìm phòng đôi trống, sạch', (bool) $room, $room['number'] ?? 'không có');

[$code, $b] = req('letan', 'POST', '/admin/bookings', ['source' => 'phone', 'status' => 'hold',
    'customer' => ['full_name' => 'Khách kiểm thử E2E', 'phone' => '0988777666'],
    'stays' => [['room_type_id' => $room['room_type_id'], 'room_id' => $room['id'], 'check_in' => $today, 'check_out' => $day(2), 'adults' => 2]]]);
check('Lễ tân tạo giữ chỗ', $code === 201 && $b['status'] === 'hold', ($b['code'] ?? '').' · cọc yêu cầu '.($b['deposit_required'] ?? '?'));
$id = $b['id'];

[$code, $p] = req('letan', 'POST', "/admin/bookings/$id/payments", ['kind' => 'deposit', 'method' => 'bank_transfer', 'amount' => $b['deposit_required'], 'reference' => 'FT-E2E']);
[, $d] = req('letan', 'GET', "/admin/bookings/$id");
check('Thu cọc → tự xác nhận', $code === 201 && $d['booking']['status'] === 'confirmed', ($p['receipt_no'] ?? '').' · '.$d['booking']['status']);
$stay = $d['booking']['stays'][0]['id'];
$folio = $d['folios'][0]['id'];

[$code, $s] = req('letan', 'POST', "/admin/stays/$stay/check-in", []);
check('Nhận phòng', $code === 200 && $s['status'] === 'checked_in');

[, $svc] = req('letan', 'GET', '/admin/services');
$minibar = current(array_filter($svc['services'], fn ($x) => $x['category'] === 'minibar'));
[$code, $line] = req('letan', 'POST', "/admin/folios/$folio/services", ['service_id' => $minibar['id'], 'quantity' => 2, 'stay_id' => $stay]);
check('Ghi minibar vào hồ sơ', $code === 201, ($line['amount'] ?? '?').'đ');

[, $q] = req('letan', 'POST', "/admin/stays/$stay/dates/quote", ['check_in' => $today, 'check_out' => $day(3)]);
[$code, $s] = req('letan', 'POST', "/admin/stays/$stay/dates", ['check_in' => $today, 'check_out' => $day(3), 'expected_delta' => $q['delta']]);
check('Gia hạn có xem trước tồn & giá', $q['ok'] && $code === 200 && $s['check_out'] === $day(3), 'chênh lệch '.$q['delta'].'đ');

[$code, $r] = req('letan', 'POST', "/admin/stays/$stay/check-out", []);
check('Trả phòng bị chặn khi còn nợ', $code === 409, $r['message'] ?? '');

[, $q] = req('letan', 'POST', "/admin/stays/$stay/check-out/quote", []);
check('Xem trước quyết toán trả sớm', $q['early'] && $q['balance_after'] < $q['balance_before'], "trước {$q['balance_before']} → sau {$q['balance_after']} (hủy ".count($q['void_nights']).' đêm)');
[$code] = req('letan', 'POST', "/admin/bookings/$id/payments", ['kind' => 'payment', 'method' => 'bank_transfer', 'amount' => $q['balance_after']]);
[$code2, $s] = req('letan', 'POST', "/admin/stays/$stay/check-out", ['expected_balance' => 0]);
[, $d] = req('letan', 'GET', "/admin/bookings/$id");
check('Thu đủ và trả phòng, hồ sơ đóng', $code === 201 && $code2 === 200 && $d['totals']['balance'] === 0 && $d['folios'][0]['status'] === 'closed',
    "phát sinh {$d['totals']['charges']} · đã thu {$d['totals']['paid']} · hồ sơ {$d['folios'][0]['status']} · đặt phòng {$d['booking']['status']}");

[, $map] = req('hk', 'GET', '/admin/room-map');
$after = current(array_filter($map['rooms'], fn ($x) => $x['id'] === $room['id']));
check('Phòng chuyển sang Bẩn + có việc dọn', $after['housekeeping'] === 'dirty' && $after['task'], 'việc #'.($after['task']['id'] ?? '-'));
$task = $after['task']['id'];
[, $tasks] = req('hk', 'GET', '/admin/housekeeping/tasks');
$t = current(array_filter($tasks['tasks'], fn ($x) => $x['id'] === $task));
[$c1] = req('hk', 'POST', "/admin/housekeeping/tasks/$task/start");
[$c2] = req('hk', 'POST', "/admin/housekeeping/tasks/$task/finish", ['checklist' => array_map(fn ($i) => ['label' => $i['label'], 'done' => true], $t['checklist'])]);
[$c3] = req('hk', 'POST', "/admin/housekeeping/tasks/$task/inspect", ['passed' => true]);
check('Buồng phòng: bắt đầu → xong → kiểm tra đạt', [$c1, $c2, $c3] === [200, 200, 200]);

[, $map] = req('letan', 'GET', '/admin/room-map');
$after = current(array_filter($map['rooms'], fn ($x) => $x['id'] === $room['id']));
[, $pub] = req('guest', 'GET', "/public/availability?check_in=$today&check_out=".$day(1).'&adults=2');
$dbl = current(array_filter($pub['results'], fn ($x) => $x['room_type']['id'] === $room['room_type_id']));
check('Phòng mở bán lại (trống + sạch), website thấy còn phòng', $after['occupancy'] === 'vacant' && $after['housekeeping'] === 'clean' && $dbl['available']);

[$code] = req('hk', 'POST', "/admin/bookings/$id/payments", ['kind' => 'payment', 'method' => 'cash', 'amount' => 1000]);
check('Buồng phòng không được thu tiền (403)', $code === 403);
[$code] = req('hk', 'GET', '/admin/reports/summary');
check('Buồng phòng không xem được báo cáo (403)', $code === 403);

echo $fail ? "\n$fail bước KHÔNG đạt\n" : "\nTất cả bước đạt\n";
exit($fail ? 1 : 0);
