import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Alert, CircularProgress } from '@mui/material';
import { Upload, FileSpreadsheet, CheckCircle, XCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import axios from 'axios';

interface ImportExcelModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: () => void;
}

const ImportExcelModal: React.FC<ImportExcelModalProps> = ({ isOpen, onClose, onImportComplete }) => {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setResult(null);
            
            // Читаем файл для предпросмотра
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                    
                    // Показываем первые 5 строк для предпросмотра
                    setPreview(jsonData.slice(0, 5));
                } catch (error) {
                    console.error('Ошибка чтения файла:', error);
                    alert('Ошибка чтения файла. Убедитесь, что это корректный Excel файл.');
                }
            };
            reader.readAsArrayBuffer(selectedFile);
        }
    };

    const handleImport = async () => {
        if (!file) return;

        setLoading(true);
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);

                    // Отправляем данные на сервер
                    const response = await axios.post('/counterparty/import', {
                        counterparties: jsonData
                    });

                    if (response.data.status) {
                        setResult({
                            imported: response.data.imported,
                            skipped: response.data.skipped,
                            errors: response.data.errors || []
                        });
                        
                        // Если импорт успешен, обновляем список
                        if (response.data.imported > 0) {
                            setTimeout(() => {
                                onImportComplete();
                            }, 2000);
                        }
                    } else {
                        alert('Ошибка импорта: ' + response.data.message);
                    }
                } catch (error: any) {
                    console.error('Ошибка импорта:', error);
                    alert('Ошибка импорта: ' + (error.response?.data?.message || error.message));
                } finally {
                    setLoading(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error('Ошибка:', error);
            setLoading(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setPreview([]);
        setResult(null);
        onClose();
    };

    return (
        <Dialog open={isOpen} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FileSpreadsheet size={24} />
                    Импорт контрагентов из Excel
                </Box>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                    {/* Загрузка файла */}
                    <Box>
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                            id="excel-file-input"
                        />
                        <label htmlFor="excel-file-input">
                            <Button
                                variant="outlined"
                                component="span"
                                startIcon={<Upload />}
                                fullWidth
                            >
                                {file ? file.name : 'Выберите Excel файл'}
                            </Button>
                        </label>
                    </Box>

                    {/* Предпросмотр данных */}
                    {preview.length > 0 && !result && (
                        <Box>
                            <Typography variant="subtitle2" gutterBottom>
                                Предпросмотр (первые 5 строк):
                            </Typography>
                            <Box sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid #ddd', borderRadius: 1, p: 1 }}>
                                <pre style={{ fontSize: '12px', margin: 0 }}>
                                    {JSON.stringify(preview, null, 2)}
                                </pre>
                            </Box>
                        </Box>
                    )}

                    {/* Результат импорта */}
                    {result && (
                        <Box>
                            <Alert severity={result.imported > 0 ? "success" : "warning"} sx={{ mb: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {result.imported > 0 ? <CheckCircle size={20} /> : <XCircle size={20} />}
                                    <Typography>
                                        Импорт завершен! Добавлено: {result.imported}, Пропущено: {result.skipped}
                                    </Typography>
                                </Box>
                            </Alert>

                            {result.errors.length > 0 && (
                                <Box>
                                    <Typography variant="subtitle2" color="error" gutterBottom>
                                        Ошибки:
                                    </Typography>
                                    <Box sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid #f44336', borderRadius: 1, p: 1 }}>
                                        {result.errors.map((error, index) => (
                                            <Typography key={index} variant="body2" color="error">
                                                {error}
                                            </Typography>
                                        ))}
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    )}

                    {/* Индикатор загрузки */}
                    {loading && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
                            <CircularProgress size={24} />
                            <Typography>Импортируем данные...</Typography>
                        </Box>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={loading}>
                    Закрыть
                </Button>
                <Button
                    onClick={handleImport}
                    variant="contained"
                    color="primary"
                    disabled={!file || loading || !!result}
                    startIcon={loading ? <CircularProgress size={20} /> : <Upload />}
                >
                    {loading ? 'Импортируем...' : 'Импортировать'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ImportExcelModal;
