<?php
namespace App\Models;

class Role extends Base
{
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $guarded = [];
    protected $casts = ['permissions' => 'array', 'system' => 'boolean'];
}
