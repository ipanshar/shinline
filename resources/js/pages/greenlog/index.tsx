import AppLayout from '@/layouts/app-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getGreenlogDashboardSummary, type GreenlogDashboardSummary } from '@/lib/greenlog-api';
import { careTaskStatusLabel, careTaskTypeLabel, locationLabel, plantStatusLabel } from '@/lib/greenlog-labels';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Shin Line Flora',
        href: '/greenlog',
    },
];

const formatDateTime = (value?: string | null) => {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleString('ru-RU');
};

const formatMetricValue = (value: number | string | null | undefined) => {
    if (value === null || value === undefined || value === '') {
        return '—';
    }

    const numericValue = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));

    if (!Number.isFinite(numericValue)) {
        return '—';
    }

    return new Intl.NumberFormat('ru-RU', {
        maximumFractionDigits: 0,
    }).format(numericValue);
};

export default function GreenLogIndex() {
    const [summary, setSummary] = useState<GreenlogDashboardSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const loadDashboard = async () => {
            try {
                setLoading(true);
                setError(null);
                const data = await getGreenlogDashboardSummary();

                if (isMounted) {
                    setSummary(data);
                }
            } catch (loadError) {
                if (isMounted) {
                    setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить данные Shin Line Flora.');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void loadDashboard();

        return () => {
            isMounted = false;
        };
    }, []);

    const plantsByStatus = useMemo(() => summary?.plantsByStatus ?? [], [summary]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Shin Line Flora" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Shin Line Flora</CardTitle>
                        <CardDescription>Сводка по растениям, задачам ухода и расходам за текущий месяц.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error ? (
                            <Alert variant="destructive">
                                <AlertTitle>Ошибка загрузки</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : null}

                        {loading ? (
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                                {Array.from({ length: 5 }).map((_, index) => (
                                    <Skeleton key={index} className="h-28 w-full" />
                                ))}
                            </div>
                        ) : null}

                        {!loading && summary ? (
                            <>
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-xl border p-4">
                                        <div className="text-muted-foreground text-sm">Видов растений</div>
                                        <div className="mt-2 text-3xl font-semibold">{formatMetricValue(summary.plantSpeciesCount)}</div>
                                    </div>
                                    <div className="rounded-xl border p-4">
                                        <div className="text-muted-foreground text-sm">Общее количество растений</div>
                                        <div className="mt-2 text-3xl font-semibold">{formatMetricValue(summary.totalPlants)}</div>
                                    </div>
                                    <div className="rounded-xl border p-4">
                                        <div className="text-muted-foreground text-sm">Локаций</div>
                                        <div className="mt-2 text-3xl font-semibold">{formatMetricValue(summary.locationsCount)}</div>
                                    </div>
                                    <div className="rounded-xl border p-4">
                                        <div className="text-muted-foreground text-sm">Стоимость фонда</div>
                                        <div className="mt-2 text-3xl font-semibold">{formatMetricValue(summary.fundValue)}</div>
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-xl border p-4">
                                        <div className="text-muted-foreground text-sm">Задачи на сегодня</div>
                                        <div className="mt-2 text-3xl font-semibold">{formatMetricValue(summary.todayTasksCount)}</div>
                                    </div>
                                    <div className="rounded-xl border p-4">
                                        <div className="text-muted-foreground text-sm">Просроченные задачи</div>
                                        <div className="mt-2 text-3xl font-semibold">{formatMetricValue(summary.overdueTasksCount)}</div>
                                    </div>
                                    <div className="rounded-xl border p-4 md:col-span-2">
                                        <div className="text-muted-foreground text-sm">Расходы за текущий месяц</div>
                                        <div className="mt-2 text-3xl font-semibold">{formatMetricValue(summary.currentMonthExpensesTotal)}</div>
                                    </div>
                                </div>

                                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                                    <Card className="py-0">
                                        <CardHeader>
                                            <CardTitle>Растения по статусам</CardTitle>
                                        </CardHeader>
                                        <CardContent className="grid gap-3 pb-6 md:grid-cols-3">
                                            {plantsByStatus.length > 0 ? (
                                                plantsByStatus.map((item) => (
                                                    <div key={item.status} className="rounded-lg border p-4">
                                                        <div className="text-muted-foreground text-sm">{plantStatusLabel(item.status)}</div>
                                                        <div className="mt-2 text-2xl font-semibold">{item.count}</div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center md:col-span-3">
                                                    Статусы растений пока не сформированы.
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <Card className="py-0">
                                        <CardHeader>
                                            <CardTitle>Последние добавленные растения</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3 pb-6">
                                            {summary.latestPlants.length > 0 ? (
                                                summary.latestPlants.map((plant) => (
                                                    <div key={plant.id} className="rounded-lg border p-3">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div>
                                                                <div className="font-medium">{plant.name}</div>
                                                                <div className="text-muted-foreground text-xs">{plant.inventory_number}</div>
                                                            </div>
                                                            <Badge>{plantStatusLabel(plant.status)}</Badge>
                                                        </div>
                                                        <div className="text-muted-foreground mt-2 text-xs">{locationLabel(plant.location)}</div>
                                                        <div className="mt-3">
                                                            <Link className="text-sm underline underline-offset-4" href={`/greenlog/plants/${plant.id}`}>
                                                                Открыть карточку
                                                            </Link>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
                                                    Растения пока не добавлены.
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="grid gap-4 xl:grid-cols-2">
                                    <Card className="py-0">
                                        <CardHeader>
                                            <CardTitle>Задачи на сегодня</CardTitle>
                                        </CardHeader>
                                        <CardContent className="pb-6">
                                            {summary.todayTasks.length > 0 ? (
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Растение</TableHead>
                                                            <TableHead>Тип</TableHead>
                                                            <TableHead>Срок</TableHead>
                                                            <TableHead>Статус</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {summary.todayTasks.map((task) => (
                                                            <TableRow key={task.id}>
                                                                <TableCell>{task.plant?.name ?? '—'}</TableCell>
                                                                <TableCell>{careTaskTypeLabel(task.type)}</TableCell>
                                                                <TableCell>{formatDateTime(task.due_at)}</TableCell>
                                                                <TableCell>
                                                                    <Badge variant={task.status === 'done' ? 'default' : 'secondary'}>{careTaskStatusLabel(task.status)}</Badge>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            ) : (
                                                <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
                                                    На сегодня задач нет.
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <Card className="py-0">
                                        <CardHeader>
                                            <CardTitle>Просроченные задачи</CardTitle>
                                        </CardHeader>
                                        <CardContent className="pb-6">
                                            {summary.overdueTasks.length > 0 ? (
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Растение</TableHead>
                                                            <TableHead>Тип</TableHead>
                                                            <TableHead>Срок</TableHead>
                                                            <TableHead>Статус</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {summary.overdueTasks.map((task) => (
                                                            <TableRow key={task.id}>
                                                                <TableCell>{task.plant?.name ?? '—'}</TableCell>
                                                                <TableCell>{careTaskTypeLabel(task.type)}</TableCell>
                                                                <TableCell>{formatDateTime(task.due_at)}</TableCell>
                                                                <TableCell>
                                                                    <Badge variant="destructive">{careTaskStatusLabel(task.status)}</Badge>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            ) : (
                                                <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
                                                    Просроченных задач нет.
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                            </>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
