<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class LocalDemoUsersSeeder extends Seeder
{
    /**
     * Create local-only demo users for manual testing.
     *
     * This seeder is intentionally NOT referenced from DatabaseSeeder,
     * so it only runs when you call it explicitly.
     */
    public function run(): void
    {
        $roles = [
            'Администратор' => 100,
            'Оператор' => 50,
            'Снабженец' => 20,
        ];

        foreach ($roles as $name => $level) {
            Role::firstOrCreate([
                'name' => $name,
            ], [
                'level' => $level,
                'description' => 'Local demo role',
            ]);
        }

        $users = [
            [
                'name' => 'Demo Admin',
                'login' => 'admin',
                'phone' => '+77000000001',
                'company' => 'Shin Line',
                'email' => 'admin@example.com',
                'password' => 'admin123',
                'role' => 'Администратор',
            ],
            [
                'name' => 'Demo Operator',
                'login' => 'operator',
                'phone' => '+77000000002',
                'company' => 'Shin Line',
                'email' => 'operator@example.com',
                'password' => 'operator123',
                'role' => 'Оператор',
            ],
            [
                'name' => 'Demo Client',
                'login' => 'client',
                'phone' => '+77000000003',
                'company' => 'Shin Line',
                'email' => 'client@example.com',
                'password' => 'client123',
                'role' => 'Снабженец',
            ],
        ];

        foreach ($users as $data) {
            $user = User::updateOrCreate(
                ['login' => $data['login']],
                [
                    'name' => $data['name'],
                    'phone' => $data['phone'],
                    'company' => $data['company'],
                    'email' => $data['email'],
                    'password' => Hash::make($data['password']),
                ]
            );

            $role = Role::findByName($data['role']);
            if ($role) {
                $user->roles()->syncWithoutDetaching([$role->id]);
            }
        }
    }
}

