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
        Schema::create('trucks', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            $table->integer('user_id');
            $table->string('plate_number');
            $table->string('vin')->nullable();
            $table->integer('truck_brand_id')->nullable();
            $table->integer('truck_model_id')->nullable();
            $table->string('color')->nullable();
            $table->integer('trailer_model_id')->nullable();
            $table->integer('trailer_type_id')->nullable();
            $table->string('trailer_number')->nullable();
            $table->double('trailer_height')->nullable();  
            $table->double('trailer_width')->nullable();
            $table->double('trailer_length')->nullable();
            $table->double('trailer_load_capacity')->nullable();
            $table->integer('truck_category_id')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('trucks');
    }
};
