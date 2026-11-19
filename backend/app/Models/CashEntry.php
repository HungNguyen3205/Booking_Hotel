<?php
namespace App\Models;

class CashEntry extends Base
{
    protected $casts = ['business_date' => 'date:Y-m-d', 'amount' => 'integer'];
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
    public function reversal() { return $this->hasOne(CashEntry::class, 'reverses_id'); }
}
