<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Kiểm tra đầu vào nằm ở controller/service; model chỉ mô tả quan hệ và kiểu dữ liệu. */
abstract class Base extends Model
{
    protected $guarded = ['id'];
}
