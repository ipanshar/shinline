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
        Schema::create('сounterparties', function (Blueprint $table) {
            $table->id();
            $table->string('name')->comment('Название контрагента');
            $table->string('inn')->unique()->comment('ИНН контрагента');
            $table->string('address')->nullable()->comment('Адрес контрагента');
            $table->string('phone')->nullable()->comment('Телефон контрагента');
            $table->string('whatsapp')->nullable()->comment('WhatsApp контрагента');
            $table->string('email')->nullable()->comment('Email контрагента');
            $table->string('supervisor')->nullable()->comment('ФИО руководителя контрагента');
            $table->string('contact_person')->nullable()->comment('ФИО контактного лица контрагента');
            $table->boolean('carrier_type')->nullable()->comment('Является ли контрагент международным перевозчиком');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('сounterparties');
    }
};
