<?php

namespace App\Console\Commands;

use App\Models\Greenlog\Location;
use App\Models\Greenlog\Plant;
use App\Models\Greenlog\PlantSpecies;
use Illuminate\Console\Command;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Reader\Exception as ReaderException;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Throwable;

class GreenlogImportPlantRegister extends Command
{
    private array $locationCache = [];

    private array $speciesCache = [];

    private array $stats = [
        'locations_created' => 0,
        'locations_updated' => 0,
        'species_created' => 0,
        'plants_created' => 0,
        'plants_updated' => 0,
    ];

    protected $signature = 'greenlog:import-plant-register
                            {path : Path to the Excel file}
                            {--company=default : Company key for future import scope}
                            {--preview : Print first non-empty rows from every worksheet without importing}';

    protected $description = 'Reads the GreenLog planting register Excel file and prints workbook sheet statistics';

    public function handle(): int
    {
        $path = $this->resolvePath((string) $this->argument('path'));
        $company = (string) $this->option('company');

        if (! is_file($path)) {
            $this->error('Excel file not found: ' . $path);

            return self::FAILURE;
        }

        if (! is_readable($path)) {
            $this->error('Excel file is not readable: ' . $path);

            return self::FAILURE;
        }

        try {
            $reader = IOFactory::createReaderForFile($path);
            $reader->setReadDataOnly(true);
            $spreadsheet = $reader->load($path);
        } catch (ReaderException $exception) {
            $this->error('Unable to read Excel file: ' . $exception->getMessage());

            return self::FAILURE;
        } catch (Throwable $exception) {
            $this->error('Unexpected Excel read error: ' . $exception->getMessage());

            return self::FAILURE;
        }

        $rows = [];

        foreach ($spreadsheet->getWorksheetIterator() as $index => $sheet) {
            $rows[] = [
                '#' => $index + 1,
                'Sheet' => $sheet->getTitle(),
                'Rows' => $sheet->getHighestDataRow(),
            ];
        }

        $this->info('GreenLog planting register workbook was read successfully.');
        $this->line('File: ' . $path);
        $this->line('Company: ' . ($company !== '' ? $company : 'default'));
        $this->line('Sheets: ' . count($rows));
        $this->newLine();
        $this->table(['#', 'Sheet', 'Rows'], $rows);

        if ((bool) $this->option('preview')) {
            $this->printPreview($spreadsheet->getWorksheetIterator());
            $spreadsheet->disconnectWorksheets();

            return self::SUCCESS;
        }

        $this->importWorkbook($spreadsheet, $company !== '' ? $company : 'default');

        $spreadsheet->disconnectWorksheets();

        return self::SUCCESS;
    }

    private function importWorkbook(Spreadsheet $spreadsheet, string $companyKey): void
    {
        $this->newLine();
        $this->info('Import started.');

        $this->importPlantRegisterSheet($spreadsheet->getSheetByName('Реестр по растениям'), $companyKey);
        $this->importBiologicalAssetsSheet($spreadsheet->getSheetByName('Биологические активы'), $companyKey);
        $this->importActLocationsSheet($spreadsheet->getSheetByName('Акт посаженных растений'), $companyKey);

        $this->newLine();
        $this->info('Import finished.');
        $this->line('Создано локаций: ' . $this->stats['locations_created']);
        $this->line('Создано видов растений: ' . $this->stats['species_created']);
        $this->line('Создано растений: ' . $this->stats['plants_created']);
        $this->line('Обновлено локаций: ' . $this->stats['locations_updated']);
        $this->line('Обновлено растений: ' . $this->stats['plants_updated']);
    }

    private function importPlantRegisterSheet(?Worksheet $sheet, string $companyKey): void
    {
        if (! $sheet) {
            $this->warn('Sheet not found: Реестр по растениям');
            return;
        }

        $this->line('Importing sheet: Реестр по растениям');

        for ($row = 3; $row <= $sheet->getHighestDataRow(); $row++) {
            $locationName = $this->cellValue($sheet, 'C', $row);
            $speciesName = $this->cellValue($sheet, 'D', $row);
            $quantity = $this->parseQuantity($this->cellValue($sheet, 'E', $row));
            $responsible = $this->cellValue($sheet, 'F', $row);

            if ($locationName === '' || $speciesName === '' || $quantity === null) {
                continue;
            }

            $location = $this->upsertLocation($companyKey, $locationName, 'office', 'Импортировано из листа "Реестр по растениям"');
            $species = $this->upsertSpecies($speciesName);

            $this->upsertPlant(
                companyKey: $companyKey,
                inventoryNumber: sprintf('GL-REG-%06d', $row),
                location: $location,
                species: $species,
                quantity: $quantity,
                plantCategory: 'indoor',
                status: 'active',
                unitCost: Plant::defaultUnitCostForCategory('indoor'),
                costSource: 'auto',
                notes: $responsible !== '' ? 'Ответственный: ' . $responsible : 'Импортировано из листа "Реестр по растениям"',
            );
        }
    }

