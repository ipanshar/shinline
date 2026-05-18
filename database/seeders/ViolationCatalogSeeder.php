<?php

namespace Database\Seeders;

use App\Models\ViolationCategory;
use App\Models\ViolationType;
use Illuminate\Database\Seeder;

class ViolationCatalogSeeder extends Seeder
{
    public function run(): void
    {
        $catalog = [
            [
                'key' => 'safety',
                'name' => 'ОТиТБ',
                'description' => 'Нарушения техники безопасности и охраны труда',
                'sort_order' => 10,
                'types' => [
                    ['key' => 'no_ppe', 'name' => 'Игнорирование СИЗ', 'sort_order' => 10],
                    ['key' => 'dangerous_work_without_permit', 'name' => 'Работы повышенной опасности без наряда-допуска', 'sort_order' => 20],
                    ['key' => 'unsafe_equipment_operation', 'name' => 'Нарушение правил работы с оборудованием', 'sort_order' => 30],
                    ['key' => 'smoking_in_wrong_place', 'name' => 'Курение в неустановленном месте', 'sort_order' => 40],
                ],
            ],
            [
                'key' => 'technological',
                'name' => 'Технологические',
                'description' => 'Нарушения технологических процессов',
                'sort_order' => 20,
                'types' => [
                    ['key' => 'tech_card_deviation', 'name' => 'Отклонение от техкарт', 'sort_order' => 10],
                    ['key' => 'missed_maintenance', 'name' => 'Несвоевременное обслуживание', 'sort_order' => 20],
                    ['key' => 'defect_concealment', 'name' => 'Сокрытие брака', 'sort_order' => 30],
                ],
            ],
            [
                'key' => 'discipline',
                'name' => 'Дисциплинарные и режимные',
                'description' => 'Нарушения внутреннего распорядка и режима',
                'sort_order' => 30,
                'types' => [
                    ['key' => 'shift_schedule_violation', 'name' => 'Нарушение графиков сменности', 'sort_order' => 10],
                    ['key' => 'unauthorized_presence', 'name' => 'Нахождение на территории в нерабочее время', 'sort_order' => 20],
                    ['key' => 'pass_transfer', 'name' => 'Передача пропуска третьим лицам', 'sort_order' => 30],
                    ['key' => 'intoxication', 'name' => 'Нахождение в состоянии опьянения', 'sort_order' => 40],
                ],
            ],
            [
                'key' => 'property',
                'name' => 'Имущественные',
                'description' => 'Хищения и нецелевое использование ресурсов',
                'sort_order' => 40,
                'types' => [
                    ['key' => 'petty_theft', 'name' => 'Мелкие хищения', 'sort_order' => 10],
                    ['key' => 'fuel_theft', 'name' => 'Хищение ГСМ', 'sort_order' => 20],
                    ['key' => 'resource_personal_use', 'name' => 'Использование ресурсов в личных целях', 'sort_order' => 30],
                ],
            ],
            [
                'key' => 'information',
                'name' => 'Информационные',
                'description' => 'Разглашение и нарушения кибербезопасности',
                'sort_order' => 50,
                'types' => [
                    ['key' => 'trade_secret_disclosure', 'name' => 'Разглашение коммерческой тайны', 'sort_order' => 10],
                    ['key' => 'cybersecurity_violation', 'name' => 'Нарушение правил кибербезопасности', 'sort_order' => 20],
                ],
            ],
        ];

        foreach ($catalog as $categoryData) {
            $category = ViolationCategory::query()->updateOrCreate(
                ['key' => $categoryData['key']],
                [
                    'name' => $categoryData['name'],
                    'description' => $categoryData['description'],
                    'sort_order' => $categoryData['sort_order'],
                    'is_active' => true,
                ]
            );

            foreach ($categoryData['types'] as $typeData) {
                ViolationType::query()->updateOrCreate(
                    ['key' => $typeData['key']],
                    [
                        'category_id' => $category->id,
                        'name' => $typeData['name'],
                        'description' => $typeData['name'],
                        'sort_order' => $typeData['sort_order'],
                        'is_active' => true,
                    ]
                );
            }
        }
    }
}