<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Services\Audit;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    public function index()
    {
        $items = InventoryItem::where('property_id', $this->pid())->orderBy('category')->orderBy('name')->get();
        return ['items' => $items, 'low_stock' => $items->filter(fn ($i) => $i->active && $i->on_hand <= $i->min_stock)->values(),
            'types' => InventoryService::TYPES, 'categories' => ['minibar' => 'Minibar', 'consumable' => 'Vật tư tiêu hao', 'linen' => 'Đồ vải']];
    }

    public function store(Request $request)
    {
        $d = $this->validated($request);
        $item = InventoryItem::create($d + ['property_id' => $this->pid(), 'on_hand' => 0]);
        Audit::log('inventory.create', $item, "Thêm mặt hàng {$item->name}");
        return response()->json($item, 201);
    }

    public function update(Request $request, int $id)
    {
        $item = InventoryItem::where('property_id', $this->pid())->findOrFail($id);
        $item->fill($this->validated($request, $id));
        $diff = Audit::diff($item);
        $item->save();
        if ($diff) Audit::log('inventory.update', $item, "Sửa mặt hàng {$item->name}", null, $diff);
        return $item;
    }

    private function validated(Request $request, ?int $id = null): array
    {
        return $request->validate([
            'sku' => ['required', 'string', 'max:40', Rule::unique('inventory_items')->where('property_id', $this->pid())->ignore($id)],
            'name' => 'required|string|max:160', 'category' => 'required|in:minibar,consumable,linen', 'unit' => 'required|string|max:20',
            'min_stock' => 'required|integer|min:0', 'unit_cost' => 'nullable|integer|min:0', 'active' => 'boolean',
        ]);
    }

    public function movements(Request $request)
    {
        return InventoryMovement::with('item:id,name,unit', 'creator:id,name')
            ->whereHas('item', fn ($q) => $q->where('property_id', $this->pid()))
            ->when($request->query('item_id'), fn ($q, $id) => $q->where('inventory_item_id', $id))
            ->latest('id')->paginate(50);
    }

    public function move(Request $request, InventoryService $inventory)
    {
        $d = $request->validate(['inventory_item_id' => 'required|integer', 'type' => 'required|in:receive,issue,count,adjust,damage,loss',
            'quantity' => 'required|integer|between:-100000,100000', 'note' => 'nullable|string|max:500']);
        $item = InventoryItem::where('property_id', $this->pid())->findOrFail($d['inventory_item_id']);
        abort_if($d['type'] === 'count' && $d['quantity'] < 0, 422, 'Số kiểm kê không được âm.');
        $m = $inventory->move($item->id, $d['type'], (int) $d['quantity'], $d['note'] ?? null);
        Audit::log('inventory.'.$d['type'], $item, InventoryService::TYPES[$d['type']].": {$item->name} ({$m->quantity})", $d['note'] ?? null);
        return $m->load('item:id,name,on_hand');
    }
}
