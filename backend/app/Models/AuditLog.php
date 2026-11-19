<?php
namespace App\Models;

class AuditLog extends Base
{
    public const UPDATED_AT = null;
    protected $casts = ['changes' => 'array', 'created_at' => 'datetime'];
    public function user() { return $this->belongsTo(User::class); }
}
