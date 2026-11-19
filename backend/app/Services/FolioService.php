<?php
namespace App\Services;

use App\Models\Booking;
use App\Models\Folio;
use App\Models\FolioLine;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\Service;
use App\Models\Shift;
use App\Models\Stay;
use App\Models\StayNight;
use Illuminate\Support\Facades\DB;

/**
 * Hồ sơ thanh toán (folio).
 *
 * - Phát sinh = tiền phòng từng đêm chưa hủy (stay_nights) + các dòng phí (folio_lines, có dấu).
 * - Đã thu = cọc + thanh toán − hoàn tiền, chỉ tính khoản ở trạng thái completed.
 * - Còn phải thu = Phát sinh − Đã thu.
 * - Cọc là tiền đã thu trước khi nhận phòng; doanh thu được ghi nhận theo đêm ở/ngày phát sinh dịch vụ (xem ReportService).
 * Không xóa dòng phí hay khoản thu: sửa sai bằng dòng đảo / phiếu hoàn.
 */
class FolioService
{
    public function __construct(private InventoryService $inventory) {}

    public function mainFolio(Booking $booking): Folio
    {
        return $booking->folios()->orderBy('id')->first()
            ?? $booking->folios()->create(['name' => 'Hồ sơ chính', 'bill_to_id' => $booking->bill_to_id ?? $booking->customer_id]);
    }

    public function folioTotals(Folio $folio): array
    {
        $room = (int) StayNight::where('folio_id', $folio->id)->where('void', false)->sum('amount');
        $lines = FolioLine::where('folio_id', $folio->id)->selectRaw('type, SUM(amount) as total')->groupBy('type')->pluck('total', 'type');
        $pay = Payment::where('folio_id', $folio->id)->where('status', 'completed')
            ->selectRaw('kind, SUM(amount) as total')->groupBy('kind')->pluck('total', 'kind');
        $services = (int) ($lines['service'] ?? 0);
        $surcharges = (int) ($lines['surcharge'] ?? 0) + (int) ($lines['fee'] ?? 0);
        $discounts = (int) ($lines['discount'] ?? 0) + (int) ($lines['adjustment'] ?? 0);
        $charges = $room + $services + $surcharges + $discounts;
        $deposits = (int) ($pay['deposit'] ?? 0);
        $payments = (int) ($pay['payment'] ?? 0);
        $refunds = (int) ($pay['refund'] ?? 0);
        $paid = $deposits + $payments - $refunds;
        return compact('room', 'services', 'surcharges', 'discounts', 'charges', 'deposits', 'payments', 'refunds', 'paid')
            + ['balance' => $charges - $paid];
    }

    public function bookingTotals(Booking $booking): array
    {
        $sum = ['room' => 0, 'services' => 0, 'surcharges' => 0, 'discounts' => 0, 'charges' => 0, 'deposits' => 0,
            'payments' => 0, 'refunds' => 0, 'paid' => 0, 'balance' => 0];
        foreach ($booking->folios as $folio) {
            foreach ($this->folioTotals($folio) as $k => $v) $sum[$k] += $v;
        }
        $sum['pending_claims'] = (int) Payment::where('booking_id', $booking->id)->where('status', 'pending')->sum('amount');
        $sum['deposit_required'] = (int) $booking->deposit_required;
        $sum['deposit_outstanding'] = max(0, $booking->deposit_required - $sum['paid']);
        return $sum;
    }

    /** Số dư theo booking cho nhiều booking một lúc (dùng cho sơ đồ/lịch). */
    public function balances(array $bookingIds): array
    {
        if (!$bookingIds) return [];
        $room = StayNight::join('folios', 'folios.id', '=', 'stay_nights.folio_id')->whereIn('folios.booking_id', $bookingIds)
            ->where('void', false)->groupBy('folios.booking_id')->selectRaw('folios.booking_id as b, SUM(stay_nights.amount) as t')->pluck('t', 'b');
        $lines = FolioLine::join('folios', 'folios.id', '=', 'folio_lines.folio_id')->whereIn('folios.booking_id', $bookingIds)
            ->groupBy('folios.booking_id')->selectRaw('folios.booking_id as b, SUM(folio_lines.amount) as t')->pluck('t', 'b');
        $paid = Payment::whereIn('booking_id', $bookingIds)->where('status', 'completed')->groupBy('booking_id')
            ->selectRaw("booking_id as b, SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END) as t")->pluck('t', 'b');
        $out = [];
        foreach ($bookingIds as $id) {
            $out[$id] = (int) ($room[$id] ?? 0) + (int) ($lines[$id] ?? 0) - (int) ($paid[$id] ?? 0);
        }
        return $out;
    }

