<?php
namespace App\Models;

class Customer extends Base
{
    protected $casts = ['vip' => 'boolean', 'id_number' => 'encrypted', 'date_of_birth' => 'date:Y-m-d', 'credit_limit' => 'integer'];
    /** Số giấy tờ chỉ trả về khi người dùng có quyền guests.documents (xem CustomerController). */
    protected $hidden = ['id_number', 'id_number_hash'];

    public function company() { return $this->belongsTo(Customer::class, 'company_id'); }
    public function bookings() { return $this->hasMany(Booking::class); }

    public static function hashDocument(?string $number): ?string
    {
        $normalized = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $number));
        return $normalized === '' ? null : hash_hmac('sha256', $normalized, (string) config('app.key'));
    }
}
