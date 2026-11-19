<?php
namespace App\Models;

class ServicePackage extends Base
{
    protected $casts = ['items' => 'array', 'active' => 'boolean'];
}
