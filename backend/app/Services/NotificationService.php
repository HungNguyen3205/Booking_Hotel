<?php
namespace App\Services;

use App\Models\Booking;
use App\Models\NotificationOutbox;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Gửi thông báo qua kênh đã cấu hình. Kênh chưa cấu hình được ghi rõ trạng thái `not_configured`,
 * không bao giờ báo đã gửi khi chưa gửi thật.
 */
class NotificationService
{
    public static function emailConfigured(?int $propertyId = null): bool
    {
        $mailer = config('mail.default');
        return Settings::value('notifications', 'email_enabled', $propertyId) && $mailer && !in_array($mailer, ['log', 'array'], true)
            && config("mail.mailers.$mailer");
    }

    public function bookingConfirmation(Booking $booking): void
    {
        $customer = $booking->customer;
        if (!$customer?->email) return;
        $totals = app(FolioService::class)->bookingTotals($booking->load('folios'));
        $first = $booking->stays()->orderBy('check_in')->first();
        $last = $booking->stays()->orderByDesc('check_out')->first();
        $vars = [
            '{name}' => $customer->full_name, '{code}' => $booking->code,
            '{check_in}' => $first?->check_in?->format('d/m/Y'), '{check_out}' => $last?->check_out?->format('d/m/Y'),
            '{total}' => number_format($totals['charges'], 0, ',', '.').'đ', '{deposit}' => number_format($booking->deposit_required, 0, ',', '.').'đ',
        ];
        $body = strtr((string) Settings::value('notifications', 'booking_confirmation', $booking->property_id), $vars);
        $this->send('email', $customer->email, 'booking_confirmation', ['subject' => "Xác nhận đặt phòng {$booking->code}", 'body' => $body], 'booking', $booking->id, $booking->property_id);
    }

    public function send(string $channel, string $to, string $template, array $payload, ?string $refType = null, ?int $refId = null, ?int $propertyId = null): NotificationOutbox
    {
        $row = NotificationOutbox::create(['channel' => $channel, 'recipient' => $to, 'template' => $template, 'payload' => $payload,
            'status' => 'queued', 'ref_type' => $refType, 'ref_id' => $refId]);
        if ($channel === 'email' && self::emailConfigured($propertyId)) {
            try {
                Mail::raw($payload['body'] ?? '', fn ($m) => $m->to($to)->subject($payload['subject'] ?? 'GLG HOTEL & SPA'));
                $row->update(['status' => 'sent']);
            } catch (Throwable $e) {
                $row->update(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 500)]);
            }
        } else {
            // Zalo/SMS chưa có nhà cung cấp; email chưa bật
            $row->update(['status' => 'not_configured', 'error' => 'Kênh '.$channel.' chưa được cấu hình']);
        }
        return $row;
    }
}
