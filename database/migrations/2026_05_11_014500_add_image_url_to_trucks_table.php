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
        Schema::table('trucks', function (Blueprint $table) {
            if (!Schema::hasColumn('trucks', 'image_url')) {
                $table->string('image_url', 500)->nullable()->after('own');
            }
            if (!Schema::hasColumn('trucks', 'description')) {
                $table->text('description')->nullable()->after('image_url');
            }
            if (!Schema::hasColumn('trucks', 'functionality')) {
                $table->text('functionality')->nullable()->after('description');
            }
            if (!Schema::hasColumn('trucks', 'anpr_source')) {
                $table->boolean('anpr_source')->default(false)->after('functionality');
            }
            if (!Schema::hasColumn('trucks', 'last_seen_gate')) {
                $table->string('last_seen_gate', 100)->nullable()->after('anpr_source');
            }
            if (!Schema::hasColumn('trucks', 'last_seen_at')) {
                $table->timestamp('last_seen_at')->nullable()->after('last_seen_gate');
            }
            if (!Schema::hasColumn('trucks', 'anpr_confidence')) {
                $table->float('anpr_confidence')->nullable()->after('last_seen_at');
            }
            if (!Schema::hasColumn('trucks', 'plate_score')) {
                $table->float('plate_score')->nullable()->after('anpr_confidence');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('trucks', function (Blueprint $table) {
            $table->dropColumnIfExists('image_url');
            $table->dropColumnIfExists('description');
            $table->dropColumnIfExists('functionality');
            $table->dropColumnIfExists('anpr_source');
            $table->dropColumnIfExists('last_seen_gate');
            $table->dropColumnIfExists('last_seen_at');
            $table->dropColumnIfExists('anpr_confidence');
            $table->dropColumnIfExists('plate_score');
        });
    }
};
