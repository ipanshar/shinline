<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('entry_permits', function (Blueprint $table) {
            $table->boolean('exit_permit_required')->default(false)->after('weighing_required');
        });
    }

    public function down(): void
    {
        Schema::table('entry_permits', function (Blueprint $table) {
            $table->dropColumn('exit_permit_required');
        });
    }
};