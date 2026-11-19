<?php
namespace App\Models;

class LostItem extends Base
{
    protected $casts = ['found_at' => 'datetime'];
    public function room() { return $this->belongsTo(Room::class); }
}