    private function assertOpen(Folio $folio): void
    {
        abort_if($folio->status !== 'open', 409, 'Hồ sơ thanh toán đã đóng.');
    }

    public function postService(Folio $folio, Service $service, int $quantity, ?Stay $stay, ?string $note): FolioLine
    {
        return DB::transaction(function () use ($folio, $service, $quantity, $stay, $note) {
            $folio = Folio::whereKey($folio->id)->lockForUpdate()->firstOrFail();
            $this->assertOpen($folio);
            abort_unless($service->active, 409, 'Dịch vụ đang ngừng cung cấp.');
            abort_if($stay && $stay->booking_id !== $folio->booking_id, 422, 'Lượt ở không thuộc hồ sơ thanh toán này.');
            $line = $folio->lines()->create([
                'stay_id' => $stay?->id, 'type' => 'service', 'service_id' => $service->id,
                'description' => $service->name.($note ? " — $note" : ''),
                'quantity' => $quantity, 'unit_price' => $service->price, 'amount' => $service->price * $quantity,
                'business_date' => Context::today()->toDateString(), 'posted_by' => auth()->id(),
            ]);
            if ($service->inventory_item_id) {
                $this->inventory->sale($service->inventory_item_id, $quantity, 'folio_line', $line->id);
            }
            Audit::log('folio.post_service', $folio->booking, "Ghi phí {$service->name} x$quantity vào {$folio->name}", null,
                ['line_id' => $line->id, 'amount' => $line->amount]);
            return $line;
        });
    }

    /** Phụ thu, phí hủy/không đến, giảm giá, điều chỉnh. Giảm giá/điều chỉnh âm luôn cần lý do. */
    public function postLine(Folio $folio, string $type, string $description, int $amount, ?string $reason = null, ?Stay $stay = null): FolioLine
    {
        abort_if($amount === 0, 422, 'Số tiền phải khác 0.');
        abort_if($type === 'discount' && $amount > 0, 422, 'Giảm giá phải là số âm.');
        abort_if(in_array($type, ['discount', 'adjustment'], true) && !$reason, 422, 'Cần nhập lý do.');
        return DB::transaction(function () use ($folio, $type, $description, $amount, $reason, $stay) {
            $folio = Folio::whereKey($folio->id)->lockForUpdate()->firstOrFail();
            $this->assertOpen($folio);
            if ($amount < 0) {
                $totals = $this->folioTotals($folio);
                abort_if($totals['charges'] + $amount < 0, 422, 'Giảm trừ vượt quá tổng phát sinh của hồ sơ.');
            }
            $line = $folio->lines()->create([
                'stay_id' => $stay?->id, 'type' => $type, 'description' => $description, 'quantity' => 1,
                'unit_price' => $amount, 'amount' => $amount, 'business_date' => Context::today()->toDateString(),
                'posted_by' => auth()->id(), 'reason' => $reason,
            ]);
            Audit::log("folio.$type", $folio->booking, "$description: ".number_format($amount, 0, ',', '.').'đ', $reason, ['line_id' => $line->id]);
            return $line;
        });
    }

    /** Hủy khoản phí bằng dòng đảo; khoản minibar được hoàn kho đúng một lần. */
    public function voidLine(FolioLine $line, string $reason): FolioLine
    {
        return DB::transaction(function () use ($line, $reason) {
            $line = FolioLine::whereKey($line->id)->lockForUpdate()->firstOrFail();
            abort_if($line->voided_at, 409, 'Khoản này đã được hủy trước đó.');
            abort_if($line->reverses_id, 409, 'Không thể hủy một dòng đảo.');
            $folio = Folio::findOrFail($line->folio_id);
            $this->assertOpen($folio);
            $line->update(['voided_at' => now()]);
            $reversal = $folio->lines()->create([
                'stay_id' => $line->stay_id, 'type' => $line->type, 'service_id' => $line->service_id,
                'description' => 'Hủy: '.$line->description, 'quantity' => -$line->quantity, 'unit_price' => $line->unit_price,
                'amount' => -$line->amount, 'business_date' => Context::today()->toDateString(), 'posted_by' => auth()->id(),
                'reverses_id' => $line->id, 'reason' => $reason,
            ]);
            if ($line->service_id && ($itemId = Service::whereKey($line->service_id)->value('inventory_item_id'))) {
                $this->inventory->saleReversal($itemId, $line->quantity, 'folio_line', $line->id);
            }
            Audit::log('folio.void_line', $folio->booking, "Hủy khoản: {$line->description}", $reason, ['line_id' => $line->id]);
            return $reversal;
        });
    }

