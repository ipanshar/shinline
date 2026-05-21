<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Drawing;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class SpectechReportExportService
{
    public function export(array $report): string
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Отчет');
        $sheet->setShowGridLines(false);
        $sheet->getSheetView()->setZoomScale(90);
        $sheet->getPageSetup()->setOrientation(PageSetup::ORIENTATION_LANDSCAPE);
        $sheet->getPageSetup()->setFitToWidth(1);
        $sheet->getPageSetup()->setFitToHeight(0);
        $sheet->getPageMargins()->setTop(0.35);
        $sheet->getPageMargins()->setBottom(0.35);
        $sheet->getPageMargins()->setLeft(0.25);
        $sheet->getPageMargins()->setRight(0.25);
        $sheet->getDefaultRowDimension()->setRowHeight(22);
        $spreadsheet->getDefaultStyle()->getFont()->setName('Arial')->setSize(9);

        $this->setColumnWidths($sheet);
        $this->buildHeader($sheet, $report);

        $row = 8;
        $row = $this->buildSummaryBlock($sheet, $report, $row) + 2;
        $row = $this->buildProblemsBlock($sheet, $report, $row) + 2;
        $row = $this->buildAnalyticsBlock($sheet, $report, $row) + 2;
        $journalHeaderRow = $this->buildJournalBlock($sheet, $report, $row);
        $sheet->freezePane('A' . ($journalHeaderRow + 1));

        $directory = storage_path('app/reports');
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
            throw new \RuntimeException('Не удалось создать директорию для отчётов: ' . $directory);
        }

        $path = tempnam($directory, 'spectech_report_');
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

    private function setColumnWidths(Worksheet $sheet): void
    {
        $widths = [
            'A' => 11,
            'B' => 20,
            'C' => 16,
            'D' => 22,
            'E' => 15,
            'F' => 26,
            'G' => 28,
            'H' => 28,
            'I' => 30,
            'J' => 18,
        ];

        foreach ($widths as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }
    }

    private function buildHeader(Worksheet $sheet, array $report): void
    {
        $sheet->mergeCells('A1:C5');
        $sheet->mergeCells('A6:C6');
        $sheet->mergeCells('D1:J2');
        $sheet->mergeCells('D3:J3');
        $sheet->mergeCells('D4:J4');
        $sheet->mergeCells('D5:J5');
        $sheet->mergeCells('D6:J6');

        $sheet->setCellValue('A6', 'SHIN LINE');
        $sheet->setCellValue('D1', 'НЕДЕЛЬНЫЙ ОТЧЕТ ПО РАБОТЕ СПЕЦТЕХНИКИ');
        $sheet->setCellValue('D3', 'Период отчета: ' . ($report['period']['label'] ?? '—'));
        $sheet->setCellValue('D4', 'Ответственный руководитель: Цай Игорь Робикович');
        $sheet->setCellValue('D5', 'Диспетчеризация спецтехники: заявки, конфликты, загрузка, место согласования');
        $sheet->setCellValue('D6', 'Дата формирования: ' . now()->format('d.m.Y H:i'));

        $logoPath = $this->resolveLogoPath();
        if ($logoPath !== null && is_file($logoPath)) {
            try {
                $drawing = new Drawing();
                $drawing->setName('Shin Line');
                $drawing->setDescription('Shin Line');
                $drawing->setPath($logoPath);
                $drawing->setCoordinates('A1');
                $drawing->setHeight(104);
                $drawing->setOffsetX(74);
                $drawing->setOffsetY(4);
                $drawing->setWorksheet($sheet);
            } catch (\Throwable) {
                $sheet->setCellValue('A1', "SHIN\nLINE");
            }
        } else {
            $sheet->setCellValue('A1', "SHIN\nLINE");
        }

        for ($row = 1; $row <= 5; $row++) {
            $sheet->getRowDimension($row)->setRowHeight(23);
        }
        $sheet->getRowDimension(6)->setRowHeight(20);

        $sheet->getStyle('A1:C6')->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'B91C1C'],
            ],
            'font' => [
                'bold' => true,
                'size' => 12,
                'color' => ['rgb' => 'FFFFFF'],
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
                'vertical' => Alignment::VERTICAL_CENTER,
                'wrapText' => true,
            ],
            'borders' => [
                'outline' => [
                    'borderStyle' => Border::BORDER_MEDIUM,
                    'color' => ['rgb' => '7F1D1D'],
                ],
            ],
        ]);

        $sheet->getStyle('D1:J6')->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'F8FAFC'],
            ],
            'alignment' => [
                'vertical' => Alignment::VERTICAL_CENTER,
                'wrapText' => true,
            ],
            'borders' => [
                'outline' => [
                    'borderStyle' => Border::BORDER_MEDIUM,
                    'color' => ['rgb' => 'CBD5E1'],
                ],
                'inside' => [
                    'borderStyle' => Border::BORDER_THIN,
                    'color' => ['rgb' => 'E2E8F0'],
                ],
            ],
        ]);

        $sheet->getStyle('D1:J2')->applyFromArray([
            'font' => [
                'bold' => true,
                'size' => 18,
                'color' => ['rgb' => '0F2E4D'],
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_LEFT,
            ],
        ]);

        $sheet->getStyle('D3:D6')->applyFromArray([
            'font' => [
                'size' => 10,
                'color' => ['rgb' => '4B5563'],
            ],
        ]);
    }

    private function resolveLogoPath(): ?string
    {
        $candidates = [
            resource_path('images/shin-line-logo.png'),
            public_path('images/shin-line-logo.png'),
            public_path('shin-line-logo.png'),
        ];

        $builtLogos = glob(public_path('build/assets/shin-line-logo-*.png')) ?: [];
        $candidates = array_merge($candidates, $builtLogos);

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && is_file($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    private function buildSummaryBlock(Worksheet $sheet, array $report, int $startRow): int
    {
        $sheet->mergeCells("A{$startRow}:J{$startRow}");
        $sheet->setCellValue("A{$startRow}", 'KPI ПО НЕДЕЛЕ');

        $sheet->getStyle("A{$startRow}:J{$startRow}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => '0F2E4D'],
            ],
            'font' => [
                'bold' => true,
                'color' => ['rgb' => 'FFFFFF'],
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
            ],
        ]);

        $metrics = [
            ['range' => ['A', 'B'], 'title' => 'Всего заявок', 'value' => $report['summary']['total_requests'] ?? 0, 'description' => 'Подано за выбранную неделю', 'color' => 'E6F0FF', 'accent' => '1E4F8A'],
            ['range' => ['C', 'E'], 'title' => 'Конфликты', 'value' => $report['summary']['conflict_requests'] ?? 0, 'description' => 'Требуют решения диспетчера', 'color' => 'FDE2E1', 'accent' => 'B91C1C'],
            ['range' => ['F', 'G'], 'title' => 'Заморожено', 'value' => $report['summary']['frozen_requests'] ?? 0, 'description' => 'Статус не должен зависать', 'color' => 'FFF4CC', 'accent' => '92400E'],
            ['range' => ['H', 'J'], 'title' => 'Отменено', 'value' => $report['summary']['cancelled_requests'] ?? 0, 'description' => 'Снято с исполнения', 'color' => 'FDE2E1', 'accent' => 'B91C1C'],
        ];

        $titleRow = $startRow + 1;
        $valueRow = $startRow + 2;
        $descriptionRow = $startRow + 3;
        foreach ($metrics as $metric) {
            [$fromCol, $toCol] = $metric['range'];
            $sheet->mergeCells("{$fromCol}{$titleRow}:{$toCol}{$titleRow}");
            $sheet->mergeCells("{$fromCol}{$valueRow}:{$toCol}{$valueRow}");
            $sheet->mergeCells("{$fromCol}{$descriptionRow}:{$toCol}{$descriptionRow}");

            $sheet->setCellValue("{$fromCol}{$titleRow}", $metric['title']);
            $sheet->setCellValue("{$fromCol}{$valueRow}", (int) $metric['value']);
            $sheet->setCellValue("{$fromCol}{$descriptionRow}", $metric['description']);

            $sheet->getStyle("{$fromCol}{$titleRow}:{$toCol}{$descriptionRow}")->applyFromArray([
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => $metric['color']],
                ],
                'borders' => [
                    'allBorders' => [
                        'borderStyle' => Border::BORDER_THIN,
                        'color' => ['rgb' => 'CBD5E1'],
                    ],
                ],
                'alignment' => [
                    'vertical' => Alignment::VERTICAL_CENTER,
                    'horizontal' => Alignment::HORIZONTAL_CENTER,
                    'wrapText' => true,
                ],
            ]);

            $sheet->getStyle("{$fromCol}{$titleRow}:{$toCol}{$titleRow}")->applyFromArray([
                'font' => [
                    'bold' => true,
                    'size' => 10,
                    'color' => ['rgb' => $metric['accent']],
                ],
            ]);

            $sheet->getStyle("{$fromCol}{$valueRow}:{$toCol}{$valueRow}")->applyFromArray([
                'font' => [
                    'bold' => true,
                    'size' => 22,
                    'color' => ['rgb' => '111827'],
                ],
            ]);
        }

        $sheet->getRowDimension($startRow)->setRowHeight(22);
        $sheet->getRowDimension($titleRow)->setRowHeight(22);
        $sheet->getRowDimension($valueRow)->setRowHeight(32);
        $sheet->getRowDimension($descriptionRow)->setRowHeight(26);

        return $descriptionRow;
    }

    private function buildProblemsBlock(Worksheet $sheet, array $report, int $startRow): int
    {
        $sheet->mergeCells("A{$startRow}:J{$startRow}");
        $sheet->setCellValue("A{$startRow}", 'ПРОБЛЕМНЫЕ ЗАЯВКИ');

        $sheet->getStyle("A{$startRow}:J{$startRow}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'B91C1C'],
            ],
            'font' => [
                'bold' => true,
                'color' => ['rgb' => 'FFFFFF'],
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
            ],
        ]);

        $headerRow = $startRow + 1;
        $sheet->mergeCells("A{$headerRow}:B{$headerRow}");
        $sheet->mergeCells("C{$headerRow}:D{$headerRow}");
        $sheet->mergeCells("E{$headerRow}:J{$headerRow}");
        $sheet->setCellValue("A{$headerRow}", 'ID / инициатор');
        $sheet->setCellValue("C{$headerRow}", 'Суть');
        $sheet->setCellValue("E{$headerRow}", 'Рекомендуемое решение / статус');

        $sheet->getStyle("A{$headerRow}:J{$headerRow}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => '7F1D1D'],
            ],
            'font' => [
                'bold' => true,
                'color' => ['rgb' => 'FFFFFF'],
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
                'vertical' => Alignment::VERTICAL_CENTER,
                'wrapText' => true,
            ],
            'borders' => [
                'allBorders' => [
                    'borderStyle' => Border::BORDER_THIN,
                    'color' => ['rgb' => 'F3D5D5'],
                ],
            ],
        ]);

        $row = $headerRow + 1;
        foreach (($report['problem_requests'] ?? []) as $problem) {
            $sheet->mergeCells("A{$row}:B{$row}");
            $sheet->mergeCells("C{$row}:D{$row}");
            $sheet->mergeCells("E{$row}:J{$row}");

            $equipment = trim(($problem['equipment_name'] ?? '—') . (!empty($problem['plate_number']) ? ' / ' . $problem['plate_number'] : ''));
            $sheet->setCellValue("A{$row}", '#' . $problem['id'] . "\n" . ($problem['initiator_name'] ?? '—') . "\n" . $equipment);
            $sheet->setCellValue("C{$row}", $problem['essence']);
            $sheet->setCellValue("E{$row}", $problem['solution']);

            $sheet->getStyle("A{$row}:J{$row}")->applyFromArray([
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => 'FFF8F8'],
                ],
                'borders' => [
                    'allBorders' => [
                        'borderStyle' => Border::BORDER_THIN,
                        'color' => ['rgb' => 'E5E7EB'],
                    ],
                ],
                'alignment' => [
                    'vertical' => Alignment::VERTICAL_TOP,
                    'wrapText' => true,
                ],
            ]);

            $sheet->getStyle("A{$row}:B{$row}")->applyFromArray([
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => 'FEF2F2'],
                ],
                'font' => ['bold' => true, 'color' => ['rgb' => '991B1B']],
            ]);

            $sheet->getStyle("C{$row}:D{$row}")->applyFromArray([
                'font' => ['bold' => true, 'color' => ['rgb' => '7F1D1D']],
            ]);

            $sheet->getRowDimension($row)->setRowHeight(42);
            $row++;
        }

        if ($row === $headerRow + 1) {
            $sheet->mergeCells("A{$row}:J{$row}");
            $sheet->setCellValue("A{$row}", 'Проблемных заявок за период не найдено');
            $sheet->getStyle("A{$row}:J{$row}")->applyFromArray([
                'font' => ['italic' => true, 'color' => ['rgb' => '6B7280']],
                'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
                'borders' => [
                    'outline' => [
                        'borderStyle' => Border::BORDER_THIN,
                        'color' => ['rgb' => 'E5E7EB'],
                    ],
                ],
            ]);
            $row++;
        }

        return $row - 1;
    }

    private function buildAnalyticsBlock(Worksheet $sheet, array $report, int $startRow): int
    {
        $sheet->mergeCells("A{$startRow}:J{$startRow}");
        $sheet->setCellValue("A{$startRow}", 'АНАЛИТИКА И РЕКОМЕНДАЦИИ');

        $sheet->getStyle("A{$startRow}:J{$startRow}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'E6F0FF'],
            ],
            'font' => [
                'bold' => true,
                'color' => ['rgb' => '1E4F8A'],
            ],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);

        $lines = [];
        $peakHours = $report['peak_hours'] ?? [];
        if (!empty($peakHours)) {
            $top = $peakHours[0];
            $lines[] = sprintf('Пиковая нагрузка: %s (%d заявок)', $top['label'] ?? '—', $top['count'] ?? 0);
        }

        foreach (($report['recommendations'] ?? []) as $recommendation) {
            $lines[] = '• ' . $recommendation;
        }

        if (empty($lines)) {
            $lines[] = 'За выбранный период заявок нет.';
        }

        $row = $startRow + 1;
        foreach ($lines as $line) {
            $sheet->mergeCells("A{$row}:J{$row}");
            $sheet->setCellValue("A{$row}", $line);
            $sheet->getStyle("A{$row}:J{$row}")->applyFromArray([
                'borders' => [
                    'bottom' => [
                        'borderStyle' => Border::BORDER_THIN,
                        'color' => ['rgb' => 'E5E7EB'],
                    ],
                ],
                'alignment' => [
                    'wrapText' => true,
                    'vertical' => Alignment::VERTICAL_TOP,
                ],
                'font' => [
                    'color' => ['rgb' => '334155'],
                ],
            ]);
            $sheet->getRowDimension($row)->setRowHeight(22);
            $row++;
        }

        return $row - 1;
    }

    private function buildJournalBlock(Worksheet $sheet, array $report, int $startRow): int
    {
        $sheet->mergeCells("A{$startRow}:J{$startRow}");
        $sheet->setCellValue("A{$startRow}", 'ДЕТАЛЬНЫЙ ЖУРНАЛ ЗАЯВОК');

        $sheet->getStyle("A{$startRow}:J{$startRow}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => '163A63'],
            ],
            'font' => [
                'bold' => true,
                'color' => ['rgb' => 'FFFFFF'],
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
            ],
        ]);

        $headers = [
            'ID',
            'Инициатор',
            'Телефон',
            'Техника',
            'Госномер',
            'Период выполнения',
            'Статус / ошибки',
            'Локация',
            'Комментарий',
            'Создано',
        ];
        $headerRow = $startRow + 1;
        foreach ($headers as $index => $header) {
            $cell = Coordinate::stringFromColumnIndex($index + 1);
            $sheet->setCellValue($cell . $headerRow, $header);
        }

        $sheet->getStyle("A{$headerRow}:J{$headerRow}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => '0F2E4D'],
            ],
            'font' => [
                'bold' => true,
                'color' => ['rgb' => 'FFFFFF'],
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
                'vertical' => Alignment::VERTICAL_CENTER,
                'wrapText' => true,
            ],
            'borders' => [
                'allBorders' => [
                    'borderStyle' => Border::BORDER_THIN,
                    'color' => ['rgb' => 'E2E8F0'],
                ],
            ],
        ]);
        $sheet->getRowDimension($headerRow)->setRowHeight(30);

        $journalRows = $report['journal_rows'] ?? [];
        $row = $headerRow + 1;
        foreach ($journalRows as $index => $item) {
            $altFill = $index % 2 === 0 ? 'F8FAFC' : 'FFFFFF';
            $statusFill = $this->statusFill($item['status'] ?? '');
            $statusLabel = $this->statusIcon($item) . ' ' . ($item['status_label'] ?? '—');
            if (!empty($item['has_conflict'])) {
                $statusLabel .= "\n" . ($item['conflict_summary'] ?? 'Конфликт планирования');
            }
            if (!empty($item['is_frozen'])) {
                $statusLabel .= "\nЗаморожено";
            }
            if (!empty($item['is_cancelled'])) {
                $statusLabel .= "\nОтменено";
            }

            $sheet->setCellValue("A{$row}", '#' . ($item['id'] ?? ''));
            $sheet->setCellValue("B{$row}", $item['initiator_name'] ?? '—');
            $sheet->setCellValue("C{$row}", $item['initiator_phone'] ?? '—');
            $sheet->setCellValue("D{$row}", $item['equipment_name'] ?? '—');
            $sheet->setCellValue("E{$row}", $item['plate_number'] ?? '—');
            $sheet->setCellValue("F{$row}", $item['period'] ?? '—');
            $sheet->setCellValue("G{$row}", $statusLabel);
            $sheet->setCellValue("H{$row}", $this->locationWithoutComment($item['location'] ?? '—'));
            $sheet->setCellValue("I{$row}", $item['comment'] ?? '—');
            $sheet->setCellValue("J{$row}", $item['created_at_label'] ?? '—');

            $sheet->getStyle("A{$row}:J{$row}")->applyFromArray([
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => $altFill],
                ],
                'borders' => [
                    'allBorders' => [
                        'borderStyle' => Border::BORDER_THIN,
                        'color' => ['rgb' => 'E5E7EB'],
                    ],
                ],
                'alignment' => [
                    'vertical' => Alignment::VERTICAL_TOP,
                    'wrapText' => true,
                ],
            ]);

            $sheet->getStyle("A{$row}")->applyFromArray([
                'font' => [
                    'bold' => true,
                    'color' => ['rgb' => '0F2E4D'],
                ],
                'alignment' => [
                    'horizontal' => Alignment::HORIZONTAL_CENTER,
                ],
            ]);

            $sheet->getStyle("G{$row}")->applyFromArray([
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => $statusFill],
                ],
                'font' => [
                    'bold' => true,
                    'color' => ['rgb' => '1F2937'],
                ],
            ]);

            $sheet->getRowDimension($row)->setRowHeight(54);
            $row++;
        }

        if ($row === $headerRow + 1) {
            $sheet->mergeCells("A{$row}:J{$row}");
            $sheet->setCellValue("A{$row}", 'За выбранный период заявок нет');
            $sheet->getStyle("A{$row}:J{$row}")->applyFromArray([
                'font' => ['italic' => true, 'color' => ['rgb' => '64748B']],
                'alignment' => [
                    'horizontal' => Alignment::HORIZONTAL_CENTER,
                    'vertical' => Alignment::VERTICAL_CENTER,
                ],
                'borders' => [
                    'outline' => [
                        'borderStyle' => Border::BORDER_THIN,
                        'color' => ['rgb' => 'E5E7EB'],
                    ],
                ],
            ]);
            $row++;
        }

        $sheet->setAutoFilter("A{$headerRow}:J" . max($headerRow, $row - 1));

        return $headerRow;
    }

    private function locationWithoutComment(string $location): string
    {
        $lines = array_filter(
            explode("\n", $location),
            fn (string $line) => ! str_starts_with(trim($line), 'Комментарий:')
        );

        return implode("\n", $lines) ?: '—';
    }

    private function statusFill(string $status): string
    {
        return match ($status) {
            'cancelled' => 'FDE2E1',
            'completed', 'returned' => 'E7F8EC',
            'work_started', 'on_location' => 'E6F0FF',
            'departure' => 'FFF4CC',
            default => 'EEF2F7',
        };
    }

    private function statusIcon(array $item): string
    {
        if (!empty($item['is_cancelled'])) {
            return '✖';
        }

        if (!empty($item['has_conflict'])) {
            return '⚠';
        }

        if (!empty($item['is_frozen'])) {
            return '⏸';
        }

        return '•';
    }
}
