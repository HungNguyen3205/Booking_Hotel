<?php
namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\WebhookEvent;
use App\Services\Audit;
use App\Services\AvailabilityService;
use App\Services\BookingService;
use App\Services\Context;
use App\Services\FolioService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Webhook báo có từ ngân hàng/cổng thanh toán.
 *
 * Xác thực: header X-Signature = hex(HMAC-SHA256(raw body, PAYMENT_WEBHOOK_SECRET)).
 * Định dạng body (chuẩn hóa nội bộ; bộ chuyển đổi cho từng nhà cung cấp cần được viết khi có tài liệu của họ):
 *   {"event_id": "...", "transaction_id": "...", "amount": 300000, "content": "GLGABC123 ...", "paid_at": "2026-11-19T10:00:00+07:00"}
 * Idempotent: (provider, event_id) và (provider, transaction_id) đều là khóa duy nhất — gửi lặp không tạo khoản thu lặp.
 */
class WebhookController extends Controller
{
    public function payment(Request $request, string $provider, FolioService $folios)
    {
        abort_unless(preg_match('/^[a-z0-9_-]{2,40}$/', $provider), 404);
        $secret = (string) config('hotel.payment_webhook_secret');
        abort_if($secret === '', 503, 'Webhook thanh toán chưa được cấu hình.');
        $signature = (string) $request->header('X-Signature', '');
        abort_unless(hash_equals(hash_hmac('sha256', $request->getContent(), $secret), strtolower($signature)), 401, 'Chữ ký không hợp lệ.');

        $data = $request->validate(['event_id' => 'required|string|max:120', 'transaction_id' => 'required|string|max:120',
            'amount' => 'required|integer|min:1', 'content' => 'required|string|max:500', 'paid_at' => 'nullable|date']);

        try {
            $event = WebhookEvent::create(['provider' => $provider, 'event_id' => $data['event_id'], 'payload' => $data]);
        } catch (QueryException $e) {
            if (app(AvailabilityService::class)->isUniqueViolation($e)) {
                return response()->json(['result' => 'duplicate'], 200);
            }
            throw $e;
        }

        $result = DB::transaction(function () use ($data, $provider, $event, $folios) {
            if (Payment::where('provider', $provider)->where('external_id', $data['transaction_id'])->exists()) return 'duplicate_transaction';
            $booking = null;
            $content = strtoupper($data['content']);
            preg_match_all('/GLG[A-Z0-9]{6}|(?<!\d)(?:\+?84|0)\d{8,10}[B-Z]?(?![A-Z0-9])/', $content, $m);
            foreach ($m[0] as $candidate) {
                $suffix = ctype_alpha(substr($candidate, -1)) && !str_starts_with($candidate, 'GLG') ? substr($candidate, -1) : '';
                $code = str_starts_with($candidate, 'GLG') ? $candidate : BookingService::phoneCode(rtrim($candidate, 'BCDEFGHIJKLMNOPQRSTUVWXYZ')).$suffix;
                if ($booking = Booking::where('code', $code)->lockForUpdate()->first()) break;
            }
            if (!$booking) return 'unmatched';
            Context::set($booking->property()->first() ?? Context::property());
            $method = PaymentMethod::where('type', 'bank_transfer')->where('active', true)->orderBy('sort')->value('code')
                ?? PaymentMethod::where('active', true)->orderBy('sort')->value('code');
            $folio = $folios->mainFolio($booking);
            $kind = in_array($booking->status, ['hold', 'confirmed'], true) ? 'deposit' : 'payment';
            $payment = Payment::create(['booking_id' => $booking->id, 'folio_id' => $folio->id, 'customer_id' => $booking->customer_id,
                'kind' => $kind, 'method' => $method, 'amount' => $data['amount'], 'status' => 'completed', 'provider' => $provider,
                'external_id' => $data['transaction_id'], 'reference' => $data['transaction_id'], 'note' => 'Webhook: '.mb_substr($data['content'], 0, 200),
                'paid_at' => isset($data['paid_at']) ? \Carbon\Carbon::parse($data['paid_at']) : now()]);
            $payment->update(['receipt_no' => 'PT-'.now()->format('ymd').'-'.str_pad((string) $payment->id, 6, '0', STR_PAD_LEFT)]);
            if ($booking->status === 'hold') {
                app(BookingService::class)->confirm($booking, 'Nhận tiền qua webhook');
            }
            Audit::log('payment.webhook', $booking, 'Nhận '.number_format($data['amount'], 0, ',', '.')."đ qua $provider", null, ['event' => $event->id]);
            return 'recorded';
        });
        $event->update(['result' => $result, 'processed_at' => now()]);
        return response()->json(['result' => $result], 200);
    }

    public function media(string $file)
    {
        abort_unless(preg_match('/^[A-Za-z0-9]{20,80}\.(jpe?g|png|webp)$/', $file), 404);
        abort_unless(Storage::disk('public')->exists("media/$file"), 404);
        return response()->file(Storage::disk('public')->path("media/$file"), ['Cache-Control' => 'public, max-age=31536000, immutable']);
    }
}
