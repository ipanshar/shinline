import AppLayout from '@/layouts/app-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    getGreenlogExpensesFinancialReport,
    getGreenlogLocations,
    getGreenlogPlants,
    getGreenlogPlantsInventoryReport,
    type GreenlogExpensesFinancialReport,
    type GreenlogLocation,
    type GreenlogPlant,
    type GreenlogPlantsInventoryReport,
} from '@/lib/greenlog-api';
import { expenseCategoryLabel, expenseCategoryLabels, greenlogMoneyLabel, locationLabel, plantCategoryLabel, plantCategoryLabels, plantCostSourceLabel, plantStatusLabel, plantStatusLabels } from '@/lib/greenlog-labels';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Download, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Shin Line Flora', href: '/greenlog' },
    { title: 'Отчеты', href: '/greenlog/reports' },
];

export default function GreenLogReportsIndex() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [locations, setLocations] = useState<GreenlogLocation[]>([]);
    const [plants, setPlants] = useState<GreenlogPlant[]>([]);
    const [plantsInventory, setPlantsInventory] = useState<GreenlogPlantsInventoryReport | null>(null);
    const [expensesFinancial, setExpensesFinancial] = useState<GreenlogExpensesFinancialReport | null>(null);
    const [locationFilter, setLocationFilter] = useState('all');
    const [plantFilter, setPlantFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const inventoryParams = useMemo(
        () => ({
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            category: categoryFilter !== 'all' ? categoryFilter : undefined,
            location_id: locationFilter !== 'all' ? Number(locationFilter) : undefined,
            plant_id: plantFilter !== 'all' ? Number(plantFilter) : undefined,
            status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        [dateFrom, dateTo, categoryFilter, locationFilter, plantFilter, statusFilter],
    );

    const expensesParams = useMemo(
        () => ({
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            category: expenseCategoryFilter !== 'all' ? expenseCategoryFilter : undefined,
            location_id: locationFilter !== 'all' ? Number(locationFilter) : undefined,
            plant_id: plantFilter !== 'all' ? Number(plantFilter) : undefined,
            status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        [dateFrom, dateTo, expenseCategoryFilter, locationFilter, plantFilter, statusFilter],
    );

    const loadReports = async () => {
        try {
            setLoading(true);
            setError(null);

            const [locationsData, plantsData, plantsInventoryData, expensesFinancialData] = await Promise.all([
                getGreenlogLocations(),
                getGreenlogPlants(),
                getGreenlogPlantsInventoryReport(inventoryParams),
                getGreenlogExpensesFinancialReport(expensesParams),
            ]);

            setLocations(locationsData);
            setPlants(plantsData);
            setPlantsInventory(plantsInventoryData);
            setExpensesFinancial(expensesFinancialData);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить отчеты Shin Line Flora.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadReports();
    }, [inventoryParams, expensesParams]);

    const buildExportUrl = (path: string, params: Record<string, string | number | undefined>) => {
        const url = new URL(path, window.location.origin);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== '') {
                url.searchParams.set(key, String(value));
            }
        });

        return url.toString();
    };

    const exportPlantsInventory = () => {
        toast.success('Готовим Excel-ведомость растений');
        window.location.href = buildExportUrl('/api/greenlog/reports/plants-inventory/export-xlsx', inventoryParams);
    };

    const exportExpensesSummary = () => {
        toast.success('Готовим Excel-финансовый отчет');
        window.location.href = buildExportUrl('/api/greenlog/reports/expenses-summary/export-xlsx', expensesParams);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Отчеты" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <Card>
                    <CardHeader className="gap-4">
                        <div>
                            <CardTitle>Отчеты</CardTitle>
                            <CardDescription>Ведомость растений и финансовый отчет по расходам с едиными фильтрами и Excel-выгрузкой.</CardDescription>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                            <Select value={locationFilter} onValueChange={setLocationFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Локация" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все локации</SelectItem>
                                    {locations.map((location) => (
                                        <SelectItem key={location.id} value={String(location.id)}>
                                            {locationLabel(location)}
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
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Категория растений" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все категории растений</SelectItem>
                                    {Object.entries(plantCategoryLabels).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Статус растений" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все статусы растений</SelectItem>
                                    {Object.entries(plantStatusLabels).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={expenseCategoryFilter} onValueChange={setExpenseCategoryFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Категория расходов" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все категории расходов</SelectItem>
                                    {Object.entries(expenseCategoryLabels).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => void loadReports()}>
                                <RefreshCw className="h-4 w-4" />
                                Обновить отчеты
                            </Button>
                            <Button variant="outline" onClick={exportPlantsInventory}>
                                <Download className="h-4 w-4" />
                                Экспорт ведомости растений
                            </Button>
                            <Button variant="outline" onClick={exportExpensesSummary}>
                                <Download className="h-4 w-4" />
                                Экспорт финансового отчета
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error ? (
                            <Alert variant="destructive">
                                <AlertTitle>Ошибка загрузки</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : null}

                        {loading ? (
                            <div className="space-y-3">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : null}

                        {!loading && plantsInventory ? (
                            <Card className="py-0">
                                <CardHeader>
                                    <CardTitle>Ведомость растений</CardTitle>
                                    <CardDescription>
                                        Всего записей: {plantsInventory.totalCount}. Общая стоимость: {greenlogMoneyLabel(plantsInventory.totalCost)}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pb-6">
                                    <div className="grid gap-3 md:grid-cols-3">
                                        <div className="rounded-lg border p-4">
                                            <div className="text-muted-foreground text-sm">Общая стоимость растений</div>
                                            <div className="mt-2 text-2xl font-semibold">{greenlogMoneyLabel(plantsInventory.totalCost)}</div>
                                            <div className="text-muted-foreground text-xs">{plantsInventory.totalCount} записей</div>
                                        </div>
                                        <div className="rounded-lg border p-4 md:col-span-2">
                                            <div className="text-sm font-medium">Стоимость по локациям</div>
                                            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                                {plantsInventory.byLocation.length > 0 ? (
                                                    plantsInventory.byLocation.map((item) => (
                                                        <div key={`${item.location_id ?? 'none'}-${item.label}`} className="rounded-md border bg-muted/20 p-3">
                                                            <div className="text-muted-foreground text-xs">{item.label}</div>
                                                            <div className="mt-1 text-base font-semibold">{greenlogMoneyLabel(item.totalCost)}</div>
                                                            <div className="text-muted-foreground text-xs">{item.count} растений</div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center md:col-span-2 xl:col-span-3">
                                                        Нет данных для расчета стоимости по локациям.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border p-4 md:col-span-3">
                                            <div className="text-sm font-medium">Стоимость по категориям</div>
                                            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                                {plantsInventory.byCategory.length > 0 ? (
                                                    plantsInventory.byCategory.map((item) => (
                                                        <div key={item.category} className="rounded-md border bg-muted/20 p-3">
                                                            <div className="text-muted-foreground text-xs">{plantCategoryLabel(item.category)}</div>
                                                            <div className="mt-1 text-base font-semibold">{greenlogMoneyLabel(item.totalCost)}</div>
                                                            <div className="text-muted-foreground text-xs">{item.count} растений</div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center md:col-span-2 xl:col-span-4">
                                                        Нет данных для расчета стоимости по категориям.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {plantsInventory.items.length > 0 ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Инвентарный номер</TableHead>
                                                    <TableHead>Название</TableHead>
                                                    <TableHead>Категория</TableHead>
                                                    <TableHead>Статус</TableHead>
                                                    <TableHead>Локация</TableHead>
                                                    <TableHead>Количество</TableHead>
                                                    <TableHead>Стоимость за ед.</TableHead>
                                                    <TableHead>Общая стоимость</TableHead>
                                                    <TableHead>Источник</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {plantsInventory.items.map((plant) => (
                                                    <TableRow key={plant.id}>
                                                        <TableCell>{plant.inventory_number}</TableCell>
                                                        <TableCell>{plant.name}</TableCell>
                                                        <TableCell>{plantCategoryLabel(plant.category)}</TableCell>
                                                        <TableCell>{plantStatusLabel(plant.status)}</TableCell>
                                                        <TableCell>{locationLabel(plant.location)}</TableCell>
                                                        <TableCell>{plant.quantity ?? 1}</TableCell>
                                                        <TableCell>{greenlogMoneyLabel(plant.unit_cost)}</TableCell>
                                                        <TableCell>{greenlogMoneyLabel(plant.total_cost)}</TableCell>
                                                        <TableCell>{plantCostSourceLabel(plant.cost_source)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
                                            По текущим фильтрам растения не найдены.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ) : null}

                        {!loading && expensesFinancial ? (
                            <Card className="py-0">
                                <CardHeader>
                                    <CardTitle>Финансовый отчет по расходам</CardTitle>
                                    <CardDescription>
                                        Всего записей: {expensesFinancial.totalCount}. Общая сумма: {expensesFinancial.totalAmount}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4 pb-6">
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        {expensesFinancial.byCategory.length > 0 ? (
                                            expensesFinancial.byCategory.map((item) => (
                                                <div key={item.category} className="rounded-lg border p-4">
                                                    <div className="text-muted-foreground text-sm">{expenseCategoryLabel(item.category)}</div>
                                                    <div className="mt-2 text-2xl font-semibold">{item.amount}</div>
                                                    <div className="text-muted-foreground text-xs">{item.count} записей</div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center xl:col-span-4">
                                                Расходы по текущим фильтрам не найдены.
                                            </div>
                                        )}
                                    </div>

                                    {expensesFinancial.items.length > 0 ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Дата</TableHead>
                                                    <TableHead>Категория</TableHead>
                                                    <TableHead>Сумма</TableHead>
                                                    <TableHead>Растение</TableHead>
                                                    <TableHead>Локация</TableHead>
                                                    <TableHead>Документ</TableHead>
                                                    <TableHead>Описание</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {expensesFinancial.items.map((expense) => (
                                                    <TableRow key={expense.id}>
                                                        <TableCell>{expense.expense_date.slice(0, 10)}</TableCell>
                                                        <TableCell>{expenseCategoryLabel(expense.category)}</TableCell>
                                                        <TableCell>{expense.amount}</TableCell>
                                                        <TableCell>{expense.plant?.name ?? '—'}</TableCell>
                                                        <TableCell>{locationLabel(expense.location)}</TableCell>
                                                        <TableCell>{expense.document_number ?? '—'}</TableCell>
                                                        <TableCell>{expense.description}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : null}
                                </CardContent>
                            </Card>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
