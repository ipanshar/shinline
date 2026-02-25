<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    protected $fillable = ['name', 'level', 'description'];

    /**
     * Пользователи с этой ролью
     */
    public function users()
    {
        return $this->belongsToMany(User::class);
    }

    /**
     * Разрешения этой роли
     */
    public function permissions()
    {
        return $this->belongsToMany(Permission::class, 'role_permission');
    }

    /**
     * Проверить, есть ли у роли указанное разрешение
     */
    public function hasPermission(string $permission): bool
    {
        return $this->permissions->contains('name', $permission);
    }

    /**
     * Дать разрешение роли
     */
    public function givePermission(string|Permission $permission): void
    {
        if (is_string($permission)) {
            $permission = Permission::findByName($permission);
        }
        
        if ($permission && !$this->hasPermission($permission->name)) {
            $this->permissions()->attach($permission->id);
        }
    }

    /**
     * Забрать разрешение у роли
     */
    public function revokePermission(string|Permission $permission): void
    {
        if (is_string($permission)) {
            $permission = Permission::findByName($permission);
        }
        
        if ($permission) {
            $this->permissions()->detach($permission->id);
        }
    }

    /**
     * Найти роль по имени
     */
    public static function findByName(string $name): ?self
    {
        return static::where('name', $name)->first();
    }
}
