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
            $table->boolean('is_guest')->default(false)->after('status_id')->comment('Гостевой пропуск');
            $table->string('guest_name', 255)->nullable()->after('is_guest')->comment('ФИО гостя');
            $table->string('guest_company', 255)->nullable()->after('guest_name')->comment('Компания гостя');
            $table->string('guest_destination', 255)->nullable()->after('guest_company')->comment('К кому/куда направляется');
            $table->string('guest_purpose', 500)->nullable()->after('guest_destination')->comment('Цель визита');
            $table->string('guest_phone', 50)->nullable()->after('guest_purpose')->comment('Телефон гостя');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('entry_permits', function (Blueprint $table) {
            $table->dropColumn([
                'is_guest',
                'guest_name',
                'guest_company',
                'guest_destination',
                'guest_purpose',
                'guest_phone'
            ]);
        });
    }
};
