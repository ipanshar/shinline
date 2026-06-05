import AppLayout from '@/layouts/app-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
    completeGreenlogCareTask,
    createGreenlogCareTask,
    deleteGreenlogCareTask,
    getGreenlogCareTasks,
    getGreenlogPlants,
    getGreenlogTodayCareTasks,
    type GreenlogCareTask,
    type GreenlogPlant,
    updateGreenlogCareTask,
} from '@/lib/greenlog-api';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Shin Line Flora', href: '/greenlog' },
    { title: 'Задачи ухода', href: '/greenlog/care-tasks' },
];

const careTaskTypes = [
    { value: 'watering', label: 'Полив' },
    { value: 'fertilizing', label: 'Подкормка' },
    { value: 'treatment', label: 'Обработка' },
    { value: 'inspection', label: 'Осмотр' },
    { value: 'other', label: 'Другое' },
];

const careTaskStatuses = [
    { value: 'pending', label: 'В работе' },
    { value: 'done', label: 'Выполнено' },
    { value: 'overdue', label: 'Просрочено' },
];

type CareTaskForm = {
    plant_id: string;
    type: string;
    due_at: string;
    status: string;
    comment: string;
};

const emptyForm: CareTaskForm = {
    plant_id: 'none',
    type: 'watering',
    due_at: '',
    status: 'pending',
    comment: '',
};

const formatDateTime = (value?: string | null) => {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleString('ru-RU');
};

