<?php
namespace App\Models;

class Setting extends Base
{
    protected $guarded = [];
    protected $casts = ['value' => 'array'];
}
