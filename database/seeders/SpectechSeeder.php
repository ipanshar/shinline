<?php

namespace Database\Seeders;

use App\Models\Truck;
use App\Models\TruckCategory;
use Illuminate\Database\Seeder;

class SpectechSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Создаём (или находим) категорию «Спец техника»
        $category = TruckCategory::firstOrCreate(
            ['name' => 'Спец техника'],
            ['ru_name' => 'Спец техника']
        );

        $catId = $category->id;

        $autocraneFunctionality = implode("\n", [
            'Строительство: монтаж металлических конструкций, подъём строительных материалов и оборудования на высоту.',
            'Монтаж инженерных систем: подъём сложного оборудования, труб и конструкций для инженерных сетей.',
            'Погрузочно-разгрузочные работы: работа с крупногабаритными грузами на складах и в логистических центрах.',
            'Услуги ЖКХ: замена фонарных столбов, установка и демонтаж конструкций в городской среде.',
            'Промышленное строительство и монтаж: установка и демонтаж крупногабаритного оборудования, промышленных прессов, станков и производственных линий.',
            'Инфраструктурные проекты: транспортировка и монтаж тяжёлых конструктивных элементов при строительстве мостов, путепроводов и дорожных развязок.',
            'Энергетический сектор: установка и обслуживание трансформаторов, генераторов и ветровых турбин.',
            'Спасательные операции: подъём обрушившихся конструкций, эвакуация автомобилей и ликвидация последствий аварий.',
        ]);

        $bobcatFunctionality = implode("\n", [
            'Снятие растительного слоя и корчевание пней.',
            'Подготовка траншей глубиной до 2,4 м и шириной до 35 см.',
            'Обратная засыпка траншей и котлованов.',
            'Разгрузка и подвоз строительных материалов.',
            'Разбивка асфальта и замёрзшей почвы гидромолотом.',
        ]);

        $shacmanFunctionality = implode("\n", [
            'Строительство дорог, тоннелей, мостов, стадионов, гидроэлектростанций и высотных зданий.',
            'Перевозка сыпучих и упакованных грузов: щебня, песка, грунта, керамзита, цемента, битого кирпича.',
            'Коммунальное хозяйство: вывоз снега, мусора и спиленных деревьев.',
            'Коммерческие и бытовые грузоперевозки.',
            'Сельское хозяйство: транспортировка урожая, кормов, удобрений и перегноя.',
        ]);

        $manipulatorFunctionality = implode("\n", [
            'Погрузка и разгрузка грузовых автомобилей, маломерных судов и железнодорожных вагонов.',
            'Транспортировка инвентаря, оборудования, материалов и инструментов.',
            'Монтаж, демонтаж и перевозка оборудования (станков, трансформаторов, котлов, мини-электростанций) и металлоконструкций.',
            'Эвакуация автомобилей и спецтехники, включая неисправную технику.',
            'Установка столбов, заборов, ограждений и посадка деревьев.',
        ]);

        // 2. Семь единиц спецтехники
        $trucks = [
            [
                'name'        => 'Автокран 25т',
                'plate_number'=> '282FD02',
                'own'         => 'аренда',
                'description' => 'Максимальная грузоподъёмность — 25 тонн при минимальном вылете стрелы. 5-секционная телескопическая стрела длиной от 10.4 до 39.2 м, с гуськом 8.3 м (общая длина до 47.8 м).',
                'functionality' => $autocraneFunctionality,
                'image_url'   => '/equipment/image1.jpg',
            ],
            [
                'name'        => 'Мини-погрузчик Bobcat (ковш 3 м)',
                'plate_number'=> null,
                'own'         => 'собственный',
                'description' => 'Многофункциональная машина для погрузочно-разгрузочных, землеройных, строительных, уборочных и других работ.',
                'functionality' => $bobcatFunctionality,
                'image_url'   => '/equipment/image2.jpg',
            ],
            [
                'name'        => 'Самосвал Shacman',
                'plate_number'=> '932BC05',
                'own'         => 'собственный',
                'description' => 'Самосвал для перевозки объёмных и тяжёлых грузов в строительстве и логистике.',
                'functionality' => $shacmanFunctionality,
                'image_url'   => '/equipment/image3.jpg',
            ],
            [
                'name'        => 'Кран-манипулятор',
                'plate_number'=> '835BF05',
                'own'         => 'собственный',
                'description' => 'Используется в логистике, строительстве, коммунальном хозяйстве и энергетике для погрузки/перевозки грузов.',
                'functionality' => $manipulatorFunctionality,
                'image_url'   => '/equipment/image4.jpg',
            ],
            [
                'name'        => 'Кран-манипулятор',
                'plate_number'=> '236BG05',
                'own'         => 'собственный',
                'description' => 'Универсальная спецтехника для монтажных и транспортных задач на объектах разного типа.',
                'functionality' => $manipulatorFunctionality,
                'image_url'   => '/equipment/image5.jpg',
            ],
            [
                'name'        => 'Автокран 25т',
                'plate_number'=> '646EF02',
                'own'         => 'аренда',
                'description' => 'Максимальная грузоподъёмность — 25 тонн при минимальном вылете стрелы. 5-секционная телескопическая стрела длиной от 10.4 до 39.2 м, с гуськом 8.3 м (общая длина до 47.8 м).',
                'functionality' => $autocraneFunctionality,
                'image_url'   => '/equipment/image6.jpg',
            ],
            [
                'name'        => 'Мини-погрузчик Bobcat (ковш 3 м)',
                'plate_number'=> null,
                'own'         => 'собственный',
                'description' => 'Многофункциональная машина для погрузочно-разгрузочных, землеройных, строительных, уборочных и других работ.',
                'functionality' => $bobcatFunctionality,
                'image_url'   => '/equipment/image7.jpg',
            ],
        ];

        $updated  = 0;
        $created  = 0;

        foreach ($trucks as $data) {
            $spetchFields = [
                'truck_category_id' => $catId,
                'name'              => $data['name'],
                'own'               => $data['own'],
                'description'       => $data['description'],
                'functionality'     => $data['functionality'] ?? null,
                'image_url'         => $data['image_url'],
            ];

            if ($data['plate_number'] !== null) {
                // Нормализуем номер так же, как модель
                $normalized = mb_strtoupper(str_replace([' ', '-'], '', $data['plate_number']));

                $truck = Truck::whereRaw(
                    "REPLACE(REPLACE(UPPER(COALESCE(plate_number,'')), ' ', ''), '-', '') = ?",
                    [$normalized]
                )->first();

                if ($truck) {
                    // Обновляем категорию и поля спецтехники у существующей записи
                    $truck->update($spetchFields);
                    $updated++;
                } else {
                    Truck::create(array_merge($spetchFields, ['plate_number' => $data['plate_number']]));
                    $created++;
                }
            } else {
                // Без номера — ищем по имени + категории + image_url (уникальный идентификатор)
                $truck = Truck::where('name', $data['name'])
                    ->where('truck_category_id', $catId)
                    ->where('image_url', $data['image_url'])
                    ->first();

                if ($truck) {
                    $truck->update($spetchFields);
                    $updated++;
                } else {
                    Truck::create(array_merge($spetchFields, ['plate_number' => null]));
                    $created++;
                }
            }
        }

        $this->command->info("SpectechSeeder: создано={$created}, обновлено={$updated}.");
    }
}


