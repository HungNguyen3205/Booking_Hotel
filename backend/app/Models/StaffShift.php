<?php
namespace App\Models;

class StaffShift extends Base
{
    protected $casts = ['work_date' => 'date:Y-m-d'];
    public function user() { return $this->belongsTo(User::class); }
}
