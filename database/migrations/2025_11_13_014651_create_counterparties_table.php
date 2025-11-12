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
        Schema::create('counterparties', function (Blueprint $table) {
            $table->id();
            $table->string('name'); // Название организации
            $table->string('inn')->unique(); // ИНН/БИН (уникальный)
            $table->text('address')->nullable(); // Юридический адрес
            $table->string('phone')->nullable(); // Телефон
            $table->string('whatsapp')->nullable(); // WhatsApp
            $table->string('email')->nullable(); // Email
            $table->string('supervisor')->nullable(); // Руководитель
            $table->string('contact_person')->nullable(); // Контактное лицо
            $table->boolean('carrier_type')->default(false); // Международный перевозчик
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('counterparties');
    }
};
