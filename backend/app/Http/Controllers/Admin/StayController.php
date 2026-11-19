<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Stay;
use App\Services\Audit;
use App\Services\Context;
use App\Services\FrontDeskService;
use Illuminate\Http\Request;

class StayController extends Controller
{
    public function __construct(private FrontDeskService $desk) {}

    public function checkIn(Request $request, int $id)
    {
        $d = $request->validate(['override_reason' => 'nullable|string|max:500', 'early_fee' => 'boolean',
            'guest_ids' => 'nullable|array|max:10', 'guest_ids.*' => 'integer|exists:customers,id']);
        return $this->desk->checkIn($this->stay($id), $d);
    }

    public function checkOut(Request $request, int $id)
    {
        $d = $request->validate(['late_fee' => 'boolean', 'settle_later' => 'boolean', 'reason' => 'nullable|string|max:500', 'expected_balance' => 'nullable|integer']);
        return $this->desk->checkOut($this->stay($id), $d);
    }

    public function checkoutQuote(Request $request, int $id)
    {
        $d = $request->validate(['late_fee' => 'boolean']);
        return $this->desk->checkoutQuote($this->stay($id), (bool) ($d['late_fee'] ?? false));
    }

    public function quoteDates(Request $request, int $id)
    {
        $d = $request->validate(['check_in' => 'required|date_format:Y-m-d', 'check_out' => 'required|date_format:Y-m-d']);
        return $this->desk->quoteDates($this->stay($id), $d['check_in'], $d['check_out']);
    }

    public function changeDates(Request $request, int $id)
    {
        $d = $request->validate(['check_in' => 'required|date_format:Y-m-d', 'check_out' => 'required|date_format:Y-m-d',
            'reason' => 'nullable|string|max:500', 'expected_delta' => 'nullable|integer']);
        $stay = $this->stay($id);
        if (isset($d['expected_delta'])) {
            $q = $this->desk->quoteDates($stay, $d['check_in'], $d['check_out']);
            abort_if($q['delta'] !== (int) $d['expected_delta'], 409, 'Giá đã thay đổi so với lúc xem trước. Vui lòng kiểm tra lại.');
        }
        return $this->desk->changeDates($stay, $d['check_in'], $d['check_out'], $d['reason'] ?? null);
    }

    public function quoteMove(Request $request, int $id)
    {
        $d = $request->validate(['room_id' => 'required|integer', 'reprice' => 'boolean']);
        $this->room($d['room_id']);
        return $this->desk->quoteMove($this->stay($id), $d['room_id'], (bool) ($d['reprice'] ?? false));
    }

    public function move(Request $request, int $id)
    {
        $d = $request->validate(['room_id' => 'required|integer', 'reprice' => 'boolean', 'reason' => 'required|string|min:3|max:500',
            'override_reason' => 'nullable|string|max:500', 'expected_delta' => 'nullable|integer']);
        $this->room($d['room_id']);
        $stay = $this->stay($id);
        if (isset($d['expected_delta'])) {
            $q = $this->desk->quoteMove($stay, $d['room_id'], (bool) ($d['reprice'] ?? false));
            abort_if($q['delta'] !== (int) $d['expected_delta'], 409, 'Giá đã thay đổi so với lúc xem trước. Vui lòng kiểm tra lại.');
        }
        return $this->desk->move($stay, $d['room_id'], (bool) ($d['reprice'] ?? false), $d['reason'], $d['override_reason'] ?? null);
    }

