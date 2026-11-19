<?php
namespace App\Models;

class WebhookEvent extends Base
{
    protected $casts = ['payload' => 'array', 'processed_at' => 'datetime'];
}
