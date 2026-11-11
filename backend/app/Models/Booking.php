<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    protected $fillable = [
        'room_id', 'code', 'request_key', 'request_hash', 'guest_name', 'email', 'phone',
        'check_in', 'check_out', 'guests', 'nightly_rate', 'total', 'status', 'paid_at',
    ];
    protected $hidden = ['request_key', 'request_hash'];

    public function room()
    {
        return $this->belongsTo(Room::class)->withTrashed();
    }
}
