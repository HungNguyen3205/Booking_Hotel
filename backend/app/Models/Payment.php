<?php
namespace App\Models;

class Payment extends Base
{
    protected $casts = ['paid_at' => 'datetime', 'amount' => 'integer'];
    public function receiver() { return $this->belongsTo(User::class, 'received_by'); }
    public function booking() { return $this->belongsTo(Booking::class); }

    /** Số tiền có dấu: hoàn tiền là số âm. */
    public function signedAmount(): int { return $this->kind === 'refund' ? -$this->amount : $this->amount; }
}
