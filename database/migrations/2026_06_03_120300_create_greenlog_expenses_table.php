<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('greenlog_expenses', function (Blueprint $table) {
            $table->id();
            $table->string('company_key')->nullable()->index();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('plant_id')->nullable()->constrained('greenlog_plants')->nullOnDelete();
            $table->foreignId('location_id')->nullable()->constrained('greenlog_locations')->nullOnDelete();
            $table->string('category', 40)->index();
            $table->decimal('amount', 10, 2);
            $table->dateTime('expense_date')->index();
            $table->text('description');
            $table->string('document_number')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('greenlog_expenses');
    }
};
