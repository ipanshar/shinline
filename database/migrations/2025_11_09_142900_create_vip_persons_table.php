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
        Schema::create('vip_persons', function (Blueprint $table) {
            $table->id();
            $table->string('full_name'); // ФИО
            $table->string('position')->nullable(); // Должность
            $table->string('plate_number')->nullable(); // Номер машины
            $table->integer('vip_level')->default(0)->comment('0=обычный, 1=VIP золотой, 2=руководство серебристый, 3=зд обход зеленый');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vip_persons');
    }
};