    /** Thêm khách cùng phòng (tạo hồ sơ mới hoặc dùng hồ sơ có sẵn). */
    public function addGuest(Request $request, int $id)
    {
        $stay = $this->stay($id);
        $d = $request->validate([
            'customer_id' => 'nullable|integer|exists:customers,id',
            'full_name' => 'required_without:customer_id|nullable|string|max:120',
            'phone' => ['nullable', 'string', 'regex:/^[+0-9 .()\-]{8,20}$/'],
            'nationality' => 'nullable|string|max:60', 'date_of_birth' => 'nullable|date_format:Y-m-d', 'gender' => 'nullable|in:male,female,other',
            'id_type' => 'nullable|in:cccd,passport,other', 'id_number' => 'nullable|string|max:40', 'address' => 'nullable|string|max:300',
        ]);
        abort_if(!empty($d['id_number']) && !$this->allowed('guests.documents'), 403, 'Không có quyền nhập giấy tờ tùy thân.');
        if (!empty($d['customer_id'])) {
            $customer = Customer::findOrFail($d['customer_id']);
        } else {
            $hash = Customer::hashDocument($d['id_number'] ?? null);
            $customer = ($hash ? Customer::where('id_number_hash', $hash)->whereNull('merged_into_id')->first() : null)
                ?? Customer::create(collect($d)->except('customer_id')->all() + ['kind' => 'guest', 'id_number_hash' => $hash,
                    'phone' => isset($d['phone']) ? preg_replace('/[^0-9+]/', '', $d['phone']) : null]);
        }
        abort_if($stay->guests()->count() >= $stay->type->max_occupancy, 422, 'Đã đủ số khách tối đa của phòng.');
        $stay->guests()->syncWithoutDetaching([$customer->id => ['is_primary' => $stay->guests()->count() === 0]]);
        Audit::log('stay.add_guest', $stay->booking, "Thêm khách cùng phòng {$stay->room?->number}");
        return $stay->guests()->get();
    }

    public function removeGuest(int $id, int $customerId)
    {
        $stay = $this->stay($id);
        abort_if($stay->guests()->wherePivot('is_primary', true)->where('customers.id', $customerId)->exists(), 422, 'Không xóa khách đại diện.');
        $stay->guests()->detach($customerId);
        Audit::log('stay.remove_guest', $stay->booking, "Bỏ khách khỏi phòng {$stay->room?->number}");
        return $stay->guests()->get();
    }

    /** Ghi dịch vụ thẳng vào hồ sơ chính của phòng đang ở (thao tác nhanh từ thẻ dịch vụ). */
    public function postService(Request $request, int $id, \App\Services\FolioService $folios)
    {
        $stay = $this->stay($id);
        abort_unless($stay->status === 'checked_in', 409, 'Phòng không có khách đang ở.');
        $d = $request->validate(['service_id' => 'required|integer', 'quantity' => 'required|integer|between:1,100', 'note' => 'nullable|string|max:200']);
        $service = \App\Models\Service::where('property_id', $this->pid())->findOrFail($d['service_id']);
        $folio = $stay->booking->folios()->where('status', 'open')->orderBy('id')->first() ?? $folios->mainFolio($stay->booking);
        return response()->json($folios->postService($folio, $service, $d['quantity'], $stay, $d['note'] ?? null), 201);
    }

    /** Danh sách khách đang lưu trú. */
    public function inHouse()
    {
        return Stay::with(['room:id,number', 'type:id,name', 'booking:id,code,customer_id', 'guests:id,full_name,phone,nationality,date_of_birth,gender,id_type'])
            ->whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()))->where('status', 'checked_in')->orderBy('room_id')->get();
    }

    /**
     * Xuất danh sách lưu trú phục vụ khai báo tạm trú (CSV). Đây là tệp để lễ tân khai báo thủ công;
     * hệ thống chưa kết nối trực tiếp cổng khai báo lưu trú.
     */
    public function export()
    {
        $showDocs = $this->allowed('guests.documents');
        $stays = $this->inHouse();
        $rows = [];
        foreach ($stays as $s) {
            foreach ($s->guests as $g) {
                $c = Customer::find($g->id);
                $rows[] = [$s->room->number, $s->booking->code, $c->full_name, $c->date_of_birth?->format('d/m/Y'), $c->gender, $c->nationality,
                    $c->id_type, $showDocs ? $c->id_number : '[không có quyền xem]', $c->address, $s->check_in->format('d/m/Y'), $s->check_out->format('d/m/Y')];
            }
        }
        Audit::log('guests.export', null, 'Xuất danh sách khách lưu trú ('.count($rows).' khách)');
        return $this->csv('khach-luu-tru-'.Context::today()->format('Ymd').'.csv',
            ['Phòng', 'Mã đặt phòng', 'Họ tên', 'Ngày sinh', 'Giới tính', 'Quốc tịch', 'Loại giấy tờ', 'Số giấy tờ', 'Địa chỉ', 'Ngày đến', 'Ngày đi'], $rows);
    }
}