    public function collect(Booking $booking, Folio $folio, string $kind, string $method, int $amount, ?string $reference, ?string $note): Payment
    {
        abort_unless(in_array($kind, ['deposit', 'payment'], true), 422, 'Loại khoản thu không hợp lệ.');
        abort_if($amount <= 0, 422, 'Số tiền phải lớn hơn 0.');
        abort_if($folio->booking_id !== $booking->id, 422, 'Hồ sơ thanh toán không thuộc đặt phòng.');
        return DB::transaction(function () use ($booking, $folio, $kind, $method, $amount, $reference, $note) {
            $booking = Booking::whereKey($booking->id)->lockForUpdate()->firstOrFail();
            abort_if(in_array($booking->status, ['cancelled', 'no_show'], true) && $kind === 'deposit', 409, 'Đặt phòng đã hủy, không thu cọc.');
            $methodModel = PaymentMethod::where('code', $method)->where('active', true)->first();
            abort_unless($methodModel, 422, 'Phương thức thanh toán không khả dụng.');
            $shift = $this->currentShift();
            if ($methodModel->type === 'cash' && Settings::value('booking', 'require_shift_for_cash')) {
                abort_unless($shift, 409, 'Mở ca làm việc trước khi thu tiền mặt.');
            }
            $balance = $this->folioTotals($folio)['balance'];
            abort_if($amount > $balance, 422, 'Số tiền thu vượt quá khoản còn phải thu của hồ sơ ('.number_format(max(0, $balance), 0, ',', '.').'đ).');
            $payment = Payment::create([
                'booking_id' => $booking->id, 'folio_id' => $folio->id, 'customer_id' => $folio->bill_to_id ?? $booking->customer_id,
                'kind' => $kind, 'method' => $method, 'amount' => $amount, 'status' => 'completed', 'reference' => $reference,
                'shift_id' => $shift?->id, 'received_by' => auth()->id(), 'note' => $note, 'paid_at' => now(),
            ]);
            $payment->update(['receipt_no' => 'PT-'.now()->format('ymd').'-'.str_pad((string) $payment->id, 6, '0', STR_PAD_LEFT)]);
            if ($booking->status === 'hold' && $kind === 'deposit') {
                app(BookingService::class)->confirm($booking, 'Đã nhận cọc');
            }
            Audit::log("payment.$kind", $booking, ($kind === 'deposit' ? 'Thu cọc ' : 'Thu tiền ').number_format($amount, 0, ',', '.')."đ ($method)", null,
                ['payment_id' => $payment->id]);
            return $payment->refresh();
        });
    }

    public function refund(Booking $booking, Folio $folio, string $method, int $amount, string $reason, ?string $reference): Payment
    {
        abort_if($amount <= 0, 422, 'Số tiền phải lớn hơn 0.');
        abort_if($folio->booking_id !== $booking->id, 422, 'Hồ sơ thanh toán không thuộc đặt phòng.');
        return DB::transaction(function () use ($booking, $folio, $method, $amount, $reason, $reference) {
            Booking::whereKey($booking->id)->lockForUpdate()->first();
            $totals = $this->folioTotals($folio);
            abort_if($amount > $totals['paid'], 422, 'Số tiền hoàn vượt quá số đã thu của hồ sơ.');
            $methodModel = PaymentMethod::where('code', $method)->where('active', true)->first();
            abort_unless($methodModel, 422, 'Phương thức thanh toán không khả dụng.');
            $shift = $this->currentShift();
            if ($methodModel->type === 'cash' && Settings::value('booking', 'require_shift_for_cash')) {
                abort_unless($shift, 409, 'Mở ca làm việc trước khi chi tiền mặt.');
            }
            $payment = Payment::create([
                'booking_id' => $booking->id, 'folio_id' => $folio->id, 'customer_id' => $folio->bill_to_id ?? $booking->customer_id,
                'kind' => 'refund', 'method' => $method, 'amount' => $amount, 'status' => 'completed', 'reference' => $reference,
                'shift_id' => $shift?->id, 'received_by' => auth()->id(), 'note' => $reason, 'paid_at' => now(),
            ]);
            $payment->update(['receipt_no' => 'PC-'.now()->format('ymd').'-'.str_pad((string) $payment->id, 6, '0', STR_PAD_LEFT)]);
            Audit::log('payment.refund', $booking, 'Hoàn tiền '.number_format($amount, 0, ',', '.')."đ ($method)", $reason, ['payment_id' => $payment->id]);
            return $payment->refresh();
        });
    }

