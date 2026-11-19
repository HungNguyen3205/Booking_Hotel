<?php
namespace App\Services;

/**
 * Tạo chuỗi VietQR (chuẩn EMVCo/NAPAS) cho chuyển khoản ngân hàng, xử lý cục bộ, không gọi dịch vụ ngoài.
 * Mã QR chỉ hỗ trợ khách chuyển khoản; khoản thu chỉ được ghi nhận khi lễ tân/kế toán đối soát
 * hoặc webhook ngân hàng hợp lệ báo tiền về — không dựa vào việc khách bấm "đã chuyển khoản".
 */
class VietQr
{
    public static function configured(?int $propertyId = null): bool
    {
        $c = Settings::get('payment_qr', $propertyId);
        return $c['enabled'] && preg_match('/^\d{6}$/', (string) $c['bank_bin']) && preg_match('/^[0-9A-Za-z]{4,19}$/', (string) $c['account_number']);
    }

    public static function payload(int $amount, string $message, ?int $propertyId = null): ?array
    {
        if (!self::configured($propertyId)) return null;
        $c = Settings::get('payment_qr', $propertyId);
        $consumer = self::tlv('00', $c['bank_bin']).self::tlv('01', $c['account_number']);
        $merchant = self::tlv('00', 'A000000727').self::tlv('01', $consumer).self::tlv('02', 'QRIBFTTA');
        $message = mb_substr(preg_replace('/[^A-Za-z0-9 ]/', '', self::ascii($message)), 0, 25);
        $data = self::tlv('00', '01').self::tlv('01', '12').self::tlv('38', $merchant).self::tlv('53', '704')
            .self::tlv('54', (string) $amount).self::tlv('58', 'VN').self::tlv('62', self::tlv('08', $message)).'6304';
        return [
            'qr' => $data.self::crc16($data),
            'bank_name' => $c['bank_name'], 'account_number' => $c['account_number'], 'account_name' => $c['account_name'],
            'amount' => $amount, 'message' => $message,
        ];
    }

    private static function tlv(string $id, string $value): string
    {
        return $id.str_pad((string) strlen($value), 2, '0', STR_PAD_LEFT).$value;
    }

    private static function ascii(string $s): string
    {
        $map = ['à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ' => 'a', 'è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ' => 'e', 'ì|í|ị|ỉ|ĩ' => 'i',
            'ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ' => 'o', 'ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ' => 'u', 'ỳ|ý|ỵ|ỷ|ỹ' => 'y', 'đ' => 'd'];
        foreach ($map as $from => $to) {
            $s = preg_replace("/($from)/u", $to, $s);
            $s = preg_replace('/('.mb_strtoupper($from).')/u', strtoupper($to), $s);
        }
        return $s;
    }

    public static function crc16(string $data): string
    {
        $crc = 0xFFFF;
        for ($i = 0, $n = strlen($data); $i < $n; $i++) {
            $crc ^= ord($data[$i]) << 8;
            for ($b = 0; $b < 8; $b++) {
                $crc = ($crc & 0x8000) ? (($crc << 1) ^ 0x1021) : ($crc << 1);
                $crc &= 0xFFFF;
            }
        }
        return strtoupper(str_pad(dechex($crc), 4, '0', STR_PAD_LEFT));
    }
}
