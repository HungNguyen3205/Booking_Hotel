<?php
namespace App\Models;

class PaymentMethod extends Base
{
    protected $primaryKey = 'code';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $guarded = [];
    protected $casts = ['active' => 'boolean'];
}
