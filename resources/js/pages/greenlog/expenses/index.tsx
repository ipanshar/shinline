import AppLayout from '@/layouts/app-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
    createGreenlogExpense,
    deleteGreenlogExpense,
    getGreenlogExpenses,
    getGreenlogExpensesSummary,
    getGreenlogLocations,
    getGreenlogPlants,
    type GreenlogExpense,
    type GreenlogExpensesSummary,
    type GreenlogLocation,
    type GreenlogPlant,
    updateGreenlogExpense,
} from '@/lib/greenlog-api';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Shin Line Flora', href: '/greenlog' },
    { title: 'Расходы', href: '/greenlog/expenses' },
];

const expenseCategories = [
    { value: 'purchase', label: 'Покупка' },
    { value: 'pot', label: 'Горшок' },
    { value: 'fertilizer', label: 'Удобрение' },
    { value: 'soil', label: 'Грунт' },
    { value: 'watering', label: 'Полив' },
    { value: 'service', label: 'Сервис' },
    { value: 'other', label: 'Другое' },
];

type ExpenseForm = {
    plant_id: string;
    location_id: string;
    category: string;
    amount: string;
    expense_date: string;
    description: string;
    document_number: string;
};

const emptyForm: ExpenseForm = {
    plant_id: 'none',
    location_id: 'none',
    category: 'purchase',
    amount: '',
    expense_date: '',
    description: '',
    document_number: '',
};

const formatLocationLabel = (location?: Partial<GreenlogLocation> | null) =>
    [location?.building, location?.floor, location?.room, location?.factory_zone].filter(Boolean).join(' / ') || '—';

