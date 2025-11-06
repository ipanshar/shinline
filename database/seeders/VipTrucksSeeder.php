<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use App\Models\TruckBrand;
use App\Models\TruckModel;
use App\Models\TruckCategory;

class VipTrucksSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Создаем бренды если их нет
        $brands = [
            'Toyota' => TruckBrand::firstOrCreate(['name' => 'Toyota']),
            'Lexus' => TruckBrand::firstOrCreate(['name' => 'Lexus']),
            'Hyundai' => TruckBrand::firstOrCreate(['name' => 'Hyundai']),
            'BYD' => TruckBrand::firstOrCreate(['name' => 'BYD']),
        ];

        // Создаем категорию SUV если её нет
        $suvCategory = TruckCategory::firstOrCreate(
            ['name' => 'SUV'],
            ['ru_name' => 'Внедорожник']
        );
        $sedanCategory = TruckCategory::firstOrCreate(
            ['name' => 'Sedan'],
            ['ru_name' => 'Седан']
        );

        // Создаем модели
        $models = [
            'LC' => TruckModel::firstOrCreate([
                'name' => 'Land Cruiser',
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id
            ]),
            'LC200' => TruckModel::firstOrCreate([
                'name' => 'Land Cruiser 200',
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id
            ]),
            'LC100' => TruckModel::firstOrCreate([
                'name' => 'Land Cruiser 100',
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id
            ]),
            'SEQUOIA' => TruckModel::firstOrCreate([
                'name' => 'SEQUOIA',
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id
            ]),
            '4Runner' => TruckModel::firstOrCreate([
                'name' => '4Runner',
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id
            ]),
            'Corolla' => TruckModel::firstOrCreate([
                'name' => 'Corolla',
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $sedanCategory->id
            ]),
            'LX600' => TruckModel::firstOrCreate([
                'name' => 'LX 600',
                'truck_brand_id' => $brands['Lexus']->id,
                'truck_category_id' => $suvCategory->id
            ]),
            'Creta' => TruckModel::firstOrCreate([
                'name' => 'Creta',
                'truck_brand_id' => $brands['Hyundai']->id,
                'truck_category_id' => $suvCategory->id
            ]),
            'Elantra' => TruckModel::firstOrCreate([
                'name' => 'Elantra',
                'truck_brand_id' => $brands['Hyundai']->id,
                'truck_category_id' => $sedanCategory->id
            ]),
            'Santafe' => TruckModel::firstOrCreate([
                'name' => 'Santa Fe',
                'truck_brand_id' => $brands['Hyundai']->id,
                'truck_category_id' => $suvCategory->id
            ]),
            'BYD' => TruckModel::firstOrCreate([
                'name' => 'BYD',
                'truck_brand_id' => $brands['BYD']->id,
                'truck_category_id' => $sedanCategory->id
            ]),
        ];

        // Добавляем машины из таблицы
        $trucks = [
            // VIP машины (золотистые) - vip_level = 1
            [
                'plate_number' => '770 YA 05',
                'truck_model_id' => $models['LC']->id,
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id,
                'own' => 'личный',
                'vip_level' => 1,
                'name' => 'Toyota LC - Шин Адриан'
            ],
            [
                'plate_number' => '005 HN 01',
                'truck_model_id' => $models['SEQUOIA']->id,
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id,
                'own' => 'личный',
                'vip_level' => 1,
                'name' => 'Toyota SEQUOIA - Шин Наталья Аркадьевна'
            ],
            [
                'plate_number' => '777 SL05',
                'truck_model_id' => $models['LX600']->id,
                'truck_brand_id' => $brands['Lexus']->id,
                'truck_category_id' => $suvCategory->id,
                'own' => 'личный',
                'vip_level' => 1,
                'name' => 'Lexus LX 600 - Шин Андрей Антонович'
            ],
            [
                'plate_number' => '747 AHK 02',
                'truck_model_id' => $models['Creta']->id,
                'truck_brand_id' => $brands['Hyundai']->id,
                'truck_category_id' => $suvCategory->id,
                'own' => 'личный',
                'vip_level' => 1,
                'name' => 'Hyundai Creta - Шин Алина Андреевна'
            ],

            // Начальники (серебристые) - vip_level = 2
            [
                'plate_number' => '076 ZB 05',
                'truck_model_id' => $models['Elantra']->id,
                'truck_brand_id' => $brands['Hyundai']->id,
                'truck_category_id' => $sedanCategory->id,
                'own' => 'личный',
                'vip_level' => 2,
                'name' => 'Hyundai Elantra - Ярковой Андрей'
            ],
            [
                'plate_number' => '817 OOA 02',
                'truck_model_id' => $models['Santafe']->id,
                'truck_brand_id' => $brands['Hyundai']->id,
                'truck_category_id' => $suvCategory->id,
                'own' => 'личный',
                'vip_level' => 2,
                'name' => 'Hyundai Santa Fe - Еременко Оксана'
            ],
            [
                'plate_number' => '001 VKR 01',
                'truck_model_id' => $models['LC']->id,
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id,
                'own' => 'личный',
                'vip_level' => 2,
                'name' => 'Toyota LC - Ким Владимир'
            ],
            [
                'plate_number' => 'A 450 FO',
                'truck_model_id' => $models['LC200']->id,
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id,
                'own' => 'служебный',
                'vip_level' => 2,
                'name' => 'Toyota Land Cruiser 200 - Шин Вероника'
            ],
            [
                'plate_number' => 'A 874 FR',
                'truck_model_id' => $models['LC100']->id,
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id,
                'own' => 'служебный',
                'vip_level' => 2,
                'name' => 'Toyota Land Cruiser 100 - Тен Оксана'
            ],
            [
                'plate_number' => '434 ZJA 02',
                'truck_model_id' => $models['4Runner']->id,
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id,
                'own' => 'служебный',
                'vip_level' => 2,
                'name' => 'Toyota 4Runner - Ким Валерий'
            ],
            [
                'plate_number' => 'A 414 VKO',
                'truck_model_id' => $models['Corolla']->id,
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $sedanCategory->id,
                'own' => 'служебный',
                'vip_level' => 2,
                'name' => 'Toyota Corolla - Ким Валерий'
            ],
            [
                'plate_number' => '759 AKB 02',
                'truck_model_id' => $models['LC']->id,
                'truck_brand_id' => $brands['Toyota']->id,
                'truck_category_id' => $suvCategory->id,
                'own' => 'служебный',
                'vip_level' => 2,
                'name' => 'Toyota LC - Шульга Роман'
            ],
            [
                'plate_number' => '100 SRS 02',
                'truck_model_id' => $models['BYD']->id,
                'truck_brand_id' => $brands['BYD']->id,
                'truck_category_id' => $sedanCategory->id,
                'own' => 'служебный',
                'vip_level' => 2,
                'name' => 'BYD - Шульга Роман'
            ],
        ];

        foreach ($trucks as $truck) {
            DB::table('trucks')->updateOrInsert(
                ['plate_number' => $truck['plate_number']],
                array_merge($truck, [
                    'created_at' => now(),
                    'updated_at' => now(),
                ])
            );
        }

        $this->command->info('✅ VIP машины успешно добавлены!');
        $this->command->info('🟡 VIP (золотистые): 4 машины');
        $this->command->info('⚪ Начальники (серебристые): 9 машин');
    }
}
