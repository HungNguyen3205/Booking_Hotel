<?php
namespace App\Models;

class NotificationOutbox extends Base
{
    protected $table = 'notifications_outbox';
    protected $casts = ['payload' => 'array'];
}
