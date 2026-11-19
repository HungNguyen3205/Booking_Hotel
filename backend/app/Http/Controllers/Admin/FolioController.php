<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\FolioLine;
use App\Models\Payment;
use App\Models\Service;
use App\Models\Stay;
use App\Services\Audit;
use App\Services\Context;
use App\Services\FolioService;
use Illuminate\Http\Request;

class FolioController extends Controller
{
    public function __construct(private FolioService $folios) {}

    public function postService(Request $request, int $folioId)
    {
        $folio = $this->folio($folioId);
        $d = $request->validate(['service_id' => 'required|integer', 'quantity' => 'required|integer|between:1,100',
            'stay_id' => 'nullable|integer', 'note' => 'nullable|string|max:200']);
        $service = Service::where('property_id', $this->pid())->findOrFail($d['service_id']);
        $stay = !empty($d['stay_id']) ? Stay::findOrFail($d['stay_id']) : null;
        return $this->folios->postService($folio, $service, $d['quantity'], $stay, $d['note'] ?? null);
    }

    public function postLine(Request $request, int $folioId)
    {
        $folio = $this->folio($folioId);
        $d = $request->validate(['type' => 'required|in:surcharge,discount,adjustment', 'description' => 'required|string|max:200',
            'amount' => 'required|integer|between:-1000000000,1000000000', 'reason' => 'nullable|string|max:500', 'stay_id' => 'nullable|integer']);
        $need = ['surcharge' => 'services.post', 'discount' => 'discounts.apply', 'adjustment' => 'services.void'][$d['type']];
        abort_unless($this->allowed($need), 403, 'Bạn không có quyền thực hiện thao tác này.');
        abort_if($d['type'] === 'surcharge' && $d['amount'] <= 0, 422, 'Phụ thu phải lớn hơn 0.');
        $stay = !empty($d['stay_id']) ? Stay::where('booking_id', $folio->booking_id)->findOrFail($d['stay_id']) : null;
        return $this->folios->postLine($folio, $d['type'], $d['description'], (int) $d['amount'], $d['reason'] ?? null, $stay);
    }

    public function voidLine(Request $request, int $lineId)
    {
        $d = $request->validate(['reason' => 'required|string|min:3|max:500']);
        $line = FolioLine::findOrFail($lineId);
        $this->folio($line->folio_id);
        return $this->folios->voidLine($line, $d['reason']);
    }

    public function collect(Request $request, int $bookingId)
    {
        $booking = $this->booking($bookingId);
        $d = $request->validate(['folio_id' => 'nullable|integer', 'kind' => 'required|in:deposit,payment', 'method' => 'required|string|max:30',
            'amount' => 'required|integer|min:1|max:10000000000', 'reference' => 'nullable|string|max:120', 'note' => 'nullable|string|max:500']);
        $folio = !empty($d['folio_id']) ? $this->folio($d['folio_id']) : $this->folios->mainFolio($booking);
        return $this->folios->collect($booking, $folio, $d['kind'], $d['method'], (int) $d['amount'], $d['reference'] ?? null, $d['note'] ?? null);
    }

    public function refund(Request $request, int $bookingId)
    {
        $booking = $this->booking($bookingId);
        $d = $request->validate(['folio_id' => 'nullable|integer', 'method' => 'required|string|max:30', 'amount' => 'required|integer|min:1',
            'reason' => 'required|string|min:3|max:500', 'reference' => 'nullable|string|max:120']);
        $folio = !empty($d['folio_id']) ? $this->folio($d['folio_id']) : $this->folios->mainFolio($booking);
        return $this->folios->refund($booking, $folio, $d['method'], (int) $d['amount'], $d['reason'], $d['reference'] ?? null);
    }

    public function create(Request $request, int $bookingId)
    {
        $booking = $this->booking($bookingId);
        $d = $request->validate(['name' => 'required|string|max:120', 'bill_to_id' => 'nullable|integer|exists:customers,id']);
        return $this->folios->createFolio($booking, $d['name'], $d['bill_to_id'] ?? null);
    }

    public function move(Request $request, int $folioId)
    {
        $from = $this->folio($folioId);
        $d = $request->validate(['to_folio_id' => 'required|integer', 'line_ids' => 'array', 'line_ids.*' => 'integer',
            'night_ids' => 'array', 'night_ids.*' => 'integer', 'payment_ids' => 'array', 'payment_ids.*' => 'integer', 'reason' => 'required|string|max:500']);
        $to = $this->folio($d['to_folio_id']);
        $this->folios->move($from, $to, $d['line_ids'] ?? [], $d['night_ids'] ?? [], $d['payment_ids'] ?? [], $d['reason']);
        return response()->noContent();
    }

    /** Khoản khách báo đã chuyển khoản, chờ đối soát. */
    public function claims()
    {
        return Payment::with('booking:id,code,customer_id', 'booking.customer:id,full_name,phone')->where('status', 'pending')
            ->whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()))->latest('id')->get();
    }

    public function confirmClaim(Request $request, int $paymentId)
    {
        $payment = Payment::findOrFail($paymentId);
        $this->booking($payment->booking_id);
        $d = $request->validate(['amount' => 'required|integer|min:1', 'reference' => 'nullable|string|max:120']);
        return $this->folios->confirmClaim($payment, (int) $d['amount'], $d['reference'] ?? null);
    }

    public function rejectClaim(Request $request, int $paymentId)
    {
        $payment = Payment::findOrFail($paymentId);
        $booking = $this->booking($payment->booking_id);
        $d = $request->validate(['reason' => 'required|string|min:3|max:300']);
        abort_unless($payment->status === 'pending', 409, 'Khoản này không chờ đối soát.');
        $payment->update(['status' => 'failed', 'note' => trim(($payment->note ?? '').' · Không khớp sao kê: '.$d['reason'])]);
        Audit::log('payment.claim_rejected', $booking, 'Từ chối khoản khách báo chuyển khoản', $d['reason']);
        return $payment;
    }

    /** Dữ liệu in phiếu thu/phiếu chi (không phải hóa đơn điện tử). */
    public function receipt(int $paymentId)
    {
        $payment = Payment::with('receiver:id,name', 'booking.customer:id,full_name,phone,address,tax_code', 'booking.stays.room:id,number')->findOrFail($paymentId);
        $this->booking($payment->booking_id);
        abort_unless($payment->status === 'completed', 409, 'Chỉ in phiếu cho khoản đã ghi nhận.');
        return ['hotel' => Context::property()->only(['name', 'address', 'phone', 'email']), 'payment' => $payment,
            'note' => 'Phiếu thu/chi nội bộ, không thay thế hóa đơn điện tử.'];
    }

    /** Bảng kê thanh toán của một hồ sơ (để in khi trả phòng). */
    public function statement(int $folioId)
    {
        $folio = $this->folio($folioId)->load('booking.customer:id,full_name,phone,address,tax_code', 'billTo:id,full_name,tax_code,address',
            'nights', 'lines', 'payments');
        return ['hotel' => Context::property()->only(['name', 'address', 'phone', 'email']), 'folio' => $folio,
            'totals' => $this->folios->folioTotals($folio), 'note' => 'Bảng kê thanh toán, không phải hóa đơn điện tử.'];
    }
}
