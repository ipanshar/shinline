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
        Schema::table('users', function (Blueprint $table) {
            // Adding a new column 'login' to the users table
            $table->string('login')->after('name')->uniqidue();
            $table->string('email')->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Dropping the 'login' column from the users table
            $table->dropColumn('login');
            $table->string('email')->nullable(false)->change();
        // Reverting the 'email' column to be non-nullable
        });
    }
};
