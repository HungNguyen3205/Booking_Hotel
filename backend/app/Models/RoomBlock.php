<?php
namespace App\Models;

class RoomBlock extends Base
{
    protected $casts = ['start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d', 'released_at' => 'datetime'];
    public function room() { return $this->belongsTo(Room::class); }
}
