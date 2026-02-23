<?php

namespace Database\Seeders;

use App\Models\Visitor;
use App\Models\Truck;
use App\Models\Yard;
use App\Models\Status;
use App\Models\Task;
use App\Models\EntryPermit;
use Illuminate\Database\Seeder;

/**
 * Сидер для тестирования системы подтверждения посетителей от камер DSS
 * 
 * Запуск: php artisan db:seed --class=TestPendingVisitorsSeeder
 */
class TestPendingVisitorsSeeder extends Seeder
{
    public function run(): void
    {
        // Получаем первый двор или создаём тестовый
        $yard = Yard::first();
        if (!$yard) {
            $yard = Yard::create(['name' => 'Тестовый двор']);
        }

        // Получаем статус "на территории"
        $statusOnTerritory = Status::where('key', 'on_territory')->first();
        if (!$statusOnTerritory) {
            $statusOnTerritory = Status::create([
                'name' => 'На территории',
                'key' => 'on_territory',
            ]);
        }

        // Тестовые номера - симуляция ошибок OCR камеры
        $testCases = [
            // Случай 1: Номер распознан с ошибкой (O вместо 0)
            [
                'plate_number' => 'A1O1BC77',  // Камера распознала O вместо 0
                'original_plate_number' => 'A1O1BC77',
                'recognition_confidence' => 65,
                'comment' => 'OCR ошибка: O вместо 0, правильный номер A101BC77',
            ],
            // Случай 2: Частичное распознавание
            [
                'plate_number' => 'B22_KK01',  // Камера не распознала один символ
                'original_plate_number' => 'B22_KK01',
                'recognition_confidence' => 45,
                'comment' => 'Частичное распознавание, символ не распознан',
            ],
            // Случай 3: Номер с 1 вместо I
            [
                'plate_number' => 'C333D177',  // 1 вместо I
                'original_plate_number' => 'C333D177',
                'recognition_confidence' => 72,
                'comment' => 'OCR ошибка: возможно 1 вместо I',
            ],
            // Случай 4: Казахстанский номер
            [
                'plate_number' => '123ABC01',
                'original_plate_number' => '123ABC01',
                'recognition_confidence' => 88,
                'comment' => 'Номер не найден в базе (новое ТС)',
            ],
            // Случай 5: Номер с низкой уверенностью
            [
                'plate_number' => 'X555YZ99',
                'original_plate_number' => 'X555YZ99',
                'recognition_confidence' => 35,
                'comment' => 'Очень низкая уверенность распознавания',
            ],
            // Случай 6: Номер похож на существующий
            [
                'plate_number' => 'E777EE77',  // Может быть похож на реальный
                'original_plate_number' => 'E777EE77',
                'recognition_confidence' => 78,
                'comment' => 'Проверить похожие номера в базе',
            ],
        ];

        $this->command->info('Создание тестовых посетителей в ожидании подтверждения...');

        foreach ($testCases as $index => $testCase) {
            $visitor = Visitor::create([
                'plate_number' => $testCase['plate_number'],
                'original_plate_number' => $testCase['original_plate_number'],
                'yard_id' => $yard->id,
                'entry_date' => now()->subMinutes(rand(1, 30)),
                'status_id' => $statusOnTerritory->id,
                'confirmation_status' => Visitor::CONFIRMATION_PENDING,
                'recognition_confidence' => $testCase['recognition_confidence'],
                'name' => $testCase['comment'],
            ]);

            $this->command->info(
                "  [{$index}] {$testCase['plate_number']} - уверенность {$testCase['recognition_confidence']}%"
            );
        }

        // Также создадим пару "правильных" грузовиков для тестирования поиска похожих
        $this->command->info('');
        $this->command->info('Создание тестовых грузовиков для поиска похожих...');

        $testTrucks = [
            ['plate_number' => 'A101BC77', 'comment' => 'Правильный номер для A1O1BC77'],
            ['plate_number' => 'B222KK01', 'comment' => 'Правильный номер для B22_KK01'],
            ['plate_number' => 'C333DI77', 'comment' => 'Правильный номер для C333D177'],
            ['plate_number' => 'E777EE78', 'comment' => 'Похожий номер на E777EE77'],
        ];

        foreach ($testTrucks as $truckData) {
            $existing = Truck::where('plate_number', $truckData['plate_number'])->first();
            if (!$existing) {
                Truck::create([
                    'plate_number' => $truckData['plate_number'],
                ]);
                $this->command->info("  + {$truckData['plate_number']} ({$truckData['comment']})");
            } else {
                $this->command->info("  = {$truckData['plate_number']} уже существует");
            }
        }

        // Создадим тестовую задачу для одного из грузовиков
        $this->command->info('');
        $this->command->info('Создание тестовой задачи с разрешением...');

        $truck = Truck::where('plate_number', 'A101BC77')->first();
        if ($truck) {
            $statusNew = Status::where('key', 'new')->first();
            if (!$statusNew) {
                $statusNew = Status::create(['name' => 'Новый', 'key' => 'new']);
            }
            
            $statusActive = Status::where('key', 'active')->first();
            if (!$statusActive) {
                $statusActive = Status::create(['name' => 'Активный', 'key' => 'active']);
            }

            // Создаём задачу
            $task = Task::create([
                'name' => 'Тестовая доставка',
                'description' => 'Тестовая задача для проверки подтверждения',
                'truck_id' => $truck->id,
                'status_id' => $statusNew->id,
                'plan_date' => now(),
                'yard_id' => $yard->id,
                'avtor' => 'TestSeeder',
            ]);

            // Создаём разрешение
            EntryPermit::create([
                'truck_id' => $truck->id,
                'task_id' => $task->id,
                'yard_id' => $yard->id,
                'status_id' => $statusActive->id,
                'begin_date' => now()->subDay(),
                'end_date' => now()->addDays(7),
            ]);

            $this->command->info("  + Задача '{$task->name}' для {$truck->plate_number}");
            $this->command->info("  + Разрешение на въезд создано");
        }

        $this->command->info('');
        $this->command->info('✅ Готово! Теперь откройте страницу КПП и выберите двор.');
        $this->command->info("   Двор: {$yard->name} (ID: {$yard->id})");
        $this->command->info('   Вы увидите блок "Ожидают подтверждения" с тестовыми записями.');
    }
}
