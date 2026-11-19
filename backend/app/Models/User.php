<?php
namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;

class User extends Authenticatable
{
    protected $fillable = ['name', 'email', 'phone', 'password', 'role', 'active', 'last_login_at'];
    protected $hidden = ['password', 'remember_token'];
    protected $attributes = ['active' => true];
    protected $casts = ['password' => 'hashed', 'active' => 'boolean', 'last_login_at' => 'datetime'];

    public function roleModel() { return $this->belongsTo(Role::class, 'role', 'key'); }
    public function properties() { return $this->belongsToMany(Property::class); }

    /** @return string[] */
    public function permissions(): array
    {
        return $this->roleModel?->permissions ?? [];
    }

    public function hasPermission(string ...$abilities): bool
    {
        if (!$this->active) return false;
        $perms = $this->permissions();
        if (in_array('*', $perms, true)) return true;
        foreach ($abilities as $ability) {
            if (!in_array($ability, $perms, true)) return false;
        }
        return true;
    }

    public function canAccessProperty(int $propertyId): bool
    {
        return $this->properties()->whereKey($propertyId)->exists();
    }
}
