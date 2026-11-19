<?php
namespace App\Models;

class Service extends Base
{
    public const CATEGORIES = ['minibar', 'laundry', 'fnb', 'transfer', 'car', 'spa', 'coffee', 'yoga', 'other'];
    protected $casts = ['active' => 'boolean', 'price' => 'integer', 'image_credit' => 'array'];
    public function item() { return $this->belongsTo(InventoryItem::class, 'inventory_item_id'); }
}