export default function GreenLogExpensesIndex() {
    const [expenses, setExpenses] = useState<GreenlogExpense[]>([]);
    const [summary, setSummary] = useState<GreenlogExpensesSummary | null>(null);
    const [plants, setPlants] = useState<GreenlogPlant[]>([]);
    const [locations, setLocations] = useState<GreenlogLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<GreenlogExpense | null>(null);
    const [form, setForm] = useState<ExpenseForm>(emptyForm);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [plantFilter, setPlantFilter] = useState('all');
    const [locationFilter, setLocationFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);

            const params = {
                category: categoryFilter !== 'all' ? categoryFilter : undefined,
                plant_id: plantFilter !== 'all' ? Number(plantFilter) : undefined,
                location_id: locationFilter !== 'all' ? Number(locationFilter) : undefined,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
            };

            const [expensesData, summaryData, plantsData, locationsData] = await Promise.all([
                getGreenlogExpenses(params),
                getGreenlogExpensesSummary(params),
                getGreenlogPlants(),
                getGreenlogLocations(),
            ]);

            setExpenses(expensesData);
            setSummary(summaryData);
            setPlants(plantsData);
            setLocations(locationsData);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить расходы Shin Line Flora.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, [categoryFilter, plantFilter, locationFilter, dateFrom, dateTo]);

    const resetDialog = () => {
        setIsDialogOpen(false);
        setEditingExpense(null);
        setForm(emptyForm);
    };

    const openCreateDialog = () => {
        setEditingExpense(null);
        setForm(emptyForm);
        setIsDialogOpen(true);
    };

    const openEditDialog = (expense: GreenlogExpense) => {
        setEditingExpense(expense);
        setForm({
            plant_id: expense.plant_id ? String(expense.plant_id) : 'none',
            location_id: expense.location_id ? String(expense.location_id) : 'none',
            category: expense.category,
            amount: expense.amount,
            expense_date: expense.expense_date.slice(0, 10),
            description: expense.description,
            document_number: expense.document_number ?? '',
        });
        setIsDialogOpen(true);
    };

    const submitForm = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setSaving(true);
            const payload = {
                plant_id: form.plant_id === 'none' ? null : Number(form.plant_id),
                location_id: form.location_id === 'none' ? null : Number(form.location_id),
                category: form.category,
                amount: form.amount,
                expense_date: form.expense_date,
                description: form.description.trim(),
                document_number: form.document_number.trim() || null,
            };

            if (editingExpense) {
                await updateGreenlogExpense(editingExpense.id, payload);
                toast.success('Расход обновлен');
            } else {
                await createGreenlogExpense(payload);
                toast.success('Расход создан');
            }

            resetDialog();
            await loadData();
        } catch (submitError) {
            toast.error(submitError instanceof Error ? submitError.message : 'Не удалось сохранить расход.');
        } finally {
            setSaving(false);
        }
    };

    const removeExpense = async (expense: GreenlogExpense) => {
        if (!window.confirm('Удалить расход?')) {
            return;
        }

        try {
            await deleteGreenlogExpense(expense.id);
            toast.success('Расход удален');
            await loadData();
        } catch (deleteError) {
            toast.error(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить расход.');
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Расходы" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <Card>
                    <CardHeader className="gap-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <CardTitle>Расходы</CardTitle>
                                <CardDescription>Фильтруемый реестр расходов с быстрым summary по категориям.</CardDescription>
                            </div>
                            <Button onClick={openCreateDialog}>
                                <Plus className="h-4 w-4" />
                                Добавить расход
                            </Button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Категория" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все категории</SelectItem>
                                    {expenseCategories.map((item) => (
                                        <SelectItem key={item.value} value={item.value}>
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={plantFilter} onValueChange={setPlantFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Растение" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все растения</SelectItem>
                                    {plants.map((plant) => (
                                        <SelectItem key={plant.id} value={String(plant.id)}>
                                            {plant.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={locationFilter} onValueChange={setLocationFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Локация" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все локации</SelectItem>
                                    {locations.map((location) => (
                                        <SelectItem key={location.id} value={String(location.id)}>
                                            {formatLocationLabel(location)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error ? (
                            <Alert variant="destructive">
                                <AlertTitle>Ошибка загрузки</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : null}

                        {summary ? (
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded-lg border p-4">
                                    <div className="text-muted-foreground text-sm">Количество</div>
                                    <div className="text-2xl font-semibold">{summary.totalCount}</div>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <div className="text-muted-foreground text-sm">Сумма</div>
                                    <div className="text-2xl font-semibold">{summary.totalAmount}</div>
                                </div>
                                {summary.byCategory.slice(0, 2).map((item) => (
                                    <div key={item.category} className="rounded-lg border p-4">
                                        <div className="text-muted-foreground text-sm">{item.category}</div>
                                        <div className="text-xl font-semibold">{item.amount}</div>
                                        <div className="text-muted-foreground text-xs">{item.count} записей</div>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {loading ? (
                            <div className="space-y-3">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : null}

                        {!loading && !error && expenses.length === 0 ? (
                            <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center">Расходы по текущим фильтрам не найдены.</div>
                        ) : null}

                        {!loading && !error && expenses.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Дата</TableHead>
                                        <TableHead>Категория</TableHead>
                                        <TableHead>Сумма</TableHead>
                                        <TableHead>Растение</TableHead>
                                        <TableHead>Локация</TableHead>
                                        <TableHead>Описание</TableHead>
                                        <TableHead className="w-[160px]">Действия</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {expenses.map((expense) => (
                                        <TableRow key={expense.id}>
                                            <TableCell>{expense.expense_date.slice(0, 10)}</TableCell>
                                            <TableCell>{expense.category}</TableCell>
                                            <TableCell>{expense.amount}</TableCell>
                                            <TableCell>{expense.plant?.name ?? '—'}</TableCell>
                                            <TableCell>{formatLocationLabel(expense.location)}</TableCell>
                                            <TableCell>{expense.description}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-2">
                                                    <Button size="sm" variant="outline" onClick={() => openEditDialog(expense)}>
                                                        <Pencil className="h-4 w-4" />
                                                        Изменить
                                                    </Button>
                                                    <Button size="sm" variant="destructive" onClick={() => void removeExpense(expense)}>
                                                        <Trash2 className="h-4 w-4" />
                                                        Удалить
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : null}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={(open) => (!open ? resetDialog() : setIsDialogOpen(open))}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingExpense ? 'Редактирование расхода' : 'Новый расход'}</DialogTitle>
                        <DialogDescription>Свяжите расход с растением, локацией или укажите оба поля.</DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={submitForm}>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Растение</Label>
                                <Select value={form.plant_id} onValueChange={(value) => setForm((prev) => ({ ...prev, plant_id: value }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Без растения" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Без растения</SelectItem>
                                        {plants.map((plant) => (
                                            <SelectItem key={plant.id} value={String(plant.id)}>
                                                {plant.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Локация</Label>
                                <Select value={form.location_id} onValueChange={(value) => setForm((prev) => ({ ...prev, location_id: value }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Без локации" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Без локации</SelectItem>
                                        {locations.map((location) => (
                                            <SelectItem key={location.id} value={String(location.id)}>
                                                {formatLocationLabel(location)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Категория</Label>
                                <Select value={form.category} onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {expenseCategories.map((item) => (
                                            <SelectItem key={item.value} value={item.value}>
                                                {item.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="amount">Сумма</Label>
                                <Input
                                    id="amount"
                                    min="0.01"
                                    step="0.01"
                                    type="number"
                                    value={form.amount}
                                    onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="expense_date">Дата</Label>
                                <Input
                                    id="expense_date"
                                    type="date"
                                    value={form.expense_date}
                                    onChange={(event) => setForm((prev) => ({ ...prev, expense_date: event.target.value }))}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="document_number">Документ</Label>
                                <Input
                                    id="document_number"
                                    value={form.document_number}
                                    onChange={(event) => setForm((prev) => ({ ...prev, document_number: event.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="expense_description">Описание</Label>
                            <Textarea
                                id="expense_description"
                                rows={4}
                                value={form.description}
                                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                                required
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={resetDialog}>
                                Отмена
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving ? 'Сохранение...' : editingExpense ? 'Сохранить' : 'Создать'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
