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
        Schema::create('vehicle_captures', function (Blueprint $table) {
            $table->id();
             $table->integer('devaice_id');
             $table->integer('truck_id');
             $table->string('plateNo');
             $table->string('capturePicture');
             $table->string('plateNoPicture');
             $table->string('vehicleBrandName'); 
             $table->string('captureTime'); 
             $table->string('vehicleColorName');
             $table->string('vehicleModelName');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vehicle_captures');
    }
};
