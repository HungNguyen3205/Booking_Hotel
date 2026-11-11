<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Room extends Model
{
    use SoftDeletes;

    protected $fillable = ['number', 'name', 'description', 'image', 'price', 'capacity', 'area', 'bed', 'active'];
    protected $casts = ['active' => 'boolean'];
}
