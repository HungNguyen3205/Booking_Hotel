<?php
namespace App\Models;

class MaintenanceTicket extends Base
{
    protected $casts = ['resolved_at' => 'datetime'];
    public function room() { return $this->belongsTo(Room::class); }
    public function block() { return $this->belongsTo(RoomBlock::class, 'room_block_id'); }
    public function assignee() { return $this->belongsTo(User::class, 'assigned_to'); }
    public function reporter() { return $this->belongsTo(User::class, 'reported_by'); }
}
