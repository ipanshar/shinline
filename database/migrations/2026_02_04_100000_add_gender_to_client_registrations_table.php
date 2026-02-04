<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('client_registrations', function (Blueprint $table) {
            $table->enum('gender', ['male', 'female'])->after('birth_date')->comment('Пол: male - мужчина, female - женщина');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('client_registrations', function (Blueprint $table) {
            $table->dropColumn('gender');
        });
    }
};
