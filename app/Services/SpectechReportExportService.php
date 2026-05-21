<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Drawing;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class SpectechReportExportService
{
    public function export(array $report): string
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Отчет');
        $sheet->setShowGridLines(false);
        $sheet->freezePane('A21');
        $sheet->getPageSetup()->setOrientation(PageSetup::ORIENTATION_LANDSCAPE);
        $sheet->getPageMargins()->setTop(0.35);
        $sheet->getPageMargins()->setBottom(0.35);
        $sheet->getPageMargins()->setLeft(0.25);
        $sheet->getPageMargins()->setRight(0.25);
        $sheet->getDefaultRowDimension()->setRowHeight(20);
        $spreadsheet->getDefaultStyle()->getFont()->setName('Arial')->setSize(10);

        $this->setColumnWidths($sheet);
        $this->buildHeader($sheet, $report);
        $this->buildSummaryBlock($sheet, $report);
        $this->buildProblemsBlock($sheet, $report);
        $this->buildAnalyticsBlock($sheet, $report);
        $this->buildJournalBlock($sheet, $report);

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

    private function setColumnWidths($sheet): void
    {
        $widths = [
            'A' => 10,
            'B' => 22,
            'C' => 22,
            'D' => 24,
            'E' => 20,
            'F' => 34,
            'G' => 18,
            'H' => 18,
            'I' => 18,
            'J' => 18,
        ];

        foreach ($widths as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }
    }

    private function buildHeader($sheet, array $report): void
    {
        $sheet->mergeCells('B1:C4');
        $sheet->mergeCells('D1:J1');
        $sheet->mergeCells('D2:J2');
        $sheet->mergeCells('D3:J3');
        $sheet->mergeCells('D4:J4');

        $sheet->setCellValue('D1', 'НЕДЕЛЬНЫЙ ОТЧЕТ ПО РАБОТЕ СПЕЦТЕХНИКИ');
        $sheet->setCellValue('D2', 'Период отчета: ' . ($report['period']['label'] ?? '—'));
        $sheet->setCellValue('D3', 'Ответственный руководитель: Цай Игорь Робикович');
        $sheet->setCellValue('D4', 'Формат: диспетчеризация спецтехники / аналитика / экспорт');

        $logoPath = resource_path('images/shin-line-logo.png');
        if (is_file($logoPath)) {
            $drawing = new Drawing();
            $drawing->setName('Shin Line');
            $drawing->setDescription('Shin Line');
            $drawing->setPath($logoPath);
            $drawing->setCoordinates('A1');
            $drawing->setHeight(64);
            $drawing->setOffsetX(8);
            $drawing->setOffsetY(4);
            $drawing->setWorksheet($sheet);
        } else {
            $sheet->setCellValue('A1', 'SHIN LINE');
            $sheet->getStyle('A1')->applyFromArray([
                'font' => [
                    'bold' => true,
                    'size' => 14,
                    'color' => ['rgb' => '1E4F8A'],
                ],
            ]);
        }

        $sheet->getRowDimension(1)->setRowHeight(26);
        $sheet->getRowDimension(2)->setRowHeight(24);
        $sheet->getRowDimension(3)->setRowHeight(22);
        $sheet->getRowDimension(4)->setRowHeight(22);

        $sheet->getStyle('A1:J4')->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'F2F4F7'],
            ],
            'borders' => [
                'allBorders' => [
                    'borderStyle' => Border::BORDER_THIN,
                    'color' => ['rgb' => 'D7DCE3'],
                ],
            ],
            'alignment' => [
                'vertical' => Alignment::VERTICAL_CENTER,
            ],
        ]);

        $sheet->getStyle('D1')->applyFromArray([
            'font' => [
                'bold' => true,
                'size' => 16,
                'color' => ['rgb' => '1E4F8A'],
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_LEFT,
            ],
        ]);

        $sheet->getStyle('D2:D4')->applyFromArray([
            'font' => [
                'size' => 10,
                'color' => ['rgb' => '4B5563'],
            ],
        ]);
    }

    private function buildSummaryBlock($sheet, array $report): void
    {
        $startRow = 6;
        $sheet->mergeCells("A{$startRow}:C{$startRow}");
        $sheet->setCellValue("A{$startRow}", 'KPI ПО НЕДЕЛЕ');

        $sheet->getStyle("A{$startRow}:C{$startRow}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => '1E4F8A'],
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
            ['title' => 'Заявки в периоде', 'value' => $report['summary']['total_requests'] ?? 0, 'description' => 'Работы, попавшие в выбранную неделю', 'color' => 'D9EAF7'],
            ['title' => 'Конфликт планирования', 'value' => $report['summary']['conflict_requests'] ?? 0, 'description' => 'Заявки с пересечением техники', 'color' => 'FDE2E1'],
            ['title' => 'Заморожено', 'value' => $report['summary']['frozen_requests'] ?? 0, 'description' => 'Заявки со статусом заморозки', 'color' => 'FFF4CC'],
            ['title' => 'Отменено заявок', 'value' => $report['summary']['cancelled_requests'] ?? 0, 'description' => 'Заявки, снятые с исполнения', 'color' => 'FDE2E1'],
        ];

        $row = $startRow + 1;
        foreach ($metrics as $metric) {
            $sheet->setCellValue("A{$row}", $metric['title']);
            $sheet->setCellValue("B{$row}", (int) $metric['value']);
            $sheet->setCellValue("C{$row}", $metric['description']);

            $sheet->getStyle("A{$row}:C{$row}")->applyFromArray([
                'borders' => [
                    'allBorders' => [
                        'borderStyle' => Border::BORDER_THIN,
                        'color' => ['rgb' => 'D7DCE3'],
                    ],
                ],
                'alignment' => [
                    'vertical' => Alignment::VERTICAL_CENTER,
                    'wrapText' => true,
                ],
            ]);

            $sheet->getStyle("B{$row}")->applyFromArray([
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => $metric['color']],
                ],
                'font' => [
                    'bold' => true,
                    'size' => 12,
                    'color' => ['rgb' => '1F2937'],
                ],
                'alignment' => [
                    'horizontal' => Alignment::HORIZONTAL_CENTER,
                ],
            ]);

            $sheet->getStyle("A{$row}")->applyFromArray([
                'font' => ['bold' => true],
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => 'F8FAFC'],
                ],
            ]);

            $row++;
        }
    }

    private function buildProblemsBlock($sheet, array $report): void
    {
        $startRow = 6;
        $startCol = 'E';
        $endCol = 'J';

        $sheet->mergeCells("{$startCol}{$startRow}:{$endCol}{$startRow}");
        $sheet->setCellValue("{$startCol}{$startRow}", 'ПРОБЛЕМНЫЕ ЗАЯВКИ');

        $sheet->getStyle("{$startCol}{$startRow}:{$endCol}{$startRow}")->applyFromArray([
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

        $headers = ['ID заявки', 'Суть', 'Рекомендуемое решение / статус'];
        $headerRow = $startRow + 1;
        foreach ($headers as $index => $header) {
            $cell = Coordinate::stringFromColumnIndex(5 + $index);
            $sheet->setCellValue($cell . $headerRow, $header);
        }

        $sheet->getStyle("E{$headerRow}:G{$headerRow}")->applyFromArray([
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
            $sheet->setCellValue("E{$row}", '#' . $problem['id']);
            $sheet->setCellValue("F{$row}", $problem['essence']);
            $sheet->setCellValue("G{$row}", $problem['solution']);

            $sheet->getStyle("E{$row}:G{$row}")->applyFromArray([
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

            $sheet->getStyle("E{$row}")->applyFromArray([
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => 'FEF2F2'],
                ],
                'font' => ['bold' => true, 'color' => ['rgb' => '991B1B']],
            ]);

            $sheet->getStyle("F{$row}")->applyFromArray([
                'font' => ['bold' => true, 'color' => ['rgb' => '7F1D1D']],
            ]);

            $row++;
        }

        if ($row === $headerRow + 1) {
            $sheet->mergeCells("E{$row}:G{$row}");
            $sheet->setCellValue("E{$row}", 'Проблемных заявок за период не найдено');
            $sheet->getStyle("E{$row}:G{$row}")->applyFromArray([
                'font' => ['italic' => true, 'color' => ['rgb' => '6B7280']],
                'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
            ]);
        }
    }

    private function buildAnalyticsBlock($sheet, array $report): void
    {
        $startRow = 12;
        $sheet->mergeCells("A{$startRow}:J{$startRow}");
        $sheet->setCellValue("A{$startRow}", 'АНАЛИТИКА И РЕКОМЕНДАЦИИ');

        $sheet->getStyle("A{$startRow}:J{$startRow}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'D9EAF7'],
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
    }

    private function buildJournalBlock($sheet, array $report): void
    {
        $startRow = 19;
        $sheet->mergeCells("A{$startRow}:F{$startRow}");
        $sheet->setCellValue("A{$startRow}", 'ДЕТАЛЬНЫЙ ЖУРНАЛ ЗАЯВОК');

        $sheet->getStyle("A{$startRow}:F{$startRow}")->applyFromArray([
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

        $headers = ['ID заявки', 'Инициатор', 'Техника', 'Период выполнения', 'Статус / Ошибки', 'Локация / Комментарий'];
        $headerRow = $startRow + 1;
        foreach ($headers as $index => $header) {
            $cell = Coordinate::stringFromColumnIndex($index + 1);
            $sheet->setCellValue($cell . $headerRow, $header);
        }

        $sheet->getStyle("A{$headerRow}:F{$headerRow}")->applyFromArray([
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
            $sheet->setCellValue("B{$row}", ($item['initiator_name'] ?? '—') . "\n" . ($item['initiator_phone'] ?? '—'));
            $sheet->setCellValue("C{$row}", ($item['equipment_name'] ?? '—') . (!empty($item['plate_number']) ? "\n" . $item['plate_number'] : ''));
            $sheet->setCellValue("D{$row}", $item['period'] ?? '—');
            $sheet->setCellValue("E{$row}", $statusLabel);
            $sheet->setCellValue("F{$row}", $item['location'] ?? '—');

            $sheet->getStyle("A{$row}:F{$row}")->applyFromArray([
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

            $sheet->getStyle("E{$row}")->applyFromArray([
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => $statusFill],
                ],
                'font' => [
                    'bold' => true,
                    'color' => ['rgb' => '1F2937'],
                ],
            ]);

            $sheet->getRowDimension($row)->setRowHeight(42);
            $row++;
        }

        $sheet->setAutoFilter("A{$headerRow}:F" . max($headerRow, $row - 1));
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
