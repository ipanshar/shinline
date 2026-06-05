<?php

namespace Database\Seeders;

use App\Models\Greenlog\Location;
use App\Models\Greenlog\Plant;
use App\Models\Greenlog\PlantSpecies;
use Illuminate\Database\Seeder;

class GreenlogPlantingStatementSeeder extends Seeder
{
    private const COMPANY_KEY = 'default';

    private const TERRITORIES = [
        'Улица',
        'T-1 Парковка, Аллея',
        'A-1,2,3 (АБК)',
        'T-2 МЦ-3 восточная сторона',
        'T-2 Клумба 1,2',
        'T-2 Клумба 3,4',
        'T-2 Северная сторона',
        'T-2 Северо-южная сторона',
        'T-3',
    ];

    private const PLANTING_ROWS = [
        [
            'territory' => 'Улица',
            'number' => 1,
            'name' => 'Туя большая "Smaragt"',
            'quantity' => 4,
        ],
    ];

    private const TERRITORY_CODES = [
        'Улица' => 'ULICA',
        'T-1 Парковка, Аллея' => 'T1-PARK',
        'A-1,2,3 (АБК)' => 'ABK',
        'T-2 МЦ-3 восточная сторона' => 'T2-MC3-EAST',
        'T-2 Клумба 1,2' => 'T2-KLUMBA12',
        'T-2 Клумба 3,4' => 'T2-KLUMBA34',
        'T-2 Северная сторона' => 'T2-NORTH',
        'T-2 Северо-южная сторона' => 'T2-NORTHSOUTH',
        'T-3' => 'T3',
    ];

    public function run(): void
    {
        $locations = [];

        foreach (self::TERRITORIES as $territory) {
            $locations[$territory] = $this->upsertLocation($territory);
        }

        foreach (self::PLANTING_ROWS as $row) {
            $species = PlantSpecies::query()->updateOrCreate(
                ['name' => $row['name']],
                [
                    'category' => $this->inferSpeciesCategory($row['name']),
                    'description' => 'Импортировано из посадочной ведомости GreenLog',
                    'is_active' => true,
                ],
            );

            $location = $locations[$row['territory']] ?? $this->upsertLocation($row['territory']);

            Plant::query()->updateOrCreate(
                [
                    'company_key' => self::COMPANY_KEY,
                    'inventory_number' => $this->buildInventoryNumber($row['territory'], (int) $row['number']),
                ],
                [
                    'created_by_user_id' => null,
                    'location_id' => $location->id,
                    'species_id' => $species->id,
                    'name' => $row['name'],
                    'biological_name' => null,
                    'category' => 'outdoor',
                    'status' => 'alive',
                    'quantity' => (int) $row['quantity'],
                    'watering_frequency_days' => null,
                    'fertilizing_frequency_days' => null,
                    'notes' => sprintf(
                        'Групповая посадка из посадочной ведомости: территория "%s", строка №%d.',
                        $row['territory'],
                        $row['number'],
                    ),
                ],
            );
        }
    }

    private function upsertLocation(string $territory): Location
    {
        $attributes = $this->parseTerritory($territory);

        return Location::query()->updateOrCreate(
            [
                'company_key' => self::COMPANY_KEY,
                'building' => $attributes['building'],
                'factory_zone' => $attributes['factory_zone'],
                'room' => $attributes['room'],
                'sector' => $attributes['sector'],
            ],
            [
                'created_by_user_id' => null,
                'type' => $attributes['type'],
                'description' => 'Импортировано из посадочной ведомости GreenLog',
            ],
        );
    }

    private function parseTerritory(string $territory): array
    {
        if ($territory === 'Улица') {
            return [
                'building' => 'Улица',
                'factory_zone' => null,
                'room' => null,
                'sector' => null,
                'type' => 'sector',
            ];
        }

        if ($territory === 'A-1,2,3 (АБК)') {
            return [
                'building' => 'A-1,2,3 (АБК)',
                'factory_zone' => 'Административно-бытовой корпус',
                'room' => null,
                'sector' => null,
                'type' => 'office',
            ];
        }

        if (str_starts_with($territory, 'T-')) {
            [$building, $zone] = array_pad(explode(' ', $territory, 2), 2, null);

            return [
                'building' => $building,
                'factory_zone' => $zone,
                'room' => null,
                'sector' => $zone,
                'type' => 'factory_zone',
            ];
        }

        return [
            'building' => $territory,
            'factory_zone' => null,
            'room' => null,
            'sector' => null,
            'type' => 'sector',
        ];
    }

    private function inferSpeciesCategory(string $name): string
    {
        $value = mb_strtolower($name);

        if ($this->containsAny($value, ['туя', 'ель', 'сосна', 'можжевельник', 'кипарисовик'])) {
            return 'conifer';
        }

        if ($this->containsAny($value, ['роза', 'лилия', 'пионы', 'пион', 'седум', 'орехи'])) {
            return 'flower_shrub';
        }

        if ($this->containsAny($value, ['деревья', 'дерев', 'береза', 'тополь', 'липа', 'каштан', 'платовидная'])) {
            return 'tree';
        }

        if ($this->containsAny($value, ['плодовая', 'плодовые'])) {
            return 'fruit_tree';
        }

        return 'outdoor';
    }

    private function containsAny(string $value, array $needles): bool
    {
        foreach ($needles as $needle) {
            if (str_contains($value, $needle)) {
                return true;
            }
        }

        return false;
    }

    private function buildInventoryNumber(string $territory, int $rowNumber): string
    {
        return sprintf(
            'GL-%s-%03d',
            self::TERRITORY_CODES[$territory] ?? 'GREENLOG',
            $rowNumber,
        );
    }
}
