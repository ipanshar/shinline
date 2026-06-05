<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('greenlog_locations', function (Blueprint $table) {
            $table->id();
            $table->string('company_key')->nullable()->index();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('building')->nullable()->index();
            $table->string('floor')->nullable()->index();
            $table->string('room')->nullable()->index();
            $table->string('factory_zone')->nullable()->index();
            $table->string('sector')->nullable()->index();
            $table->text('description')->nullable();
            $table->foreignId('parent_id')->nullable()->constrained('greenlog_locations')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('greenlog_locations');
    }
};