    /** Xác nhận khoản khách báo đã chuyển khoản sau khi đối soát sao kê. */
    public function confirmClaim(Payment $payment, int $actualAmount, ?string $reference): Payment
    {
        return DB::transaction(function () use ($payment, $actualAmount, $reference) {
            $payment = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            abort_unless($payment->status === 'pending', 409, 'Khoản này không ở trạng thái chờ đối soát.');
            abort_if($actualAmount <= 0, 422, 'Số tiền thực nhận phải lớn hơn 0.');
            $booking = Booking::findOrFail($payment->booking_id);
            $folio = $this->mainFolio($booking);
            $payment->update(['status' => 'cancelled', 'note' => trim(($payment->note ?? '').' · Đã đối soát')]);
            return $this->collect($booking, $folio, in_array($booking->status, ['hold', 'confirmed'], true) ? 'deposit' : 'payment',
                $payment->method, $actualAmount, $reference ?? $payment->reference, 'Đối soát chuyển khoản khách báo #'.$payment->id);
        });
    }

    public function createFolio(Booking $booking, string $name, ?int $billToId): Folio
    {
        $folio = $booking->folios()->create(['name' => $name, 'bill_to_id' => $billToId]);
        Audit::log('folio.create', $booking, "Tạo hồ sơ thanh toán \"$name\"");
        return $folio;
    }

    /** Chuyển dòng phí, đêm phòng, khoản thu giữa các hồ sơ của cùng một đặt phòng (tách/gộp). */
    public function move(Folio $from, Folio $to, array $lineIds, array $nightIds, array $paymentIds, string $reason): void
    {
        abort_if($from->id === $to->id, 422, 'Chọn hồ sơ đích khác hồ sơ nguồn.');
        abort_if($from->booking_id !== $to->booking_id, 422, 'Chỉ tách/gộp trong cùng một đặt phòng.');
        DB::transaction(function () use ($from, $to, $lineIds, $nightIds, $paymentIds, $reason) {
            $this->assertOpen($to);
            $lines = FolioLine::where('folio_id', $from->id)->whereIn('id', $lineIds)->update(['folio_id' => $to->id]);
            // dòng đảo đi cùng dòng gốc
            FolioLine::where('folio_id', $from->id)->whereIn('reverses_id', $lineIds)->update(['folio_id' => $to->id]);
            $nights = StayNight::where('folio_id', $from->id)->whereIn('id', $nightIds)->update(['folio_id' => $to->id]);
            $payments = Payment::where('folio_id', $from->id)->whereIn('id', $paymentIds)->update(['folio_id' => $to->id]);
            Audit::log('folio.move', $from->booking, "Chuyển $lines khoản phí, $nights đêm phòng, $payments khoản thu từ \"{$from->name}\" sang \"{$to->name}\"", $reason);
        });
    }

    public function close(Folio $folio): void
    {
        $balance = $this->folioTotals($folio)['balance'];
        abort_if($balance !== 0, 409, 'Hồ sơ còn chênh lệch '.number_format($balance, 0, ',', '.').'đ, chưa thể đóng.');
        $folio->update(['status' => 'closed', 'closed_at' => now(), 'closed_by' => auth()->id()]);
    }

    public function currentShift(): ?Shift
    {
        return auth()->id() ? Shift::where('user_id', auth()->id())->whereNull('closed_at')->latest('id')->first() : null;
    }
}
