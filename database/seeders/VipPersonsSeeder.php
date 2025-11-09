<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class VipPersonsSeeder extends Seeder
{
    /**
     * Добавляет VIP персон из таблицы
     */
    public function run(): void
    {
        $vipPersons = [
            // Головной офис - VIP (золотые)
            ['full_name' => 'Шин Адриан', 'position' => 'Консультант направления Кондитерские изделия', 'plate_number' => '770YA05', 'vip_level' => 1],
            ['full_name' => 'Шин Андрей', 'position' => 'Консультант направления Кондитерские изделия', 'plate_number' => '747AHK02', 'vip_level' => 1],
            ['full_name' => 'Шин Алевина', 'position' => 'Консультант направления Fresh Food', 'plate_number' => '005HN01', 'vip_level' => 1],
            ['full_name' => 'Шин Наталья Аркадьевна', 'position' => 'Вице-президент', 'plate_number' => '777SL05', 'vip_level' => 1],
            
            // Головной офис - Руководство (серебристые)
            ['full_name' => 'Яркова Андрей', 'position' => 'Директор по юридическим вопросам', 'plate_number' => '076ZB05', 'vip_level' => 2],
            ['full_name' => 'Еременко Оксана', 'position' => 'HR директор', 'plate_number' => '817OOA02', 'vip_level' => 2],
            ['full_name' => 'Ким Владимир', 'position' => 'Директор транспортной логистики', 'plate_number' => '001VKR01', 'vip_level' => 2],
            ['full_name' => 'Доценко Константин', 'position' => 'Директор по маркетингу', 'plate_number' => '117ZB05', 'vip_level' => 2],
            ['full_name' => 'Сабиржанов Дамир', 'position' => 'Категорийный директор по маркетингу', 'plate_number' => '558SZA02', 'vip_level' => 2],
            ['full_name' => 'Шин Вероника', 'position' => 'Директор категории ЛБТ', 'plate_number' => 'A450FO', 'vip_level' => 2],
            ['full_name' => 'Тен Оксана', 'position' => 'Директор категории ЗПФ', 'plate_number' => 'A874FR', 'vip_level' => 2],
            ['full_name' => 'Ни Инна Хан Соновна', 'position' => 'Директор дивизиона (Казахстан)', 'plate_number' => '434ZJA02', 'vip_level' => 2],
            ['full_name' => 'Ни Наталья Вадимовна', 'position' => 'Директор по продажам Казахстан', 'plate_number' => '339HGA02', 'vip_level' => 2],
            ['full_name' => 'Супруненко Сергей', 'position' => 'Коммерческий директор', 'plate_number' => '678EXA02', 'vip_level' => 2],
            ['full_name' => 'Яхнова Наталья Валерьевна', 'position' => 'Председатель правления', 'plate_number' => '076ZB05', 'vip_level' => 2],
            ['full_name' => 'Ким Валерий Романович', 'position' => 'Директор дивизиона (Киргизия и Узбекистан), Продукт Трейд', 'plate_number' => '434ZJA02', 'vip_level' => 2],
            
            // ПК-1, 7 блок - VIP (золотые)
            ['full_name' => 'Шин Андрей Антонович', 'position' => 'Президент', 'plate_number' => '777SL05', 'vip_level' => 1],
            ['full_name' => 'Шин Алина Андреевна', 'position' => 'Директор СU', 'plate_number' => '747AHK02', 'vip_level' => 1],
            
            // ПК-1, 7 блок - Руководство (серебристые)
            ['full_name' => 'Фоминых Александр', 'position' => 'Технический директор', 'plate_number' => '210WVZ05', 'vip_level' => 2],
            ['full_name' => 'Ли Сергей Адольфович', 'position' => 'Член наблюдательного совета', 'plate_number' => 'A450FO', 'vip_level' => 2],
            ['full_name' => 'Цай Игорь Робертович', 'position' => 'Член наблюдательного совета', 'plate_number' => 'A874FR', 'vip_level' => 2],
            ['full_name' => 'Шульга Роман Сергеевич', 'position' => 'Индустриальный директор', 'plate_number' => '759AKB02', 'vip_level' => 2],
            ['full_name' => 'Самодуров Дмитрий', 'position' => 'Индустриальный директор', 'plate_number' => '369XLA02', 'vip_level' => 2],
            ['full_name' => 'Сарсекеев Аскар', 'position' => 'Технический директор', 'plate_number' => '248JLA02', 'vip_level' => 2],
            ['full_name' => 'Мистер О', 'position' => 'Директор по стратегическому развитию', 'plate_number' => 'нету', 'vip_level' => 2],
            ['full_name' => 'Ким Александр Славикович', 'position' => 'Директор АСК', 'plate_number' => '224AHP02', 'vip_level' => 2],
            ['full_name' => 'Докин Дмитрий Борисович', 'position' => 'Председатель совета директоров', 'plate_number' => '100SRS02', 'vip_level' => 2],
            ['full_name' => 'Пак Николай', 'position' => 'Директор производства', 'plate_number' => 'P040402', 'vip_level' => 2],
            ['full_name' => 'Нурумбетова Асел Халмуратовна', 'position' => 'Директор роботизированного склада', 'plate_number' => '043AAX01', 'vip_level' => 2],
        ];

        foreach ($vipPersons as $person) {
            DB::table('vip_persons')->insert(array_merge($person, [
                'created_at' => now(),
                'updated_at' => now(),
            ]));
        }

        $this->command->info('✅ VIP персоны добавлены: ' . count($vipPersons));
    }
}
