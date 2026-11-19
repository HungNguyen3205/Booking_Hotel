<?php
namespace App\Models;

class FolioLine extends Base
{
    protected $casts = ['business_date' => 'date:Y-m-d', 'voided_at' => 'datetime', 'amount' => 'integer', 'unit_price' => 'integer'];
    public function poster() { return $this->belongsTo(User::class, 'posted_by'); }
    public function service() { return $this->belongsTo(Service::class); }
}
