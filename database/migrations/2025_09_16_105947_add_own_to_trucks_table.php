<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up()
    {
        Schema::table('trucks', function (Blueprint $table) {
            $table->boolean('own')->default(false);  // Добавляем поле own с дефолтным значением false
        });
    }

    public function down()
    {
        Schema::table('trucks', function (Blueprint $table) {
            $table->dropColumn('own');  // Удаляем поле own при откате миграции
        });
    }
};
