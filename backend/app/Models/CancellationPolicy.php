<?php
namespace App\Models;

class CancellationPolicy extends Base
{
    protected $casts = ['refundable' => 'boolean'];
}
