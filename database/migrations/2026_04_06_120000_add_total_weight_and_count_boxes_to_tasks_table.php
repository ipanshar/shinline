<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->decimal('total_weight', 10, 2)->nullable()->after('reward');
            $table->unsignedInteger('count_boxes')->nullable()->after('total_weight');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn(['total_weight', 'count_boxes']);
        });
    }
};