import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, Button, CircularProgress, Alert } from '@mui/material';
import { Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import axios from 'axios';

interface ImportExcelModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: () => void;
}

const ImportExcelModal: React.FC<ImportExcelModalProps> = ({ isOpen, onClose, onImportComplete }) => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<any[]>([]);
    const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setError(null);
        setResult(null);

        try {
            const data = await selectedFile.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            // Показываем первые 5 строк для предпросмотра
            setPreview(jsonData.slice(0, 5));
        } catch (err) {
            setError('Ошибка при чтении файла Excel');
            console.error(err);
        }
    };

    const handleImport = async () => {
        if (!file) {
            setError('Выберите файл');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            // Отправляем данные "как есть" на backend
            const response = await axios.post('/counterparty/import', {
                counterparties: jsonData
            });

            if (response.data.status) {
                setResult({
                    imported: response.data.imported,
                    skipped: response.data.skipped,
                    errors: response.data.errors || []
                });
                onImportComplete();
            } else {
                setError(response.data.message || 'Ошибка импорта');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Ошибка при импорте данных');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setPreview([]);
        setError(null);
        setResult(null);
        onClose();
    };

    return (
        <Dialog open={isOpen} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle className="flex items-center justify-between">
                <span>Импорт контрагентов из Excel</span>
                <Button onClick={handleClose} size="small">
                    <X className="h-4 w-4" />
                </Button>
            </DialogTitle>
            <DialogContent>
                <div className="space-y-4">
                    {/* Выбор файла */}
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                            className="hidden"
                            id="excel-file-input"
                        />
                        <label htmlFor="excel-file-input" className="cursor-pointer">
                            <Upload className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="mt-2 text-sm text-gray-600">
                                {file ? file.name : 'Выберите файл Excel (.xlsx, .xls)'}
                            </p>
                            <Button variant="outlined" component="span" className="mt-2">
                                Выбрать файл
                            </Button>
                        </label>
                    </div>

                    {/* Инструкция */}
                    <Alert severity="info">
                        <strong>Умный импорт:</strong> Система автоматически определит колонки по названиям.
                        <br />
                        Поддерживаемые колонки: Наименование, БИН/ИИН, Адрес, Телефон, Email, Руководитель, Контактное лицо
                        <br />
                        <strong>Телефон и WhatsApp:</strong> Если в одной ячейке два номера через "/" или перенос строки, они будут разделены автоматически
                    </Alert>

                    {/* Предпросмотр */}
                    {preview.length > 0 && (
                        <div>
                            <h3 className="font-semibold mb-2">Предпросмотр (первые 5 строк):</h3>
                            <div className="overflow-x-auto max-h-60 overflow-y-auto border rounded">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            {Object.keys(preview[0]).map((key) => (
                                                <th key={key} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                    {key}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {preview.map((row, idx) => (
                                            <tr key={idx}>
                                                {Object.values(row).map((value: any, i) => (
                                                    <td key={i} className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">
                                                        {String(value).substring(0, 50)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Результат импорта */}
                    {result && (
                        <Alert severity="success">
                            <strong>Импорт завершен!</strong>
                            <br />
                            Добавлено: {result.imported}
                            <br />
                            Пропущено (дубликаты): {result.skipped}
                            {result.errors.length > 0 && (
                                <>
                                    <br />
                                    <strong>Ошибки:</strong>
                                    <ul className="list-disc list-inside">
                                        {result.errors.map((err, idx) => (
                                            <li key={idx}>{err}</li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </Alert>
                    )}

                    {/* Ошибка */}
                    {error && (
                        <Alert severity="error">{error}</Alert>
                    )}

                    {/* Кнопки */}
                    <div className="flex justify-end gap-2 mt-4">
                        <Button onClick={handleClose} variant="outlined">
                            Закрыть
                        </Button>
                        <Button
                            onClick={handleImport}
                            variant="contained"
                            disabled={!file || loading}
                            startIcon={loading ? <CircularProgress size={20} /> : <Upload />}
                        >
                            {loading ? 'Импорт...' : 'Импортировать'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ImportExcelModal;
