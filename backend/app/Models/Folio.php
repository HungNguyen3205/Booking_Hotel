<?php
namespace App\Models;

class Folio extends Base
{
    protected $casts = ['closed_at' => 'datetime'];
    public function booking() { return $this->belongsTo(Booking::class); }
    public function lines() { return $this->hasMany(FolioLine::class); }
    public function nights() { return $this->hasMany(StayNight::class); }
    public function payments() { return $this->hasMany(Payment::class); }
    public function billTo() { return $this->belongsTo(Customer::class, 'bill_to_id'); }
}
