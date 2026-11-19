<?php
namespace App\Models;

class Stay extends Base
{
    public const ACTIVE = ['hold', 'confirmed', 'checked_in'];
    protected $casts = ['check_in' => 'date:Y-m-d', 'check_out' => 'date:Y-m-d', 'checked_in_at' => 'datetime',
        'checked_out_at' => 'datetime', 'room_locked' => 'boolean'];

    public function booking() { return $this->belongsTo(Booking::class); }
    public function room() { return $this->belongsTo(Room::class); }
    public function type() { return $this->belongsTo(RoomType::class, 'room_type_id'); }
    public function nights() { return $this->hasMany(StayNight::class)->orderBy('night'); }
    public function guests() { return $this->belongsToMany(Customer::class, 'stay_guests')->withPivot('is_primary'); }
    public function ratePlan() { return $this->belongsTo(RatePlan::class); }
}
