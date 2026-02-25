<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Permission extends Model
{
    protected $fillable = ['name', 'description', 'group'];

    /**
     * Роли, которые имеют это разрешение
     */
    public function roles()
    {
        return $this->belongsToMany(Role::class, 'role_permission');
    }

    /**
     * Найти разрешение по имени (slug)
     */
    public static function findByName(string $name): ?self
    {
        return static::where('name', $name)->first();
    }

    /**
     * Получить разрешения по группе
     */
    public static function getByGroup(string $group)
    {
        return static::where('group', $group)->get();
    }
}
