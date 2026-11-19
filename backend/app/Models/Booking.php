<?php
namespace App\Models;

class Booking extends Base
{
    public const STATUSES = ['hold', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
    public const SOURCES = ['direct', 'phone', 'website', 'agent', 'ota'];
    protected $hidden = ['request_key', 'request_hash'];
    protected $casts = ['hold_expires_at' => 'datetime', 'cancelled_at' => 'datetime', 'policy_snapshot' => 'array',
        'deposit_required' => 'integer'];

    public function property() { return $this->belongsTo(Property::class); }
    public function customer() { return $this->belongsTo(Customer::class); }
    public function billTo() { return $this->belongsTo(Customer::class, 'bill_to_id'); }
    public function stays() { return $this->hasMany(Stay::class); }
    public function folios() { return $this->hasMany(Folio::class); }
    public function payments() { return $this->hasMany(Payment::class); }
    public function ratePlan() { return $this->belongsTo(RatePlan::class); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
}
