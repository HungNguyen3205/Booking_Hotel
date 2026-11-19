<?php
namespace App\Services;

use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Kho: mọi thay đổi tồn đi qua bảng inventory_movements.
 * Bán minibar trừ kho với khóa duy nhất (ref_type, ref_id, item, type) nên một khoản phí chỉ trừ kho một lần.
 */
class InventoryService
{
    public const TYPES = [
        'receive' => 'Nhập kho', 'issue' => 'Xuất dùng', 'sale' => 'Bán (minibar/dịch vụ)', 'sale_reversal' => 'Hoàn kho do hủy phí',
        'count' => 'Kiểm kê', 'adjust' => 'Điều chỉnh', 'damage' => 'Hỏng', 'loss' => 'Mất',
    ];

    public function move(int $itemId, string $type, int $quantity, ?string $note = null, ?string $refType = null, ?int $refId = null): InventoryMovement
    {
        abort_unless(array_key_exists($type, self::TYPES), 422, 'Loại phiếu kho không hợp lệ.');
        return DB::transaction(function () use ($itemId, $type, $quantity, $note, $refType, $refId) {
            $item = InventoryItem::whereKey($itemId)->lockForUpdate()->firstOrFail();
            $delta = match ($type) {
                'receive', 'sale_reversal' => abs($quantity),
                'issue', 'sale', 'damage', 'loss' => -abs($quantity),
                'count' => $quantity - $item->on_hand, // $quantity là số đếm thực tế
                'adjust' => $quantity,
            };
            abort_if($type !== 'count' && $delta === 0, 422, 'Số lượng phải khác 0.');
            abort_if(in_array($type, ['adjust', 'damage', 'loss', 'count'], true) && !$note, 422, 'Cần ghi chú lý do.');
            $balance = $item->on_hand + $delta;
            try {
                $movement = InventoryMovement::create([
                    'inventory_item_id' => $item->id, 'type' => $type, 'quantity' => $delta, 'balance_after' => $balance,
                    'ref_type' => $refType, 'ref_id' => $refId, 'note' => $note, 'created_by' => auth()->id(),
                ]);
            } catch (QueryException $e) {
                if (app(AvailabilityService::class)->isUniqueViolation($e)) {
                    abort(409, 'Chứng từ này đã được ghi kho trước đó.');
                }
                throw $e;
            }
            $item->update(['on_hand' => $balance]);
            return $movement;
        });
    }

    public function sale(int $itemId, int $quantity, string $refType, int $refId): InventoryMovement
    {
        return $this->move($itemId, 'sale', $quantity, 'Bán qua dịch vụ', $refType, $refId);
    }

    public function saleReversal(int $itemId, int $quantity, string $refType, int $refId): InventoryMovement
    {
        return $this->move($itemId, 'sale_reversal', $quantity, 'Hoàn kho do hủy khoản phí', $refType, $refId);
    }
}
