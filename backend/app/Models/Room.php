<?php
namespace App\Models;

class Room extends Base
{
    public const HOUSEKEEPING = ['dirty', 'cleaning', 'inspecting', 'clean'];
    protected $casts = ['archived_at' => 'datetime'];

    public function type() { return $this->belongsTo(RoomType::class, 'room_type_id'); }
    public function floor() { return $this->belongsTo(Floor::class); }
    public function blocks() { return $this->hasMany(RoomBlock::class); }
    public function scopeSellable($q) { return $q->whereNull('archived_at'); }
}