    private function importBiologicalAssetsSheet(?Worksheet $sheet, string $companyKey): void
    {
        if (! $sheet) {
            $this->warn('Sheet not found: Биологические активы');
            return;
        }

        $this->line('Importing sheet: Биологические активы');

        $currentTerritory = '';

        for ($row = 4; $row <= $sheet->getHighestDataRow(); $row++) {
            $territory = $this->cellValue($sheet, 'C', $row);
            if ($territory !== '') {
                $currentTerritory = $territory;
            }

            $speciesName = $this->cellValue($sheet, 'E', $row);
            $quantity = $this->parseQuantity($this->cellValue($sheet, 'F', $row));

            if ($currentTerritory === '' || $speciesName === '' || $quantity === null) {
                continue;
            }

            $location = $this->upsertLocation($companyKey, $currentTerritory, 'sector', 'Импортировано из листа "Биологические активы"');
            $species = $this->upsertSpecies($speciesName);

            $this->upsertPlant(
                companyKey: $companyKey,
                inventoryNumber: sprintf('GL-BIO-%06d', $row),
                location: $location,
                species: $species,
                quantity: $quantity,
                plantCategory: 'outdoor',
                status: 'alive',
                unitCost: Plant::defaultUnitCostForCategory('outdoor'),
                costSource: 'auto',
                notes: 'Импортировано из листа "Биологические активы"',
            );
        }
    }

    private function importActLocationsSheet(?Worksheet $sheet, string $companyKey): void
    {
        if (! $sheet) {
            $this->warn('Sheet not found: Акт посаженных растений');
            return;
        }

        $this->line('Importing locations from sheet: Акт посаженных растений');

        $headerRow = $this->findCellRow($sheet, 'C', 'Участок высадки');
        if ($headerRow === null) {
            $this->warn('Header not found on sheet "Акт посаженных растений": Участок высадки');
            return;
        }

        for ($row = $headerRow + 1; $row <= $sheet->getHighestDataRow(); $row++) {
            $locationName = $this->cellValue($sheet, 'C', $row);

            if ($locationName === '' || $this->isSectionHeader($locationName)) {
                continue;
            }

            $this->upsertLocation($companyKey, $locationName, 'sector', 'Импортировано из листа "Акт посаженных растений"');
        }
    }

    private function upsertLocation(string $companyKey, string $name, string $type, string $description): Location
    {
        $name = $this->normalizeText($name);
        $cacheKey = $companyKey . ':' . mb_strtolower($name);

        if (isset($this->locationCache[$cacheKey])) {
            return $this->locationCache[$cacheKey];
        }

        $location = Location::query()->updateOrCreate(
            [
                'company_key' => $companyKey,
                'building' => $name,
            ],
            [
                'created_by_user_id' => null,
                'floor' => null,
                'room' => null,
                'factory_zone' => null,
                'sector' => null,
                'type' => $type,
                'description' => $description,
            ],
        );

        if ($location->wasRecentlyCreated) {
            $this->stats['locations_created']++;
        } else {
            $this->stats['locations_updated']++;
        }

        return $this->locationCache[$cacheKey] = $location;
    }

    private function upsertSpecies(string $name): PlantSpecies
    {
        $name = $this->normalizeText($name);
        $cacheKey = mb_strtolower($name);

        if (isset($this->speciesCache[$cacheKey])) {
            return $this->speciesCache[$cacheKey];
        }

        $species = PlantSpecies::query()->updateOrCreate(
            ['name' => $name],
            [
                'category' => $this->inferSpeciesCategory($name),
                'description' => 'Импортировано из реестра GreenLog',
                'is_active' => true,
            ],
        );

        if ($species->wasRecentlyCreated) {
            $this->stats['species_created']++;
        }

        return $this->speciesCache[$cacheKey] = $species;
    }

