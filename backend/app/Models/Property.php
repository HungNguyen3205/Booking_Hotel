<?php
namespace App\Models;

class Property extends Base
{
    protected $casts = ['active' => 'boolean'];
    public function floors() { return $this->hasMany(Floor::class)->orderBy('level'); }
    public function roomTypes() { return $this->hasMany(RoomType::class)->orderBy('sort'); }
    public function rooms() { return $this->hasMany(Room::class); }
}
