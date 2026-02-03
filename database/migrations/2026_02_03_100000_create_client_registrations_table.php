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
        Schema::create('client_registrations', function (Blueprint $table) {
            $table->id();
            $table->string('full_name', 255)->comment('ФИО');
            $table->string('iin', 12)->comment('ИИН (12 цифр)');
            $table->string('phone', 20)->comment('Номер телефона');
            $table->text('address')->comment('Адрес проживания');
            $table->timestamps();
            
            $table->index('iin');
            $table->index('phone');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_registrations');
    }
};
