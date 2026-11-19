<?php
namespace App\Models;

class StayNight extends Base
{
    protected $casts = ['night' => 'date:Y-m-d', 'void' => 'boolean', 'amount' => 'integer', 'room_rate' => 'integer', 'extra_charge' => 'integer'];
}
