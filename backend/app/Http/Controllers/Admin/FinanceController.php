<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CashEntry;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\Shift;
use App\Models\User;
use App\Services\Audit;
use App\Services\Context;
use App\Services\FolioService;
use App\Services\ReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FinanceController extends Controller
{
    public function payments(Request $request)
    {
        $d = $request->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d', 'method' => 'nullable|string|max:30',
            'kind' => 'nullable|in:deposit,payment,refund']);
        return Payment::with('booking:id,code,customer_id', 'booking.customer:id,full_name', 'receiver:id,name')
            ->whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()))
            ->when($d['from'] ?? null, fn ($q, $v) => $q->where('paid_at', '>=', $v))
            ->when($d['to'] ?? null, fn ($q, $v) => $q->where('paid_at', '<', Context::today()->parse($v)->addDay()->toDateString()))
            ->when($d['method'] ?? null, fn ($q, $v) => $q->where('method', $v))
            ->when($d['kind'] ?? null, fn ($q, $v) => $q->where('kind', $v))
            ->latest('id')->paginate(50);
    }

    public function receivables(ReportService $reports)
    {
        return $reports->receivables($this->pid());
    }

    public function methods()
    {
        return PaymentMethod::orderBy('sort')->get();
    }

    // ---- Ca làm việc ----
    public function currentShift(FolioService $folios)
    {
        $shift = $folios->currentShift();
        return ['shift' => $shift ? $this->shiftDetail($shift) : null,
            'staff' => User::where('active', true)->whereHas('properties', fn ($q) => $q->where('properties.id', $this->pid()))->get(['id', 'name'])];
    }

    public function shifts()
    {
        return Shift::with('user:id,name', 'receiver:id,name')->where('property_id', $this->pid())->latest('id')->limit(100)->get();
    }

    public function openShift(Request $request, FolioService $folios)
    {
        $d = $request->validate(['opening_cash' => 'required|integer|min:0', 'note' => 'nullable|string|max:300']);
        abort_if($folios->currentShift(), 409, 'Bạn đang có ca chưa chốt.');
        $shift = Shift::create(['property_id' => $this->pid(), 'user_id' => auth()->id(), 'opened_at' => now(),
            'opening_cash' => $d['opening_cash'], 'note' => $d['note'] ?? null]);
        Audit::log('shift.open', $shift, 'Mở ca, tiền đầu ca '.number_format($d['opening_cash'], 0, ',', '.').'đ');
        return $this->shiftDetail($shift);
    }

    public function closeShift(Request $request, int $id)
    {
        $d = $request->validate(['counted_cash' => 'required|integer|min:0', 'handed_to' => 'nullable|integer|exists:users,id', 'note' => 'nullable|string|max:500']);
        return DB::transaction(function () use ($id, $d) {
            $shift = Shift::where('property_id', $this->pid())->lockForUpdate()->findOrFail($id);
            abort_if($shift->closed_at, 409, 'Ca đã chốt.');
            abort_unless($shift->user_id === auth()->id() || $this->allowed('cashbook.manage'), 403, 'Chỉ người mở ca hoặc kế toán được chốt ca.');
            $detail = $this->shiftDetail($shift);
            $diff = $d['counted_cash'] - $detail['expected_cash'];
            abort_if($diff !== 0 && empty($d['note']), 422, 'Tiền thực đếm lệch so với hệ thống, ghi chú lý do.');
            $shift->update(['closed_at' => now(), 'expected_cash' => $detail['expected_cash'], 'counted_cash' => $d['counted_cash'], 'difference' => $diff,
                'handed_to' => $d['handed_to'] ?? null, 'note' => $d['note'] ?? $shift->note]);
            Audit::log('shift.close', $shift, 'Chốt ca: hệ thống '.number_format($detail['expected_cash'], 0, ',', '.').'đ, thực đếm '
                .number_format($d['counted_cash'], 0, ',', '.').'đ, lệch '.number_format($diff, 0, ',', '.').'đ', $d['note'] ?? null);
            return $this->shiftDetail($shift->refresh());
        });
    }

    /** Tiền mặt dự kiến = đầu ca + thu tiền mặt − chi/hoàn tiền mặt (khoản thu phòng và sổ thu chi). */
    private function shiftDetail(Shift $shift): array
    {
        $cashMethods = PaymentMethod::where('type', 'cash')->pluck('code');
        $byMethod = Payment::where('shift_id', $shift->id)->where('status', 'completed')
            ->selectRaw("method, SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END) as total, COUNT(*) as count")->groupBy('method')->get();
        $entries = CashEntry::where('shift_id', $shift->id)->selectRaw("method, type, SUM(amount) as total")->groupBy('method', 'type')->get();
        $cashPayments = (int) $byMethod->whereIn('method', $cashMethods)->sum('total');
        $cashIn = (int) $entries->whereIn('method', $cashMethods)->where('type', 'income')->sum('total');
        $cashOut = (int) $entries->whereIn('method', $cashMethods)->where('type', 'expense')->sum('total');
        return array_merge($shift->load('user:id,name', 'receiver:id,name')->toArray(), [
            'by_method' => $byMethod, 'cashbook' => $entries,
            'expected_cash' => (int) $shift->opening_cash + $cashPayments + $cashIn - $cashOut,
        ]);
    }

    // ---- Sổ thu chi ----
    public function cashEntries(Request $request)
    {
        $d = $request->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d']);
        return CashEntry::with('creator:id,name')->withExists('reversal')->where('property_id', $this->pid())
            ->when($d['from'] ?? null, fn ($q, $v) => $q->where('business_date', '>=', $v))
            ->when($d['to'] ?? null, fn ($q, $v) => $q->where('business_date', '<=', $v))
            ->latest('id')->paginate(50);
    }

    public function storeCash(Request $request, FolioService $folios)
    {
        $d = $request->validate(['type' => 'required|in:income,expense', 'category' => 'required|string|max:60', 'method' => 'required|string|exists:payment_methods,code',
            'amount' => 'required|integer|min:1', 'description' => 'required|string|max:500']);
        abort_if($d['category'] === 'Bán dịch vụ lẻ', 422, 'Dùng chức năng bán dịch vụ lẻ cho danh mục này.');
        $shift = $folios->currentShift();
        $isCash = PaymentMethod::where('code', $d['method'])->value('type') === 'cash';
        abort_if($isCash && !$shift, 409, 'Mở ca trước khi ghi thu chi tiền mặt.');
        $e = CashEntry::create($d + ['property_id' => $this->pid(), 'shift_id' => $shift?->id, 'business_date' => Context::today()->toDateString(), 'created_by' => auth()->id()]);
        Audit::log('cash.'.$d['type'], $e, ($d['type'] === 'income' ? 'Phiếu thu: ' : 'Phiếu chi: ').$d['description'].' — '.number_format($d['amount'], 0, ',', '.').'đ');
        return $e;
    }

    /** Sửa sai bằng bút toán đảo, không xóa. */
    public function reverseCash(Request $request, int $id, FolioService $folios)
    {
        $d = $request->validate(['reason' => 'required|string|min:3|max:300']);
        $e = CashEntry::where('property_id', $this->pid())->findOrFail($id);
        abort_if($e->reverses_id || CashEntry::where('reverses_id', $e->id)->exists(), 409, 'Bút toán đã được đảo hoặc là bút toán đảo.');
        $r = DB::transaction(fn () => $this->reverseEntry($e, $d['reason'], $folios));
        Audit::log('cash.reverse', $e, 'Đảo bút toán thu chi #'.$e->id, $d['reason']);
        return $r;
    }

    private function reverseEntry(CashEntry $e, string $reason, FolioService $folios): CashEntry
    {
        $r = CashEntry::create(['property_id' => $this->pid(), 'shift_id' => $folios->currentShift()?->id, 'type' => $e->type === 'income' ? 'expense' : 'income',
            'category' => $e->category, 'method' => $e->method, 'amount' => $e->amount, 'description' => 'Đảo: '.$e->description.' — '.$reason,
            'business_date' => Context::today()->toDateString(), 'created_by' => auth()->id(), 'reverses_id' => $e->id]);
        // Phiếu bán dịch vụ lẻ có trừ kho: hoàn kho (khóa duy nhất đảm bảo chỉ một lần)
        $sale = \App\Models\InventoryMovement::where('ref_type', 'cash_entry')->where('ref_id', $e->id)->where('type', 'sale')->first();
        if ($sale) {
            app(\App\Services\InventoryService::class)->saleReversal($sale->inventory_item_id, abs($sale->quantity), 'cash_entry', $e->id);
        }
        return $r;
    }
}
