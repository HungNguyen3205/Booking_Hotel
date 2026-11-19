<?php
namespace App\Models;

class Post extends Base
{
    protected $casts = ['published_at' => 'datetime', 'valid_from' => 'date:Y-m-d', 'valid_to' => 'date:Y-m-d'];
}
