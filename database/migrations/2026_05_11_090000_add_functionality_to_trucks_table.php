<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('trucks', 'functionality')) {
            Schema::table('trucks', function (Blueprint $table) {
                $table->text('functionality')->nullable()->after('description');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('trucks', 'functionality')) {
            Schema::table('trucks', function (Blueprint $table) {
                $table->dropColumn('functionality');
            });
        }
    }
};

