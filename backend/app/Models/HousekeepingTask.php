<?php
namespace App\Models;

class HousekeepingTask extends Base
{
    protected $casts = ['checklist' => 'array', 'started_at' => 'datetime', 'finished_at' => 'datetime', 'inspected_at' => 'datetime'];
    public function room() { return $this->belongsTo(Room::class); }
    public function assignee() { return $this->belongsTo(User::class, 'assigned_to'); }
}
