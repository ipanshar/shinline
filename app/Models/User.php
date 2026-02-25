<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'login',
        'email',
        'password',
        'phone',
        'whatsapp_number',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function roles() {
        return $this->belongsToMany(Role::class);
    }

    /**
     * Проверить, имеет ли пользователь указанную роль
     */
    public function hasRole(string $role): bool
    {
        return $this->roles->contains('name', $role);
    }

    /**
     * Проверить, имеет ли пользователь хотя бы одну из указанных ролей
     */
    public function hasAnyRole(array $roles): bool
    {
        return $this->roles->whereIn('name', $roles)->isNotEmpty();
    }

    /**
     * Проверить, является ли пользователь администратором
     */
    public function isAdmin(): bool
    {
        return $this->hasRole('Администратор');
    }

    /**
     * Проверить доступ с учётом иерархии (Администратор имеет доступ ко всему)
     */
    public function canAccess(string $requiredRole): bool
    {
        if ($this->isAdmin()) return true;
        if (empty($requiredRole)) return true;
        return $this->hasRole($requiredRole);
    }

    /**
     * Проверить, имеет ли пользователь указанное разрешение
     * Администратор автоматически имеет все разрешения
     */
    public function hasPermission(string $permission): bool
    {
        if ($this->isAdmin()) return true;
        
        return $this->roles->contains(function ($role) use ($permission) {
            return $role->hasPermission($permission);
        });
    }

    /**
     * Проверить, имеет ли пользователь хотя бы одно из указанных разрешений
     */
    public function hasAnyPermission(array $permissions): bool
    {
        if ($this->isAdmin()) return true;
        
        foreach ($permissions as $permission) {
            if ($this->hasPermission($permission)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Проверить, имеет ли пользователь все указанные разрешения
     */
    public function hasAllPermissions(array $permissions): bool
    {
        if ($this->isAdmin()) return true;
        
        foreach ($permissions as $permission) {
            if (!$this->hasPermission($permission)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Получить все разрешения пользователя (через его роли)
     */
    public function getAllPermissions()
    {
        return $this->roles->flatMap(function ($role) {
            return $role->permissions;
        })->unique('id');
    }

    /**
     * Получить максимальный уровень роли пользователя
     */
    public function getMaxRoleLevel(): int
    {
        return $this->roles->max('level') ?? 0;
    }

    /**
     * Проверить доступ по уровню роли
     */
    public function hasLevelAccess(int $requiredLevel): bool
    {
        return $this->getMaxRoleLevel() >= $requiredLevel;
    }

    public function trucks() {
        return $this->belongsToMany(Truck::class, 'truck_user','user_id', 'truck_id' )->withPivot('assigned_date');;
    }
}
