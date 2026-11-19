<?php
namespace App\Models;

class RateRule extends Base
{
    protected $casts = ['days_of_week' => 'array', 'active' => 'boolean', 'start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d', 'price' => 'integer'];
    public function roomType() { return $this->belongsTo(RoomType::class); }
}
