<?php
namespace App\Models;

class InventoryMovement extends Base
{
    public function item() { return $this->belongsTo(InventoryItem::class, 'inventory_item_id'); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
}
