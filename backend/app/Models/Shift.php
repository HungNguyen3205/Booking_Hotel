<?php
namespace App\Models;

class Shift extends Base
{
    protected $casts = ['opened_at' => 'datetime', 'closed_at' => 'datetime'];
    public function user() { return $this->belongsTo(User::class); }
    public function receiver() { return $this->belongsTo(User::class, 'handed_to'); }
}
