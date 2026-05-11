<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trucks', function (Blueprint $table) {
            // Сделать plate_number nullable (спецтехника без номера)
            $table->string('plate_number')->nullable()->change();

            // Описание и картинка для справочника спецтехники
            $table->text('description')->nullable()->after('name');
            $table->string('image_url')->nullable()->after('description');

            // ANPR-поля (заполняются автоматически из видеонаблюдения)
            $table->boolean('anpr_source')->default(false)->after('image_url');
            $table->timestamp('last_seen_at')->nullable()->after('anpr_source');
            $table->string('last_seen_gate')->nullable()->after('last_seen_at');
            $table->float('anpr_confidence')->nullable()->after('last_seen_gate');
            $table->float('plate_score')->nullable()->after('anpr_confidence');
        });
    }

    public function down(): void
    {
        Schema::table('trucks', function (Blueprint $table) {
            $table->string('plate_number')->nullable(false)->change();
            $table->dropColumn([
                'description',
                'image_url',
                'anpr_source',
                'last_seen_at',
                'last_seen_gate',
                'anpr_confidence',
                'plate_score',
            ]);
        });
    }
};

