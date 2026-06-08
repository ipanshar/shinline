<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('greenlog_plants', function (Blueprint $table) {
            $table->string('branch')->nullable()->after('cost_source');
            $table->string('office')->nullable()->after('branch');
            $table->string('room')->nullable()->after('office');
            $table->string('responsible_person')->nullable()->after('room');
            $table->text('condition_notes')->nullable()->after('responsible_person');
            $table->date('acquisition_date')->nullable()->after('condition_notes');
            $table->date('last_inventory_date')->nullable()->after('acquisition_date');
        });
    }

    public function down(): void
    {
        Schema::table('greenlog_plants', function (Blueprint $table) {
            $table->dropColumn([
                'branch',
                'office',
                'room',
                'responsible_person',
                'condition_notes',
                'acquisition_date',
                'last_inventory_date',
            ]);
        });
    }
};
