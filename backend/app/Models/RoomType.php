<?php
namespace App\Models;

class RoomType extends Base
{
    protected $casts = ['amenities' => 'array', 'images' => 'array', 'active' => 'boolean', 'public' => 'boolean',
        'base_rate' => 'integer', 'hourly_rate' => 'integer'];
    public function rooms() { return $this->hasMany(Room::class); }
    public function rateRules() { return $this->hasMany(RateRule::class); }
}
