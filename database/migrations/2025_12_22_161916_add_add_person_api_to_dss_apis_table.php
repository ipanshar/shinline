<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Добавляем новый API метод для добавления пользователей в DSS
        // Предполагаем, что dss_setings_id = 1 (первая запись настроек DSS)
        // Если у вас другой ID, измените значение соответственно
        
        DB::table('dss_apis')->insert([
            'api_name' => 'AddPerson',
            'method' => 'POST',
            'request_url' => '/obms/api/v1.1/acs/person',
            'dss_setings_id' => 1, // Измените на нужный ID настроек DSS
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Удаляем добавленный API метод
        DB::table('dss_apis')
            ->where('api_name', 'AddPerson')
            ->where('request_url', '/obms/api/v1.1/acs/person')
            ->delete();
    }
};
