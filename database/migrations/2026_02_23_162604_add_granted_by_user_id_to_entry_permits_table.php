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
        Schema::table('entry_permits', function (Blueprint $table) {
            // Кто выдал разрешение (null если из 1С или автоматически)
            $table->integer('granted_by_user_id')->nullable()->after('user_id');
            // Комментарий к разрешению
            $table->text('comment')->nullable()->after('end_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('entry_permits', function (Blueprint $table) {
            $table->dropColumn(['granted_by_user_id', 'comment']);
        });
    }
};
