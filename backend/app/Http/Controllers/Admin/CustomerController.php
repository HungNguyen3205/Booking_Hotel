<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Feedback;
use App\Services\Audit;
use App\Services\FolioService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public function index(Request $request)
    {
        $d = $request->validate(['q' => 'nullable|string|max:100', 'kind' => 'nullable|in:guest,company,agent', 'vip' => 'nullable|boolean']);
        return Customer::with('company:id,full_name')->whereNull('merged_into_id')
            ->when($d['kind'] ?? null, fn ($q, $k) => $q->where('kind', $k))
            ->when(isset($d['vip']) && $d['vip'], fn ($q) => $q->where('vip', true))
            ->when($d['q'] ?? null, function ($q, $term) {
                $digits = preg_replace('/\D/', '', $term);
                $q->where(fn ($q) => $q->where('full_name', 'like', "%$term%")->orWhere('email', 'like', "%$term%")
                    ->when(strlen($digits) >= 3, fn ($q) => $q->orWhere('phone', 'like', "%$digits%"))
                    ->orWhere('id_number_hash', Customer::hashDocument($term) ?? '-'));
            })
            ->withCount('bookings')->orderByDesc('id')->paginate(30);
    }

    public function show(int $id, FolioService $folios)
    {
        $c = Customer::with('company:id,full_name')->findOrFail($id);
        if ($this->allowed('guests.documents')) $c->makeVisible('id_number');
        $bookingIds = Booking::where('property_id', $this->pid())
            ->where(fn ($q) => $q->where('customer_id', $id)->orWhere('bill_to_id', $id)->orWhereHas('stays.guests', fn ($g) => $g->where('customers.id', $id)))
            ->pluck('id');
        $bookings = Booking::with('stays.room:id,number', 'stays.type:id,name')->whereIn('id', $bookingIds)->latest('id')->get();
        $balances = $this->allowed('balance.view') ? $folios->balances($bookingIds->all()) : [];
        return [
            'customer' => $c,
            'members' => $c->kind !== 'guest' ? Customer::where('company_id', $id)->get(['id', 'full_name', 'phone', 'email']) : [],
            'bookings' => $bookings->map(fn ($b) => $b->toArray() + ['balance' => $balances[$b->id] ?? null]),
            'debt' => $balances ? array_sum(array_filter($balances, fn ($v) => $v > 0)) : null,
            'feedback' => Feedback::where('customer_id', $id)->latest('id')->get(),
            'duplicates' => $this->duplicatesOf($c),
        ];
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $this->guardDuplicate($data);
        $c = Customer::create($data);
        Audit::log('customer.create', $c, "Tạo hồ sơ {$c->full_name}");
        return response()->json($c, 201);
    }

    public function update(Request $request, int $id)
    {
        $c = Customer::findOrFail($id);
        $data = $this->validated($request, true);
        $this->guardDuplicate($data, $id);
        $c->fill($data);
        $diff = Audit::diff($c);
        $c->save();
        if ($diff) Audit::log('customer.update', $c, "Cập nhật hồ sơ {$c->full_name}", null, $diff);
        return $c;
    }

    /** Gộp hồ sơ trùng: chuyển toàn bộ lịch sử sang hồ sơ giữ lại, hồ sơ cũ được đánh dấu đã gộp (không xóa). */
    public function merge(Request $request, int $id)
    {
        $d = $request->validate(['merge_id' => 'required|integer|different:id', 'reason' => 'required|string|max:300']);
        $keep = Customer::findOrFail($id);
        $drop = Customer::findOrFail($d['merge_id']);
        abort_if($keep->id === $drop->id, 422, 'Chọn hai hồ sơ khác nhau.');
        DB::transaction(function () use ($keep, $drop, $d) {
            Booking::where('customer_id', $drop->id)->update(['customer_id' => $keep->id]);
            Booking::where('bill_to_id', $drop->id)->update(['bill_to_id' => $keep->id]);
            DB::table('stay_guests')->where('customer_id', $drop->id)
                ->whereNotIn('stay_id', DB::table('stay_guests')->where('customer_id', $keep->id)->pluck('stay_id'))->update(['customer_id' => $keep->id]);
            DB::table('payments')->where('customer_id', $drop->id)->update(['customer_id' => $keep->id]);
            DB::table('folios')->where('bill_to_id', $drop->id)->update(['bill_to_id' => $keep->id]);
            Feedback::where('customer_id', $drop->id)->update(['customer_id' => $keep->id]);
            Customer::where('company_id', $drop->id)->update(['company_id' => $keep->id]);
            foreach (['phone', 'email', 'nationality', 'address', 'tax_code', 'date_of_birth'] as $f) {
                if (!$keep->$f && $drop->$f) $keep->$f = $drop->$f;
            }
            if (!$keep->id_number_hash && $drop->id_number_hash) {
                $keep->id_type = $drop->id_type;
                $keep->id_number = $drop->id_number;
                $keep->id_number_hash = $drop->id_number_hash;
            }
            $keep->vip = $keep->vip || $drop->vip;
            $keep->save();
            $drop->update(['merged_into_id' => $keep->id]);
            Audit::log('customer.merge', $keep, "Gộp hồ sơ #{$drop->id} {$drop->full_name} vào #{$keep->id}", $d['reason']);
        });
        return $keep->refresh();
    }

    public function feedback(Request $request)
    {
        $d = $request->validate(['customer_id' => 'nullable|integer|exists:customers,id', 'booking_id' => 'nullable|integer',
            'type' => 'required|in:feedback,complaint', 'rating' => 'nullable|integer|between:1,5', 'content' => 'required|string|max:2000']);
        if (!empty($d['booking_id'])) $this->booking($d['booking_id']);
        $f = Feedback::create($d + ['created_by' => auth()->id()]);
        Audit::log('feedback.create', $f, $d['type'] === 'complaint' ? 'Ghi nhận khiếu nại' : 'Ghi nhận phản hồi');
        return $f;
    }

    public function feedbackList(Request $request)
    {
        return Feedback::query()->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))->latest('id')->limit(200)->get()
            ->map(fn ($f) => $f->toArray() + ['customer' => Customer::whereKey($f->customer_id)->value('full_name')]);
    }

    public function resolveFeedback(Request $request, int $id)
    {
        $d = $request->validate(['resolution' => 'required|string|max:500']);
        $f = Feedback::findOrFail($id);
        $f->update(['status' => 'resolved', 'resolution' => $d['resolution']]);
        Audit::log('feedback.resolve', $f, 'Xử lý phản hồi/khiếu nại', $d['resolution']);
        return $f;
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $data = $request->validate([
            'kind' => "$req|in:guest,company,agent", 'full_name' => "$req|string|max:160",
            'company_id' => 'nullable|integer|exists:customers,id', 'phone' => ['nullable', 'string', 'regex:/^[+0-9 .()\-]{8,20}$/'],
            'email' => 'nullable|email|max:200', 'tax_code' => 'nullable|string|max:40', 'nationality' => 'nullable|string|max:60',
            'date_of_birth' => 'nullable|date_format:Y-m-d', 'gender' => 'nullable|in:male,female,other', 'address' => 'nullable|string|max:300',
            'id_type' => 'nullable|in:cccd,passport,other', 'id_number' => 'nullable|string|max:40', 'vip' => 'boolean',
            'preferences' => 'nullable|string|max:1000', 'notes' => 'nullable|string|max:1000', 'credit_limit' => 'nullable|integer|min:0',
        ]);
        if (array_key_exists('id_number', $data)) {
            abort_unless($this->allowed('guests.documents'), 403, 'Không có quyền xem/sửa giấy tờ tùy thân.');
            $data['id_number_hash'] = Customer::hashDocument($data['id_number']);
        }
        if (isset($data['phone'])) $data['phone'] = preg_replace('/[^0-9+]/', '', $data['phone']);
        if (isset($data['email'])) $data['email'] = strtolower($data['email']);
        return $data;
    }

    private function guardDuplicate(array $data, ?int $exceptId = null): void
    {
        if (request()->boolean('allow_duplicate')) return;
        $q = Customer::whereNull('merged_into_id')->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId));
        $dup = (clone $q)->where(fn ($q) => $q
            ->when($data['phone'] ?? null, fn ($q, $p) => $q->orWhere('phone', $p))
            ->when($data['email'] ?? null, fn ($q, $e) => $q->orWhere('email', $e))
            ->when($data['id_number_hash'] ?? null, fn ($q, $h) => $q->orWhere('id_number_hash', $h))
            ->whereRaw(empty($data['phone']) && empty($data['email']) && empty($data['id_number_hash']) ? '1 = 0' : '1 = 1'))->first();
        abort_if($dup, 409, "Có thể trùng hồ sơ #{$dup?->id} {$dup?->full_name}. Kiểm tra lại hoặc gộp hồ sơ.");
    }

    private function duplicatesOf(Customer $c): array
    {
        $q = Customer::whereNull('merged_into_id')->where('id', '!=', $c->id)->where(fn ($q) => $q
            ->when($c->phone, fn ($q) => $q->orWhere('phone', $c->phone))
            ->when($c->email, fn ($q) => $q->orWhere('email', $c->email))
            ->when($c->id_number_hash, fn ($q) => $q->orWhere('id_number_hash', $c->id_number_hash))
            ->orWhere('full_name', $c->full_name));
        return $q->limit(10)->get(['id', 'full_name', 'phone', 'email', 'kind'])->all();
    }
}
