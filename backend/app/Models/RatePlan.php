<?php
namespace App\Models;

class RatePlan extends Base
{
    protected $casts = ['includes_breakfast' => 'boolean', 'public' => 'boolean', 'active' => 'boolean'];
    public function policy() { return $this->belongsTo(CancellationPolicy::class, 'cancellation_policy_id'); }
}
