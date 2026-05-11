<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Исправляет image_url для единиц спецтехники:
 * заменяет временные заглушки (image1.jpg … image7.jpg)
 * на реальные файлы из /public/equipment/.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Техника с гос. номером — ищем по plate_number
        $byPlate = [
            '282FD02' => '/equipment/autocrane-25t-282fd02.jpg',
            '646EF02' => '/equipment/autocrane-25t-646ef02.jpg',
            '932BC05' => '/equipment/shacman-dump-truck-932bc05.jpg',
            '835BF05' => '/equipment/manipulator-crane-835bf05.jpg',
            '236BG05' => '/equipment/manipulator-crane-236bg05.jpg',
        ];

        foreach ($byPlate as $plate => $url) {
            DB::table('trucks')
                ->whereRaw(
                    "REPLACE(REPLACE(UPPER(COALESCE(plate_number,'')), ' ', ''), '-', '') = ?",
                    [mb_strtoupper(str_replace([' ', '-'], '', $plate))]
                )
                ->update(['image_url' => $url]);
        }

        // Мини-погрузчики Bobcat без номера — обновляем по порядку (id ASC)
        $bobcatPhotos = [
            '/equipment/bobcat-mini-loader-no-number-1.jpg',
            '/equipment/bobcat-mini-loader-no-number-2.jpg',
        ];

        $bobcats = DB::table('trucks')
            ->where('name', 'Мини-погрузчик Bobcat (ковш 3 м)')
            ->whereNull('plate_number')
            ->orderBy('id')
            ->pluck('id');

        foreach ($bobcats as $i => $id) {
            if (isset($bobcatPhotos[$i])) {
                DB::table('trucks')->where('id', $id)->update(['image_url' => $bobcatPhotos[$i]]);
            }
        }
    }

    public function down(): void
    {
        // Возврат к заглушкам (нежелательно, но возможно)
        $byPlate = [
            '282FD02' => '/equipment/image1.jpg',
            '932BC05' => '/equipment/image3.jpg',
            '835BF05' => '/equipment/image4.jpg',
            '236BG05' => '/equipment/image5.jpg',
            '646EF02' => '/equipment/image6.jpg',
        ];

        foreach ($byPlate as $plate => $url) {
            DB::table('trucks')
                ->whereRaw(
                    "REPLACE(REPLACE(UPPER(COALESCE(plate_number,'')), ' ', ''), '-', '') = ?",
                    [mb_strtoupper(str_replace([' ', '-'], '', $plate))]
                )
                ->update(['image_url' => $url]);
        }

        $bobcats = DB::table('trucks')
            ->where('name', 'Мини-погрузчик Bobcat (ковш 3 м)')
            ->whereNull('plate_number')
            ->orderBy('id')
            ->pluck('id');

        foreach ($bobcats as $i => $id) {
            DB::table('trucks')->where('id', $id)->update(['image_url' => '/equipment/image' . ($i === 0 ? '2' : '7') . '.jpg']);
        }
    }
};