export default function GreenLogCareTasksIndex() {
    const [tasks, setTasks] = useState<GreenlogCareTask[]>([]);
    const [todayTasks, setTodayTasks] = useState<GreenlogCareTask[]>([]);
    const [plants, setPlants] = useState<GreenlogPlant[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [plantFilter, setPlantFilter] = useState('all');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<GreenlogCareTask | null>(null);
    const [form, setForm] = useState<CareTaskForm>(emptyForm);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);

            const [tasksData, todayData, plantsData] = await Promise.all([
                getGreenlogCareTasks({
                    plant_id: plantFilter !== 'all' ? Number(plantFilter) : undefined,
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    type: typeFilter !== 'all' ? typeFilter : undefined,
                }),
                getGreenlogTodayCareTasks(),
                getGreenlogPlants(),
            ]);

            setTasks(tasksData);
            setTodayTasks(todayData);
            setPlants(plantsData);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить задачи ухода.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, [statusFilter, typeFilter, plantFilter]);

    const resetDialog = () => {
        setEditingTask(null);
        setForm(emptyForm);
        setIsDialogOpen(false);
    };

    const openCreateDialog = () => {
        setEditingTask(null);
        setForm(emptyForm);
        setIsDialogOpen(true);
    };

    const openEditDialog = (task: GreenlogCareTask) => {
        setEditingTask(task);
        setForm({
            plant_id: task.plant_id ? String(task.plant_id) : 'none',
            type: task.type,
            due_at: task.due_at ? task.due_at.slice(0, 16) : '',
            status: task.status,
            comment: task.comment ?? '',
        });
        setIsDialogOpen(true);
    };

    const submitForm = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setSaving(true);
            const payload = {
                plant_id: form.plant_id === 'none' ? null : Number(form.plant_id),
                type: form.type,
                due_at: form.due_at,
                status: form.status,
                comment: form.comment.trim() || null,
            };

            if (editingTask) {
                await updateGreenlogCareTask(editingTask.id, payload);
                toast.success('Задача обновлена');
            } else {
                await createGreenlogCareTask(payload);
                toast.success('Задача создана');
            }

            resetDialog();
            await loadData();
        } catch (submitError) {
            toast.error(submitError instanceof Error ? submitError.message : 'Не удалось сохранить задачу.');
        } finally {
            setSaving(false);
        }
    };

    const completeTask = async (task: GreenlogCareTask) => {
        try {
            await completeGreenlogCareTask(task.id);
            toast.success('Задача отмечена выполненной');
            await loadData();
        } catch (completeError) {
            toast.error(completeError instanceof Error ? completeError.message : 'Не удалось завершить задачу.');
        }
    };

    const removeTask = async (task: GreenlogCareTask) => {
        if (!window.confirm('Удалить задачу?')) {
            return;
        }

        try {
            await deleteGreenlogCareTask(task.id);
            toast.success('Задача удалена');
            await loadData();
        } catch (deleteError) {
            toast.error(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить задачу.');
        }
    };

    const renderTable = (items: GreenlogCareTask[]) => {
        if (!loading && !error && items.length === 0) {
            return <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center">Задачи не найдены.</div>;
        }

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Растение</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead>Срок</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Комментарий</TableHead>
                        <TableHead className="w-[220px]">Действия</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((task) => (
                        <TableRow key={task.id}>
                            <TableCell>{task.plant?.name ?? '—'}</TableCell>
                            <TableCell>{careTaskTypes.find((item) => item.value === task.type)?.label ?? task.type}</TableCell>
                            <TableCell>{formatDateTime(task.due_at)}</TableCell>
                            <TableCell>
                                <Badge variant={task.status === 'done' ? 'default' : task.status === 'overdue' ? 'destructive' : 'secondary'}>
                                    {careTaskStatuses.find((item) => item.value === task.status)?.label ?? task.status}
                                </Badge>
                            </TableCell>
                            <TableCell>{task.comment || '—'}</TableCell>
                            <TableCell>
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" onClick={() => openEditDialog(task)}>
                                        <Pencil className="h-4 w-4" />
                                        Изменить
                                    </Button>
                                    {task.status !== 'done' ? (
                                        <Button size="sm" variant="outline" onClick={() => void completeTask(task)}>
                                            <Check className="h-4 w-4" />
                                            Выполнить
                                        </Button>
                                    ) : null}
                                    <Button size="sm" variant="destructive" onClick={() => void removeTask(task)}>
                                        <Trash2 className="h-4 w-4" />
                                        Удалить
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Задачи ухода" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <Card>
                    <CardHeader className="gap-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <CardTitle>Задачи ухода</CardTitle>
                                <CardDescription>Отдельный реестр всех задач с вкладкой на сегодня.</CardDescription>
                            </div>
                            <Button onClick={openCreateDialog}>
                                <Plus className="h-4 w-4" />
                                Добавить задачу
                            </Button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
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
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Тип" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все типы</SelectItem>
                                    {careTaskTypes.map((item) => (
                                        <SelectItem key={item.value} value={item.value}>
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Статус" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все статусы</SelectItem>
                                    {careTaskStatuses.map((item) => (
                                        <SelectItem key={item.value} value={item.value}>
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
                            </div>
                        ) : null}

                        {!loading ? (
                            <Tabs value={tab} onValueChange={setTab}>
                                <TabsList>
                                    <TabsTrigger value="all">Все задачи</TabsTrigger>
                                    <TabsTrigger value="today">На сегодня</TabsTrigger>
                                </TabsList>
                                <TabsContent value="all">{renderTable(tasks)}</TabsContent>
                                <TabsContent value="today">{renderTable(todayTasks)}</TabsContent>
                            </Tabs>
                        ) : null}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={(open) => (!open ? resetDialog() : setIsDialogOpen(open))}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{editingTask ? 'Редактирование задачи' : 'Новая задача'}</DialogTitle>
                        <DialogDescription>Задача ухода может быть связана с конкретным растением.</DialogDescription>
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
                                <Label>Тип</Label>
                                <Select value={form.type} onValueChange={(value) => setForm((prev) => ({ ...prev, type: value }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {careTaskTypes.map((item) => (
                                            <SelectItem key={item.value} value={item.value}>
                                                {item.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="due_at">Срок</Label>
                                <Input
                                    id="due_at"
                                    type="datetime-local"
                                    value={form.due_at}
                                    onChange={(event) => setForm((prev) => ({ ...prev, due_at: event.target.value }))}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Статус</Label>
                                <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {careTaskStatuses.map((item) => (
                                            <SelectItem key={item.value} value={item.value}>
                                                {item.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="comment">Комментарий</Label>
                            <Textarea id="comment" rows={4} value={form.comment} onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={resetDialog}>
                                Отмена
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving ? 'Сохранение...' : editingTask ? 'Сохранить' : 'Создать'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
