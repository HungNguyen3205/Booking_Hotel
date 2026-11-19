<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CashEntry;
use App\Models\InventoryItem;
use App\Models\PaymentMethod;
use App\Models\Service;
use App\Models\ServicePackage;
use App\Services\Audit;
use App\Services\Context;
use App\Services\FolioService;
use App\Services\InventoryService;
use App\Services\Settings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ServiceController extends Controller
{
    public const CATEGORY_LABELS = ['minibar' => 'Minibar', 'laundry' => 'Giặt ủi', 'fnb' => 'Ăn uống', 'transfer' => 'Đưa đón',
        'car' => 'Thuê xe', 'spa' => 'Spa', 'coffee' => 'Coffee', 'yoga' => 'Yoga', 'other' => 'Khác'];

    public function index()
    {
        return [
            'services' => Service::with('item:id,name,on_hand,unit,min_stock')->where('property_id', $this->pid())->orderBy('category')->orderBy('sort')->orderBy('name')->get(),
            'category_images' => config('hotel.service_category_images'),
            'packages' => ServicePackage::where('property_id', $this->pid())->get(),
            'categories' => self::CATEGORY_LABELS,
        ];
    }

    public function store(Request $request)
    {
        $s = Service::create($this->validated($request) + ['property_id' => $this->pid()]);
        Audit::log('service.create', $s, "Thêm dịch vụ {$s->name}");
        return response()->json($s, 201);
    }

    public function update(Request $request, int $id)
    {
        $s = Service::where('property_id', $this->pid())->findOrFail($id);
        $s->fill($this->validated($request));
        $diff = Audit::diff($s);
        $s->save();
        if ($diff) Audit::log('service.update', $s, "Sửa dịch vụ {$s->name}", null, $diff);
        return $s;
    }

    private function validated(Request $request): array
    {
        $d = $request->validate(['category' => ['required', Rule::in(Service::CATEGORIES)], 'name' => 'required|string|max:160',
            'unit' => 'required|string|max:30', 'price' => 'required|integer|min:0|max:1000000000',
            'description' => 'nullable|string|max:300', 'image' => ['nullable', 'string', 'max:300', 'regex:#^/(images|api/media)/#'],
            'sort' => 'nullable|integer|min:0|max:9999', 'inventory_item_id' => 'nullable|integer', 'active' => 'boolean']);
        if (array_key_exists('image', $d)) $d['image_credit'] = null; // ảnh tự tải lên: khách sạn sở hữu
        if (!empty($d['inventory_item_id'])) InventoryItem::where('property_id', $this->pid())->findOrFail($d['inventory_item_id']);
        return $d;
    }

    /** Combo (giai đoạn 3): lưu cấu hình, chưa bán trực tiếp. */
    public function savePackage(Request $request, ?int $id = null)
    {
        $d = $request->validate(['name' => 'required|string|max:160', 'description' => 'nullable|string|max:1000', 'price' => 'required|integer|min:0',
            'items' => 'required|array|min:1', 'items.*.service_id' => 'required|integer', 'items.*.quantity' => 'required|integer|min:1', 'active' => 'boolean']);
        $p = $id ? ServicePackage::where('property_id', $this->pid())->findOrFail($id) : new ServicePackage(['property_id' => $this->pid()]);
        $p->fill($d)->save();
        Audit::log('package.save', $p, "Lưu combo {$p->name}");
        return $p;
    }

    /** Bán dịch vụ lẻ cho khách không lưu trú: thu tiền ngay, ghi sổ thu và trừ kho. */
    public function walkInSale(Request $request, FolioService $folios, InventoryService $inventory)
    {
        $d = $request->validate(['service_id' => 'required|integer', 'quantity' => 'required|integer|between:1,100',
            'method' => 'required|string|max:30', 'customer_name' => 'nullable|string|max:120', 'note' => 'nullable|string|max:300']);
        $service = Service::where('property_id', $this->pid())->where('active', true)->findOrFail($d['service_id']);
        $method = PaymentMethod::where('code', $d['method'])->where('active', true)->firstOrFail();
        $shift = $folios->currentShift();
        if ($method->type === 'cash' && Settings::value('booking', 'require_shift_for_cash')) abort_unless($shift, 409, 'Mở ca trước khi thu tiền mặt.');
        return DB::transaction(function () use ($d, $service, $method, $shift, $inventory) {
            $entry = CashEntry::create(['property_id' => $this->pid(), 'shift_id' => $shift?->id, 'type' => 'income', 'category' => 'Bán dịch vụ lẻ',
                'method' => $method->code, 'amount' => $service->price * $d['quantity'],
                'description' => "{$service->name} x{$d['quantity']}".(!empty($d['customer_name']) ? " — {$d['customer_name']}" : '').(!empty($d['note']) ? " ({$d['note']})" : ''),
                'business_date' => Context::today()->toDateString(), 'created_by' => auth()->id()]);
            if ($service->inventory_item_id) $inventory->sale($service->inventory_item_id, $d['quantity'], 'cash_entry', $entry->id);
            Audit::log('service.walk_in', $entry, "Bán lẻ {$service->name} x{$d['quantity']}");
            return $entry;
        });
    }
}
