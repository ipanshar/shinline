import React, { useMemo, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface YardOption {
    id: number;
    name: string;
    strict_mode?: boolean;
}

interface ImportResult {
    created_trucks: number;
    updated_trucks: number;
    created_counterparties: number;
    linked_counterparties: number;
    created_permits: number;
    skipped_permits: number;
    processed_rows: number;
    errors: string[];
}

interface PermitExcelImportModalProps {
    open: boolean;
    yards: YardOption[];
    onClose: () => void;
    onImported: () => void;
}

const PermitExcelImportModal: React.FC<PermitExcelImportModalProps> = ({ open, yards, onClose, onImported }) => {
    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [saving, setSaving] = useState(false);
    const [yardId, setYardId] = useState<string>('');
    const [permitType, setPermitType] = useState<'permanent' | 'one_time'>('permanent');
    const [weighingControl, setWeighingControl] = useState<'default' | 'required' | 'not_required'>('default');
    const [formError, setFormError] = useState<string | null>(null);
    const [result, setResult] = useState<ImportResult | null>(null);

    const previewRows = useMemo(() => rows.slice(0, 5), [rows]);

    const resetState = () => {
        setFile(null);
        setRows([]);
        setYardId('');
        setPermitType('permanent');
        setWeighingControl('default');
        setFormError(null);
        setResult(null);
        setSaving(false);
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            resetState();
            onClose();
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) {
            return;
        }

        setFormError(null);
        setResult(null);
        setFile(selectedFile);

        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            try {
                const data = new Uint8Array(loadEvent.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
                    defval: '',
                });

                setRows(parsedRows);
                if (parsedRows.length === 0) {
                    setFormError('В файле не найдено строк для импорта.');
                }
            } catch (error) {
                console.error('Ошибка чтения Excel:', error);
                setRows([]);
                setFormError('Не удалось прочитать Excel-файл. Проверьте формат файла.');
            }
        };

        reader.readAsArrayBuffer(selectedFile);
    };

    const handleImport = async () => {
        setFormError(null);

        if (!file || rows.length === 0) {
            setFormError('Сначала выберите Excel-файл с данными ТС.');
            return;
        }

        if (!yardId) {
            setFormError('Выберите двор для создаваемых разрешений.');
            return;
        }

        const token = localStorage.getItem('auth_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        setSaving(true);
        try {
            const response = await axios.post(
                '/security/import-permits',
                {
                    rows,
                    yard_id: Number(yardId),
                    one_permission: permitType === 'one_time',
                    weighing_required:
                        weighingControl === 'required'
                            ? true
                            : weighingControl === 'not_required'
                              ? false
                              : null,
                },
                { headers },
            );

            const payload = response.data?.data as ImportResult;
            setResult(payload);
            toast.success('Импорт ТС и разрешений завершен');
            onImported();
        } catch (error: any) {
            const message = error.response?.data?.message || 'Ошибка импорта';
            setFormError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[760px] max-h-[92vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" />
                        Импорт ТС и разрешений из Excel
                    </DialogTitle>
                    <DialogDescription>
                        Загрузите Excel-файл, выберите двор и параметры разрешения. Импорт создаст или обновит ТС, владельца и разрешение без дублей активных записей.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 overflow-y-auto pr-2">
                    {formError && (
                        <Alert variant="destructive">
                            <AlertTitle>Ошибка</AlertTitle>
                            <AlertDescription>{formError}</AlertDescription>
                        </Alert>
                    )}

                    <div className="grid gap-2">
                        <Label htmlFor="permit-import-file">Excel-файл</Label>
                        <input
                            id="permit-import-file"
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <label htmlFor="permit-import-file">
                            <Button variant="outline" className="w-full justify-start" asChild>
                                <span>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {file ? file.name : 'Выбрать Excel-файл'}
                                </span>
                            </Button>
                        </label>
                        <p className="text-xs text-muted-foreground">
                            Обязательные колонки: госномер и владелец. Дополнительно поддерживаются марка, год, тип ТС, кузов, примечание.
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="grid gap-2">
                            <Label>Двор</Label>
                            <Select value={yardId} onValueChange={setYardId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Выберите двор" />
                                </SelectTrigger>
                                <SelectContent>
                                    {yards.map((yard) => (
                                        <SelectItem key={yard.id} value={yard.id.toString()}>
                                            {yard.name} {yard.strict_mode ? '🔒' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Тип разрешения</Label>
                            <Select value={permitType} onValueChange={(value: 'permanent' | 'one_time') => setPermitType(value)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="permanent">Постоянное</SelectItem>
                                    <SelectItem value="one_time">Разовое</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Весовой контроль</Label>
                            <Select
                                value={weighingControl}
                                onValueChange={(value: 'default' | 'required' | 'not_required') => setWeighingControl(value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">По умолчанию</SelectItem>
                                    <SelectItem value="required">Требуется</SelectItem>
                                    <SelectItem value="not_required">Не требуется</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {rows.length > 0 && (
                        <div className="grid gap-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">Предпросмотр</span>
                                <span className="text-muted-foreground">Строк в файле: {rows.length}</span>
                            </div>
                            <div className="max-h-72 overflow-auto rounded-lg border bg-muted/20 p-3">
                                <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(previewRows, null, 2)}</pre>
                            </div>
                        </div>
                    )}

                    {result && (
                        <Alert>
                            <AlertTitle>Результат импорта</AlertTitle>
                            <AlertDescription className="space-y-2 text-sm">
                                <p>Обработано строк: {result.processed_rows}</p>
                                <p>Новых ТС: {result.created_trucks}, обновлено ТС: {result.updated_trucks}</p>
                                <p>Новых владельцев: {result.created_counterparties}, привязок владельца: {result.linked_counterparties}</p>
                                <p>Создано разрешений: {result.created_permits}, пропущено активных разрешений: {result.skipped_permits}</p>
                                {result.errors.length > 0 && (
                                    <div className="max-h-40 overflow-auto rounded border bg-background p-2">
                                        {result.errors.map((error, index) => (
                                            <p key={`${error}-${index}`} className="text-xs text-destructive">
                                                {error}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </AlertDescription>
                        </Alert>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
                        Закрыть
                    </Button>
                    <Button onClick={handleImport} disabled={saving || rows.length === 0}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {saving ? 'Импортируем...' : 'Импортировать'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default PermitExcelImportModal;