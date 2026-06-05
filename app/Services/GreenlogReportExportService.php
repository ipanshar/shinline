<?php

namespace App\Services;

use Illuminate\Support\Collection;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class GreenlogReportExportService
{
    public function exportPlantsInventory(Collection $plants): string
    {
        $headers = [
            'Инвентарный номер',
            'Название',
            'Биологическое название',
            'Категория',
            'Статус',
            'Локация',
            'Количество',
            'Стоимость за единицу',
            'Общая стоимость',
            'Источник стоимости',
            'Частота полива',
            'Частота удобрения',
            'Дата создания',
        ];

        $rows = $plants->map(function ($plant): array {
            return [
                $plant->inventory_number,
                $plant->name,
                $plant->biological_name ?? '',
                $this->plantCategoryLabel($plant->category),
                $this->plantStatusLabel($plant->status),
                $this->locationLabel($plant->location),
                (string) ($plant->quantity ?? 1),
                $this->moneyValue($plant->unit_cost),
                $this->moneyValue($plant->total_cost),
                $this->plantCostSourceLabel($plant->cost_source),
                $plant->watering_frequency_days ? $plant->watering_frequency_days . ' дн.' : '',
                $plant->fertilizing_frequency_days ? $plant->fertilizing_frequency_days . ' дн.' : '',
                optional($plant->created_at)->format('d.m.Y H:i'),
            ];
        })->all();

        return $this->exportSpreadsheet('Ведомость растений', $headers, $rows, 'greenlog_plants_inventory_');
    }

    public function exportExpensesSummary(Collection $expenses): string
    {
        $headers = [
            'Дата',
            'Категория',
            'Сумма',
            'Растение',
            'Локация',
            'Документ',
            'Описание',
        ];

        $rows = $expenses->map(function ($expense): array {
            return [
                optional($expense->expense_date)->format('d.m.Y'),
                $this->expenseCategoryLabel($expense->category),
                number_format((float) $expense->amount, 2, '.', ''),
                $expense->plant?->name ?? '',
                $this->locationLabel($expense->location),
                $expense->document_number ?? '',
                $expense->description,
            ];
        })->all();

        return $this->exportSpreadsheet('Финансовый отчет', $headers, $rows, 'greenlog_expenses_summary_');
    }

    private function exportSpreadsheet(string $title, array $headers, array $rows, string $prefix): string
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle(mb_substr($title, 0, 31));
        $sheet->setShowGridLines(false);
        $spreadsheet->getDefaultStyle()->getFont()->setName('Arial')->setSize(10);

        $lastColumn = chr(64 + count($headers));
        $sheet->mergeCells("A1:{$lastColumn}1");
        $sheet->setCellValue('A1', $title);
        $sheet->setCellValue('A2', 'Сформировано: ' . now()->format('d.m.Y H:i'));

        foreach ($headers as $index => $header) {
            $column = chr(65 + $index);
            $sheet->setCellValue("{$column}4", $header);
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        $rowIndex = 5;
        foreach ($rows as $row) {
            foreach ($row as $cellIndex => $value) {
                $column = chr(65 + $cellIndex);
                $sheet->setCellValue("{$column}{$rowIndex}", $value);
            }
            $rowIndex++;
        }

        $sheet->getStyle("A1:{$lastColumn}1")->applyFromArray([
            'font' => [
                'bold' => true,
                'size' => 14,
                'color' => ['rgb' => 'FFFFFF'],
            ],
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => '14532D'],
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
            ],
        ]);

        $sheet->getStyle("A4:{$lastColumn}4")->applyFromArray([
            'font' => [
                'bold' => true,
                'color' => ['rgb' => 'FFFFFF'],
            ],
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => '166534'],
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
                'vertical' => Alignment::VERTICAL_CENTER,
            ],
            'borders' => [
                'allBorders' => [
                    'borderStyle' => Border::BORDER_THIN,
                    'color' => ['rgb' => 'D1D5DB'],
                ],
            ],
        ]);

        if ($rowIndex > 5) {
            $sheet->getStyle("A5:{$lastColumn}" . ($rowIndex - 1))->applyFromArray([
                'alignment' => [
                    'vertical' => Alignment::VERTICAL_TOP,
                    'wrapText' => true,
                ],
                'borders' => [
                    'allBorders' => [
                        'borderStyle' => Border::BORDER_THIN,
                        'color' => ['rgb' => 'E5E7EB'],
                    ],
                ],
            ]);
        }

        $directory = storage_path('app/reports');
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
            throw new \RuntimeException('Не удалось создать директорию для отчётов: ' . $directory);
        }

        $path = tempnam($directory, $prefix);
        if ($path === false) {
            throw new \RuntimeException('Не удалось создать временный файл для отчёта');
        }

        $xlsxPath = $path . '.xlsx';
        @unlink($path);

        $writer = new Xlsx($spreadsheet);
        $writer->setPreCalculateFormulas(false);
        $writer->save($xlsxPath);

        return $xlsxPath;
    }

    private function locationLabel(object|null $location): string
    {
        if ($location === null) {
            return '';
        }

        return collect([
            $location->building ?? null,
            $location->floor ?? null,
            $location->room ?? null,
            $location->factory_zone ?? null,
        ])->filter()->implode(' / ');
    }

    private function plantCategoryLabel(?string $category): string
    {
        return match ($category) {
            'indoor' => 'Комнатное',
            'outdoor' => 'Уличное',
            default => (string) $category,
        };
    }

    private function plantStatusLabel(?string $status): string
    {
        return match ($status) {
            'alive' => 'В норме',
            'needs_care' => 'Требует ухода',
            'written_off' => 'Списано',
            'active' => 'Активно',
            default => (string) $status,
        };
    }

    private function plantCostSourceLabel(?string $value): string
    {
        return match ($value) {
            'auto' => 'Авто',
            'manual' => 'Вручную',
            default => '—',
        };
    }

    private function moneyValue(mixed $value): string
    {
        if ($value === null || $value === '') {
            return '';
        }

        return number_format((float) $value, 2, '.', '');
    }

    private function expenseCategoryLabel(?string $category): string
    {
        return match ($category) {
            'purchase' => 'Покупка',
            'pot' => 'Горшок',
            'fertilizer' => 'Удобрение',
            'soil' => 'Грунт',
            'watering' => 'Полив',
            'service' => 'Сервис',
            'other' => 'Другое',
            default => (string) $category,
        };
    }
}
