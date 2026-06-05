import AppLayout from '@/layouts/app-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
    completeGreenlogCareTask,
    createGreenlogCareTask,
    createGreenlogExpense,
    deleteGreenlogPlantPhoto,
    getGreenlogPlant,
    isPreviewableGreenlogPhoto,
    updateGreenlogPlant,
    validateGreenlogPlantPhotoFile,
    type GreenlogCareTask,
    type GreenlogExpense,
    type GreenlogPlant,
    type GreenlogPlantPhoto,
    uploadGreenlogPlantPhoto,
} from '@/lib/greenlog-api';
import { greenlogMoneyLabel, plantCostSourceLabel } from '@/lib/greenlog-labels';
import type { BreadcrumbItem, SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { LoaderCircle, Upload } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const expenseCategories = [
    { value: 'purchase', label: 'Покупка' },
    { value: 'pot', label: 'Горшок' },
    { value: 'fertilizer', label: 'Удобрение' },
    { value: 'soil', label: 'Грунт' },
    { value: 'watering', label: 'Полив' },
    { value: 'service', label: 'Сервис' },
    { value: 'other', label: 'Другое' },
];

const careTaskTypes = [
    { value: 'watering', label: 'Полив' },
    { value: 'fertilizing', label: 'Подкормка' },
    { value: 'treatment', label: 'Обработка' },
    { value: 'inspection', label: 'Осмотр' },
    { value: 'other', label: 'Другое' },
];

type PlantPageProps = SharedData & {
    plantId: number;
};

type ExpenseForm = {
    category: string;
    amount: string;
    expense_date: string;
    description: string;
    document_number: string;
};

type CareTaskForm = {
    type: string;
    due_at: string;
    comment: string;
};

const emptyExpenseForm: ExpenseForm = {
    category: 'purchase',
    amount: '',
    expense_date: '',
    description: '',
    document_number: '',
};

const emptyCareTaskForm: CareTaskForm = {
    type: 'watering',
    due_at: '',
    comment: '',
};

const formatDateTime = (value?: string | null) => {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleString('ru-RU');
};

const formatLocationLabel = (plant?: GreenlogPlant | null) =>
    [plant?.location?.building, plant?.location?.floor, plant?.location?.room, plant?.location?.factory_zone].filter(Boolean).join(' / ') || 'Без локации';

export default function GreenLogPlantShow() {
    const { plantId } = usePage<PlantPageProps>().props;
    const [plant, setPlant] = useState<GreenlogPlant | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [savingExpense, setSavingExpense] = useState(false);
    const [savingTask, setSavingTask] = useState(false);
    const [savingCost, setSavingCost] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const [brokenPhotos, setBrokenPhotos] = useState<Record<number, boolean>>({});
    const [unitCost, setUnitCost] = useState('');
    const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm);
    const [careTaskForm, setCareTaskForm] = useState<CareTaskForm>(emptyCareTaskForm);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'Shin Line Flora', href: '/greenlog' },
            { title: 'Растения', href: '/greenlog/plants' },
            { title: plant?.name ?? `Растение #${plantId}`, href: `/greenlog/plants/${plantId}` },
        ],
        [plant?.name, plantId],
    );

    const loadPlant = async () => {
        try {
            setLoading(true);
            setError(null);
            setPlant(await getGreenlogPlant(plantId));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить карточку растения.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadPlant();
    }, [plantId]);

    useEffect(() => {
        setBrokenPhotos({});
    }, [plant?.id]);

    useEffect(() => {
        setUnitCost(plant?.unit_cost !== null && plant?.unit_cost !== undefined ? String(plant.unit_cost) : '');
    }, [plant?.id, plant?.unit_cost]);

    const uploadPhoto = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!selectedFile) {
            toast.error('Выберите файл фотографии.');
            return;
        }

        const validationError = validateGreenlogPlantPhotoFile(selectedFile);

        if (validationError) {
            setFileError(validationError);
            toast.error(validationError);
            return;
        }

        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('photo', selectedFile);
            formData.append('type', 'plant');
            await uploadGreenlogPlantPhoto(plantId, formData);
            setSelectedFile(null);
            setFileError(null);
            toast.success('Фотография загружена');
            await loadPlant();
        } catch (uploadError) {
            toast.error(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить фотографию.');
        } finally {
            setUploading(false);
        }
    };

    const removePhoto = async (photo: GreenlogPlantPhoto) => {
        if (!window.confirm('Удалить фотографию?')) {
            return;
        }

        try {
            await deleteGreenlogPlantPhoto(photo.id);
            toast.success('Фотография удалена');
            await loadPlant();
        } catch (photoError) {
            toast.error(photoError instanceof Error ? photoError.message : 'Не удалось удалить фотографию.');
        }
    };

    const submitExpense = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setSavingExpense(true);
            await createGreenlogExpense({
                plant_id: plantId,
                location_id: plant?.location_id ?? null,
                category: expenseForm.category,
                amount: expenseForm.amount,
                expense_date: expenseForm.expense_date,
                description: expenseForm.description.trim(),
                document_number: expenseForm.document_number.trim() || null,
            });
            setExpenseForm(emptyExpenseForm);
            toast.success('Расход добавлен');
            await loadPlant();
        } catch (expenseError) {
            toast.error(expenseError instanceof Error ? expenseError.message : 'Не удалось сохранить расход.');
        } finally {
            setSavingExpense(false);
        }
    };

    const submitCareTask = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setSavingTask(true);
            await createGreenlogCareTask({
                plant_id: plantId,
                type: careTaskForm.type,
                due_at: careTaskForm.due_at,
                comment: careTaskForm.comment.trim() || null,
            });
            setCareTaskForm(emptyCareTaskForm);
            toast.success('Задача добавлена');
            await loadPlant();
        } catch (taskError) {
            toast.error(taskError instanceof Error ? taskError.message : 'Не удалось сохранить задачу.');
        } finally {
            setSavingTask(false);
        }
    };

    const completeTask = async (task: GreenlogCareTask) => {
        try {
            await completeGreenlogCareTask(task.id);
            toast.success('Задача отмечена выполненной');
            await loadPlant();
        } catch (taskError) {
            toast.error(taskError instanceof Error ? taskError.message : 'Не удалось завершить задачу.');
        }
    };

    const savePlantCost = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setSavingCost(true);
            await updateGreenlogPlant(plantId, {
                unit_cost: unitCost.trim() === '' ? null : Number(unitCost),
            });
            toast.success('Стоимость растения обновлена');
            await loadPlant();
        } catch (costError) {
            toast.error(costError instanceof Error ? costError.message : 'Не удалось сохранить стоимость растения.');
        } finally {
            setSavingCost(false);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={plant?.name ?? 'Растение'} />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Ошибка загрузки</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                {loading ? (
                    <div className="flex min-h-[240px] items-center justify-center rounded-xl border">
                        <LoaderCircle className="text-muted-foreground h-6 w-6 animate-spin" />
                    </div>
                ) : null}

                {!loading && plant ? (
                    <>
                        <Card>
                            <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <CardTitle>{plant.name}</CardTitle>
                                    <CardDescription>Инвентарный номер {plant.inventory_number}</CardDescription>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge>{plant.category}</Badge>
                                    <Badge variant={plant.status === 'needs_care' ? 'secondary' : plant.status === 'written_off' ? 'destructive' : 'default'}>
                                        {plant.status}
                                    </Badge>
                                    <Button asChild variant="outline" size="sm">
                                        <Link href="/greenlog/plants">К списку растений</Link>
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <div>
                                    <div className="text-muted-foreground text-sm">Биологическое название</div>
                                    <div className="font-medium">{plant.biological_name || '—'}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-sm">Вид растения</div>
                                    <div className="font-medium">{plant.species?.name || '—'}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-sm">Количество</div>
                                    <div className="font-medium">{plant.quantity ?? 1}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-sm">Стоимость за единицу</div>
                                    <div className="font-medium">{greenlogMoneyLabel(plant.unit_cost)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-sm">Общая стоимость</div>
                                    <div className="font-medium">{greenlogMoneyLabel(plant.total_cost)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-sm">Источник стоимости</div>
                                    <div className="font-medium">{plantCostSourceLabel(plant.cost_source)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-sm">Локация</div>
                                    <div className="font-medium">{formatLocationLabel(plant)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-sm">Полив</div>
                                    <div className="font-medium">{plant.watering_frequency_days ? `${plant.watering_frequency_days} дн.` : '—'}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-sm">Подкормка</div>
                                    <div className="font-medium">{plant.fertilizing_frequency_days ? `${plant.fertilizing_frequency_days} дн.` : '—'}</div>
                                </div>
                                <div className="md:col-span-2 xl:col-span-4">
                                    <div className="text-muted-foreground text-sm">Примечание</div>
                                    <div className="font-medium whitespace-pre-wrap">{plant.notes || '—'}</div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Стоимость растения</CardTitle>
                                <CardDescription>Пустое значение вернет авторасчет по категории растения.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={savePlantCost}>
                                    <div className="flex-1 space-y-2">
                                        <Label htmlFor="unit-cost">Стоимость за единицу</Label>
                                        <Input
                                            id="unit-cost"
                                            min="0"
                                            step="0.01"
                                            type="number"
                                            value={unitCost}
                                            onChange={(event) => setUnitCost(event.target.value)}
                                        />
                                    </div>
                                    <Button disabled={savingCost} type="submit">
                                        {savingCost ? 'Сохранение...' : 'Сохранить стоимость'}
                                    </Button>
                                </form>
                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="rounded-lg border bg-muted/20 p-3">
                                        <div className="text-muted-foreground text-xs">Количество</div>
                                        <div className="font-medium">{plant.quantity ?? 1}</div>
                                    </div>
                                    <div className="rounded-lg border bg-muted/20 p-3">
                                        <div className="text-muted-foreground text-xs">Стоимость за единицу</div>
                                        <div className="font-medium">{greenlogMoneyLabel(plant.unit_cost)}</div>
                                    </div>
                                    <div className="rounded-lg border bg-muted/20 p-3">
                                        <div className="text-muted-foreground text-xs">Общая стоимость</div>
                                        <div className="font-medium">{greenlogMoneyLabel(plant.total_cost)}</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Фотографии</CardTitle>
                                <CardDescription>Загрузка и удаление фотографий через Laravel Storage.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <form className="flex flex-col gap-3 md:flex-row" onSubmit={uploadPhoto}>
                                    <Input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={(event) => {
                                            const file = event.target.files?.[0] ?? null;

                                            setSelectedFile(file);
                                            setFileError(file ? validateGreenlogPlantPhotoFile(file) : null);
                                        }}
                                    />
                                    <Button disabled={uploading} type="submit">
                                        <Upload className="h-4 w-4" />
                                        {uploading ? 'Загрузка...' : 'Загрузить'}
                                    </Button>
                                </form>
                                {fileError ? (
                                    <Alert variant="destructive">
                                        <AlertTitle>Неподдерживаемый файл</AlertTitle>
                                        <AlertDescription>{fileError}</AlertDescription>
                                    </Alert>
                                ) : null}
                                {plant.photos && plant.photos.length > 0 ? (
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {plant.photos.map((photo) => (
                                            <div key={photo.id} className="rounded-lg border p-3">
                                                {photo.url && isPreviewableGreenlogPhoto(photo) && !brokenPhotos[photo.id] ? (
                                                    <a href={photo.url} rel="noreferrer" target="_blank" className="block">
                                                        <img
                                                            alt={photo.original_name ?? plant.name}
                                                            className="h-48 w-full rounded-md object-cover"
                                                            src={photo.url}
                                                            onError={() => setBrokenPhotos((current) => ({ ...current, [photo.id]: true }))}
                                                        />
                                                    </a>
                                                ) : (
                                                    <div className="flex h-48 w-full items-center justify-center rounded-md border border-dashed bg-muted/30 px-4 text-center text-sm text-muted-foreground">
                                                        {brokenPhotos[photo.id] ? 'Фото недоступно' : photo.url ? 'Файл загружен, предпросмотр недоступен' : 'Ссылка на фото недоступна'}
                                                    </div>
                                                )}
                                                <div className="mt-3 flex items-center justify-between gap-3">
                                                    <div className="min-w-0 text-muted-foreground text-xs">
                                                        <div className="truncate">{photo.original_name ?? 'Без названия'}</div>
                                                        <div>{formatDateTime(photo.created_at)}</div>
                                                    </div>
                                                    <Button size="sm" variant="destructive" onClick={() => void removePhoto(photo)}>
                                                        Удалить
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">Фотографии пока не загружены.</div>
                                )}
                            </CardContent>
                        </Card>

                        <div className="grid gap-4 xl:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Расходы растения</CardTitle>
                                    <CardDescription>Быстрое добавление расходов, связанных с этим растением.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <form className="grid gap-3" onSubmit={submitExpense}>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="expense-category">Категория</Label>
                                                <select
                                                    id="expense-category"
                                                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                                                    value={expenseForm.category}
                                                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
                                                >
                                                    {expenseCategories.map((item) => (
                                                        <option key={item.value} value={item.value}>
                                                            {item.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="expense-amount">Сумма</Label>
                                                <Input
                                                    id="expense-amount"
                                                    min="0.01"
                                                    step="0.01"
                                                    type="number"
                                                    value={expenseForm.amount}
                                                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))}
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="expense-date">Дата</Label>
                                                <Input
                                                    id="expense-date"
                                                    type="date"
                                                    value={expenseForm.expense_date}
                                                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, expense_date: event.target.value }))}
                                                    required
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="expense-document">Документ</Label>
                                                <Input
                                                    id="expense-document"
                                                    value={expenseForm.document_number}
                                                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, document_number: event.target.value }))}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="expense-description">Описание</Label>
                                            <Textarea
                                                id="expense-description"
                                                rows={3}
                                                value={expenseForm.description}
                                                onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
                                                required
                                            />
                                        </div>
                                        <Button disabled={savingExpense} type="submit">
                                            {savingExpense ? 'Сохранение...' : 'Добавить расход'}
                                        </Button>
                                    </form>
                                    {plant.expenses && plant.expenses.length > 0 ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Дата</TableHead>
                                                    <TableHead>Категория</TableHead>
                                                    <TableHead>Сумма</TableHead>
                                                    <TableHead>Описание</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {plant.expenses.map((expense: GreenlogExpense) => (
                                                    <TableRow key={expense.id}>
                                                        <TableCell>{formatDateTime(expense.expense_date)}</TableCell>
                                                        <TableCell>{expense.category}</TableCell>
                                                        <TableCell>{expense.amount}</TableCell>
                                                        <TableCell>{expense.description}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">Расходы пока не добавлены.</div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Задачи ухода</CardTitle>
                                    <CardDescription>Создание задач и отметка выполнения прямо из карточки растения.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <form className="grid gap-3" onSubmit={submitCareTask}>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="task-type">Тип задачи</Label>
                                                <select
                                                    id="task-type"
                                                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                                                    value={careTaskForm.type}
                                                    onChange={(event) => setCareTaskForm((prev) => ({ ...prev, type: event.target.value }))}
                                                >
                                                    {careTaskTypes.map((item) => (
                                                        <option key={item.value} value={item.value}>
                                                            {item.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="task-due-at">Срок</Label>
                                                <Input
                                                    id="task-due-at"
                                                    type="datetime-local"
                                                    value={careTaskForm.due_at}
                                                    onChange={(event) => setCareTaskForm((prev) => ({ ...prev, due_at: event.target.value }))}
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="task-comment">Комментарий</Label>
                                            <Textarea
                                                id="task-comment"
                                                rows={3}
                                                value={careTaskForm.comment}
                                                onChange={(event) => setCareTaskForm((prev) => ({ ...prev, comment: event.target.value }))}
                                            />
                                        </div>
                                        <Button disabled={savingTask} type="submit">
                                            {savingTask ? 'Сохранение...' : 'Добавить задачу'}
                                        </Button>
                                    </form>
                                    {plant.care_tasks && plant.care_tasks.length > 0 ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Тип</TableHead>
                                                    <TableHead>Срок</TableHead>
                                                    <TableHead>Статус</TableHead>
                                                    <TableHead>Комментарий</TableHead>
                                                    <TableHead className="w-[140px]">Действия</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {plant.care_tasks.map((task: GreenlogCareTask) => (
                                                    <TableRow key={task.id}>
                                                        <TableCell>{task.type}</TableCell>
                                                        <TableCell>{formatDateTime(task.due_at)}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={task.status === 'done' ? 'default' : task.status === 'overdue' ? 'destructive' : 'secondary'}>
                                                                {task.status}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>{task.comment || '—'}</TableCell>
                                                        <TableCell>
                                                            {task.status !== 'done' ? (
                                                                <Button size="sm" variant="outline" onClick={() => void completeTask(task)}>
                                                                    Выполнено
                                                                </Button>
                                                            ) : (
                                                                <span className="text-muted-foreground text-xs">{formatDateTime(task.completed_at)}</span>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">Задачи пока не добавлены.</div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </>
                ) : null}
            </div>
        </AppLayout>
    );
}
