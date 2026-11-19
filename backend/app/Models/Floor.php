<?php
namespace App\Models;

class Floor extends Base
{
    protected $casts = ['landmarks' => 'array', 'layout_confirmed' => 'boolean'];
    public function rooms() { return $this->hasMany(Room::class)->orderBy('sort'); }
}