    private function upsertPlant(
        string $companyKey,
        string $inventoryNumber,
        Location $location,
        PlantSpecies $species,
        int $quantity,
        string $plantCategory,
        string $status,
        string $unitCost,
        string $costSource,
        string $notes,
    ): Plant {
        $plant = Plant::query()->updateOrCreate(
            [
                'company_key' => $companyKey,
                'inventory_number' => $inventoryNumber,
            ],
            [
                'created_by_user_id' => null,
                'location_id' => $location->id,
                'species_id' => $species->id,
                'name' => $species->name,
                'biological_name' => null,
                'category' => $plantCategory,
                'status' => $status,
                'quantity' => $quantity,
                'unit_cost' => $unitCost,
                'total_cost' => number_format($quantity * (float) $unitCost, 2, '.', ''),
                'cost_source' => $costSource,
                'watering_frequency_days' => null,
                'fertilizing_frequency_days' => null,
                'notes' => $notes,
            ],
        );

        if ($plant->wasRecentlyCreated) {
            $this->stats['plants_created']++;
        } else {
            $this->stats['plants_updated']++;
        }

        return $plant;
    }

    private function printPreview(iterable $worksheets): void
    {
        foreach ($worksheets as $sheet) {
            $previewRows = $this->getPreviewRows($sheet);

            $this->newLine();
            $this->info('Preview: ' . $sheet->getTitle());

            if ($previewRows === []) {
                $this->warn('No non-empty rows found.');
                continue;
            }

            $this->table(['Excel row', 'A', 'B', 'C', 'D', 'E', 'F', 'G'], $previewRows);
        }
    }

    private function getPreviewRows(Worksheet $sheet): array
    {
        $rows = [];
        $highestRow = $sheet->getHighestDataRow();

        for ($rowNumber = 1; $rowNumber <= $highestRow; $rowNumber++) {
            $values = [
                $this->cellValue($sheet, 'A', $rowNumber),
                $this->cellValue($sheet, 'B', $rowNumber),
                $this->cellValue($sheet, 'C', $rowNumber),
                $this->cellValue($sheet, 'D', $rowNumber),
                $this->cellValue($sheet, 'E', $rowNumber),
                $this->cellValue($sheet, 'F', $rowNumber),
                $this->cellValue($sheet, 'G', $rowNumber),
            ];

            if ($this->isEmptyRow($values)) {
                continue;
            }

            $rows[] = array_merge(['Excel row' => $rowNumber], array_combine(['A', 'B', 'C', 'D', 'E', 'F', 'G'], $values));

            if (count($rows) >= 10) {
                break;
            }
        }

        return $rows;
    }

    private function cellValue(Worksheet $sheet, string $column, int $row): string
    {
        $value = $sheet->getCell($column . $row)->getFormattedValue();

        return $this->normalizeText((string) $value);
    }

    private function isEmptyRow(array $values): bool
    {
        foreach ($values as $value) {
            if (trim((string) $value) !== '') {
                return false;
            }
        }

        return true;
    }

    private function findCellRow(Worksheet $sheet, string $column, string $needle): ?int
    {
        $needle = mb_strtolower($this->normalizeText($needle));

        for ($row = 1; $row <= $sheet->getHighestDataRow(); $row++) {
            if (mb_strtolower($this->cellValue($sheet, $column, $row)) === $needle) {
                return $row;
            }
        }

        return null;
    }

    private function parseQuantity(string $value): ?int
    {
        $normalized = preg_replace('/[^\d]/u', '', $value);

        if ($normalized === null || $normalized === '') {
            return null;
        }

        $quantity = (int) $normalized;

        return $quantity > 0 ? $quantity : null;
    }

    private function normalizeText(string $value): string
    {
        return trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
    }

    private function isSectionHeader(string $value): bool
    {
        $normalized = mb_strtolower($value);

        return str_contains($normalized, 'участок высадки')
            || str_contains($normalized, 'наименование изделий')
            || str_contains($normalized, '№');
    }

    private function inferSpeciesCategory(string $name): string
    {
        $value = mb_strtolower($name);

        if ($this->containsAny($value, ['туя', 'ель', 'сосна', 'можжевельник', 'кипарисовик'])) {
            return 'conifer';
        }

        if ($this->containsAny($value, ['роза', 'лилия', 'пионы', 'пион', 'седум', 'орехи'])) {
            return 'flower/shrub';
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

    private function resolvePath(string $path): string
    {
        $path = trim($path);

        if ($path === '') {
            return $path;
        }

        if (str_starts_with($path, DIRECTORY_SEPARATOR) || preg_match('/^[A-Za-z]:[\\\\\\/]/', $path) === 1) {
            return $path;
        }

        return base_path($path);
    }
}
