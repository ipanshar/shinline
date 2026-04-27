import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
    CheckCircle2,
    CircleX,
    LogIn,
    LogOut,
    Pencil,
    Plus,
    RefreshCw,
    Search,
} from 'lucide-react';

interface Yard {
    id: number;
    name: string;
}

interface GuestVisitVehicle {
    id?: number;
    truck_id?: number | null;
    plate_number: string;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    comment?: string | null;
}

interface GuestVisit {
    id: number;
    yard_id: number;
    guest_full_name: string;
    guest_iin: string | null;
    guest_company_name: string | null;
    guest_position: string;
    guest_phone: string;
    host_name: string;
    host_phone: string;
    visit_starts_at: string;
    visit_ends_at: string | null;
    permit_kind: 'one_time' | 'multi_time';
    workflow_status: 'active' | 'closed' | 'canceled';
    has_vehicle: boolean;
    comment: string | null;
    last_entry_at: string | null;
    last_exit_at: string | null;
    yard?: Yard;
    vehicles: GuestVisitVehicle[];
    permit_links?: Array<{
        id: number;
        entry_permit_id: number | null;
        permit_subject_type: 'person' | 'vehicle';
        guest_visit_vehicle_id: number | null;
        revoked_at: string | null;
        entry_permit?: {
            id: number;
            status?: {
                id: number;
                name: string;
                key: string;
            } | null;
        } | null;
    }>;
}

interface Pagination {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
}

interface FormData {
    id?: number;
    yard_id: string;
    guest_full_name: string;
    guest_iin: string;
    guest_company_name: string;
    guest_position: string;
    guest_phone: string;
    host_name: string;
    host_phone: string;
    visit_starts_at: string;
    visit_ends_at: string;
    permit_kind: 'one_time' | 'multi_time';
    comment: string;
    vehicles: GuestVisitVehicle[];
}

const emptyVehicle = (): GuestVisitVehicle => ({
    plate_number: '',
    brand: '',
    model: '',
    color: '',
    comment: '',
});

const emptyForm = (): FormData => ({
    yard_id: '',
    guest_full_name: '',
    guest_iin: '',
    guest_company_name: '',
    guest_position: '',
    guest_phone: '',
    host_name: '',
    host_phone: '',
    visit_starts_at: '',
    visit_ends_at: '',
    permit_kind: 'one_time',
    comment: '',
    vehicles: [],
});

const formatDateTime = (value: string | null | undefined) => {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleString('ru-RU');
};

const toDateTimeLocalValue = (value: string | null | undefined) => {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

    return localDate.toISOString().slice(0, 16);
};

const getGuestVisitValidationMessage = (error: any) => {
    const responseData = error?.response?.data;
    const validationErrors = responseData?.errors;

    if (validationErrors && typeof validationErrors === 'object') {
        const messages = Object.values(validationErrors)
            .flat()
            .filter((message): message is string => typeof message === 'string' && message.trim() !== '');

        if (messages.length > 0) {
            return messages[0];
        }
    }

    return responseData?.message || 'Не удалось сохранить гостевой визит';
};

const GuestVisitsManager: React.FC = () => {
    const [guestVisits, setGuestVisits] = useState<GuestVisit[]>([]);
    const [yards, setYards] = useState<Yard[]>([]);
    const [pagination, setPagination] = useState<Pagination>({
        current_page: 1,
        last_page: 1,
        per_page: 20,
        total: 0,
        from: null,
        to: null,
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedVisit, setSelectedVisit] = useState<GuestVisit | null>(null);
    const [formData, setFormData] = useState<FormData>(emptyForm);
    const [search, setSearch] = useState('');
    const [yardId, setYardId] = useState<string>('all');
    const [workflowStatus, setWorkflowStatus] = useState<string>('all');
    const [permitKind, setPermitKind] = useState<string>('all');
    const [hasVehicle, setHasVehicle] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const token = localStorage.getItem('auth_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const fetchYards = async () => {
        try {
            const response = await axios.post('/yard/getyards', {}, { headers });
            if (response.data.status) {
                setYards(response.data.data || []);
            }
        } catch (error) {
            console.error('Ошибка загрузки дворов', error);
        }
    };

    const fetchGuestVisits = async (
        page = currentPage,
        overrides?: Partial<{
            search: string;
            yardId: string;
            workflowStatus: string;
            permitKind: string;
            hasVehicle: string;
            dateFrom: string;
            dateTo: string;
        }>
    ) => {
        setLoading(true);
        try {
            const response = await axios.post(
                '/security/guest-visits/list',
                {
                    page,
                    per_page: pagination.per_page,
                    search: (overrides?.search ?? search).trim() || undefined,
                    yard_id: (overrides?.yardId ?? yardId) !== 'all' ? Number(overrides?.yardId ?? yardId) : undefined,
                    workflow_status: overrides?.workflowStatus ?? workflowStatus,
                    permit_kind: overrides?.permitKind ?? permitKind,
                    has_vehicle: overrides?.hasVehicle ?? hasVehicle,
                    date_from: (overrides?.dateFrom ?? dateFrom) || undefined,
                    date_to: (overrides?.dateTo ?? dateTo) || undefined,
                },
                { headers }
            );

            if (response.data.status) {
                setGuestVisits(response.data.data || []);
                setPagination(response.data.pagination || pagination);
                setCurrentPage(page);
            }
        } catch (error) {
            console.error('Ошибка загрузки гостевых визитов', error);
            toast.error('Не удалось загрузить список гостей');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchYards();
        fetchGuestVisits(1);
    }, []);

    const openCreateDialog = () => {
        setSelectedVisit(null);
        setFormData({
            ...emptyForm(),
            visit_starts_at: toDateTimeLocalValue(new Date().toISOString()),
        });
        setDialogOpen(true);
    };

    const openEditDialog = (visit: GuestVisit) => {
        setSelectedVisit(visit);
        setFormData({
            id: visit.id,
            yard_id: String(visit.yard_id),
            guest_full_name: visit.guest_full_name,
            guest_iin: visit.guest_iin || '',
            guest_company_name: visit.guest_company_name || '',
            guest_position: visit.guest_position,
            guest_phone: visit.guest_phone,
            host_name: visit.host_name,
            host_phone: visit.host_phone,
            visit_starts_at: toDateTimeLocalValue(visit.visit_starts_at),
            visit_ends_at: toDateTimeLocalValue(visit.visit_ends_at),
            permit_kind: visit.permit_kind,
            comment: visit.comment || '',
            vehicles: (visit.vehicles || []).map((vehicle) => ({ ...vehicle })),
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.yard_id) {
            toast.error('Выберите двор');
            return;
        }

        const requiredFieldChecks = [
            { value: formData.guest_full_name, message: 'Укажите ФИО гостя' },
            { value: formData.guest_position, message: 'Укажите должность гостя' },
            { value: formData.guest_phone, message: 'Укажите телефон гостя' },
            { value: formData.host_name, message: 'Укажите встречающую сторону' },
            { value: formData.host_phone, message: 'Укажите телефон встречающего' },
            { value: formData.visit_starts_at, message: 'Укажите время начала визита' },
        ];

        const missingRequiredField = requiredFieldChecks.find(({ value }) => value.trim() === '');

        if (missingRequiredField) {
            toast.error(missingRequiredField.message);
            return;
        }

        if (formData.permit_kind === 'multi_time' && formData.visit_ends_at.trim() === '') {
            toast.error('Для многоразового гостевого пропуска укажите время окончания визита');
            return;
        }

        setSaving(true);

        try {
            const payload = {
                ...formData,
                yard_id: Number(formData.yard_id),
                guest_full_name: formData.guest_full_name.trim(),
                guest_iin: formData.guest_iin.trim() || null,
                guest_company_name: formData.guest_company_name.trim() || null,
                guest_position: formData.guest_position.trim(),
                guest_phone: formData.guest_phone.trim(),
                host_name: formData.host_name.trim(),
                host_phone: formData.host_phone.trim(),
                visit_ends_at: formData.visit_ends_at || null,
                comment: formData.comment.trim() || null,
                vehicles: formData.vehicles.filter((vehicle) => vehicle.plate_number.trim() !== ''),
            };

            const url = selectedVisit ? '/security/guest-visits/update' : '/security/guest-visits/create';
            const response = await axios.post(url, payload, { headers });

            if (response.data.status) {
                toast.success(selectedVisit ? 'Гостевой визит обновлён' : 'Гостевой визит создан');
                setDialogOpen(false);
                await fetchGuestVisits(selectedVisit ? currentPage : 1);
            }
        } catch (error: any) {
            console.error('Ошибка сохранения гостевого визита', error);
            toast.error(getGuestVisitValidationMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const handleStatusAction = async (id: number, action: 'close' | 'cancel') => {
        try {
            const response = await axios.post(`/security/guest-visits/${action}`, { id }, { headers });
            if (response.data.status) {
                toast.success(action === 'close' ? 'Визит закрыт' : 'Визит отменён');
                fetchGuestVisits(currentPage);
            }
        } catch (error: any) {
            console.error(`Ошибка действия ${action}`, error);
            toast.error(error.response?.data?.message || 'Не удалось изменить статус визита');
        }
    };

    const handlePresenceAction = async (id: number, action: 'check-in' | 'check-out') => {
        try {
            const response = await axios.post(`/security/guest-visits/${action}`, { id }, { headers });
            if (response.data.status) {
                toast.success(action === 'check-in' ? 'Приход гостя отмечен' : 'Уход гостя отмечен');
                fetchGuestVisits(currentPage);
            }
        } catch (error: any) {
            console.error(`Ошибка действия ${action}`, error);
            toast.error(error.response?.data?.message || 'Не удалось отметить присутствие гостя');
        }
    };

    const handlePermitAction = async (id: number, action: 'issue' | 'revoke') => {
        try {
            const response = await axios.post(
                action === 'issue' ? '/security/guest-visits/issue-permits' : '/security/guest-visits/revoke-permits',
                { id },
                { headers }
            );

            if (response.data.status) {
                toast.success(action === 'issue' ? 'Пропуска выпущены' : 'Пропуска отозваны');
                fetchGuestVisits(currentPage);
            }
        } catch (error: any) {
            console.error(`Ошибка действия ${action} permits`, error);
            toast.error(error.response?.data?.message || 'Не удалось выполнить операцию с пропусками');
        }
    };

    const updateVehicle = (index: number, field: keyof GuestVisitVehicle, value: string) => {
        setFormData((prev) => {
            const vehicles = [...prev.vehicles];
            vehicles[index] = { ...vehicles[index], [field]: value };
            return { ...prev, vehicles };
        });
    };

    const addVehicle = () => {
        setFormData((prev) => ({ ...prev, vehicles: [...prev.vehicles, emptyVehicle()] }));
    };

    const removeVehicle = (index: number) => {
        setFormData((prev) => ({
            ...prev,
            vehicles: prev.vehicles.filter((_, vehicleIndex) => vehicleIndex !== index),
        }));
    };

    const resetFilters = () => {
        setSearch('');
        setYardId('all');
        setWorkflowStatus('all');
        setPermitKind('all');
        setHasVehicle('all');
        setDateFrom('');
        setDateTo('');
        fetchGuestVisits(1, {
            search: '',
            yardId: 'all',
            workflowStatus: 'all',
            permitKind: 'all',
            hasVehicle: 'all',
            dateFrom: '',
            dateTo: '',
        });
    };

    return (
        <div className="space-y-4">
            <Card className="p-4 space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-2xl font-semibold tracking-tight">Гости</h2>
                        <p className="text-sm text-muted-foreground">
                            Отдельный реестр гостевых визитов без смешивания с транспортными разрешениями.
                        </p>
                    </div>
                    <Button onClick={openCreateDialog} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Новый гостевой визит
                    </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2 xl:col-span-2">
                        <Label>Поиск</Label>
                        <div className="flex gap-2">
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="ФИО, ИИН, компания, встречающий..."
                            />
                            <Button variant="outline" size="icon" onClick={() => fetchGuestVisits(1)}>
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Двор</Label>
                        <Select value={yardId} onValueChange={setYardId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Все дворы" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Все дворы</SelectItem>
                                {yards.map((yard) => (
                                    <SelectItem key={yard.id} value={String(yard.id)}>
                                        {yard.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Статус</Label>
                        <Select value={workflowStatus} onValueChange={setWorkflowStatus}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Все</SelectItem>
                                <SelectItem value="active">Активные</SelectItem>
                                <SelectItem value="closed">Закрытые</SelectItem>
                                <SelectItem value="canceled">Отменённые</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Тип пропуска</Label>
                        <Select value={permitKind} onValueChange={setPermitKind}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Все</SelectItem>
                                <SelectItem value="one_time">Разовый</SelectItem>
                                <SelectItem value="multi_time">Многоразовый</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>ТС</Label>
                        <Select value={hasVehicle} onValueChange={setHasVehicle}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Все</SelectItem>
                                <SelectItem value="true">С ТС</SelectItem>
                                <SelectItem value="false">Без ТС</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>С даты</Label>
                        <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                    </div>

                    <div className="space-y-2">
                        <Label>По дату</Label>
                        <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => fetchGuestVisits(1)} className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Обновить
                    </Button>
                    <Button variant="ghost" onClick={resetFilters}>
                        Сбросить фильтры
                    </Button>
                </div>
            </Card>

            <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="px-4 py-3 text-left font-medium">Гость</th>
                            <th className="px-4 py-3 text-left font-medium">Компания / Должность</th>
                            <th className="px-4 py-3 text-left font-medium">Встречает</th>
                            <th className="px-4 py-3 text-left font-medium">Двор</th>
                            <th className="px-4 py-3 text-left font-medium">Период</th>
                            <th className="px-4 py-3 text-left font-medium">Тип</th>
                            <th className="px-4 py-3 text-left font-medium">ТС</th>
                            <th className="px-4 py-3 text-left font-medium">Статус</th>
                            <th className="px-4 py-3 text-left font-medium">На территории</th>
                            <th className="px-4 py-3 text-right font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Загрузка гостевых визитов...</td>
                            </tr>
                        ) : guestVisits.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">По выбранным фильтрам записи не найдены.</td>
                            </tr>
                        ) : (
                            guestVisits.map((visit) => {
                                const isActive = visit.workflow_status === 'active';

                                return (
                                    <tr key={visit.id} className="border-b hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{visit.guest_full_name}</div>
                                            {visit.guest_iin && (
                                                <div className="text-xs text-muted-foreground">ИИН: {visit.guest_iin}</div>
                                            )}
                                            <div className="text-xs text-muted-foreground">{visit.guest_phone}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {visit.guest_company_name && <div>{visit.guest_company_name}</div>}
                                            <div className="text-muted-foreground">{visit.guest_position}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div>{visit.host_name}</div>
                                            <div className="text-xs text-muted-foreground">{visit.host_phone}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {visit.yard?.name || `Двор #${visit.yard_id}`}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                                            <div>{formatDateTime(visit.visit_starts_at)}</div>
                                            {visit.visit_ends_at && (
                                                <div className="text-muted-foreground">→ {formatDateTime(visit.visit_ends_at)}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <Badge variant="outline">
                                                {visit.permit_kind === 'one_time' ? 'Разовый' : 'Многоразовый'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            {visit.vehicles.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {visit.vehicles.map((vehicle) => (
                                                        <Badge
                                                            key={`${visit.id}-${vehicle.id ?? vehicle.plate_number}`}
                                                            variant="secondary"
                                                        >
                                                            {vehicle.plate_number}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant={isActive ? 'default' : 'secondary'}>
                                                {isActive ? 'Активный' : visit.workflow_status === 'closed' ? 'Закрыт' : 'Отменён'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            {visit.last_entry_at && !visit.last_exit_at ? (
                                                <div className="flex items-center gap-1 text-green-600 font-medium text-xs">
                                                    <LogIn className="h-3.5 w-3.5" />
                                                    На территории
                                                </div>
                                            ) : visit.last_entry_at && visit.last_exit_at ? (
                                                <div className="text-xs text-muted-foreground">
                                                    <div>Въезд: {formatDateTime(visit.last_entry_at)}</div>
                                                    <div>Выезд: {formatDateTime(visit.last_exit_at)}</div>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Не въезжал</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Редактировать"
                                                    onClick={() => openEditDialog(visit)}
                                                    disabled={!isActive}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                {isActive && (
                                                    <>
                                                        {!visit.last_entry_at || visit.last_exit_at ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                title="Отметить приход"
                                                                onClick={() => handlePresenceAction(visit.id, 'check-in')}
                                                            >
                                                                <LogIn className="h-4 w-4 text-green-600" />
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                title="Отметить уход"
                                                                onClick={() => handlePresenceAction(visit.id, 'check-out')}
                                                            >
                                                                <LogOut className="h-4 w-4 text-amber-600" />
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            title="Закрыть визит"
                                                            onClick={() => handleStatusAction(visit.id, 'close')}
                                                        >
                                                            <CheckCircle2 className="h-4 w-4 text-blue-600" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <Card className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">
                    Показано {pagination.from ?? 0} - {pagination.to ?? 0} из {pagination.total}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => fetchGuestVisits(currentPage - 1)} disabled={currentPage <= 1 || loading}>
                        Назад
                    </Button>
                    <Button variant="outline" onClick={() => fetchGuestVisits(currentPage + 1)} disabled={currentPage >= pagination.last_page || loading}>
                        Вперёд
                    </Button>
                </div>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedVisit ? 'Редактировать гостевой визит' : 'Создать гостевой визит'}</DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <Label>Двор</Label>
                                <Select value={formData.yard_id} onValueChange={(value) => setFormData((prev) => ({ ...prev, yard_id: value }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Выберите двор" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {yards.map((yard) => (
                                            <SelectItem key={yard.id} value={String(yard.id)}>
                                                {yard.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Тип пропуска</Label>
                                <Select
                                    value={formData.permit_kind}
                                    onValueChange={(value: 'one_time' | 'multi_time') => setFormData((prev) => ({ ...prev, permit_kind: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="one_time">Разовый</SelectItem>
                                        <SelectItem value="multi_time">Многоразовый</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <Label>ФИО гостя</Label>
                                <Input value={formData.guest_full_name} onChange={(event) => setFormData((prev) => ({ ...prev, guest_full_name: event.target.value }))} />
                            </div>
                            <div className="grid gap-2">
                                <Label>ИИН</Label>
                                <Input value={formData.guest_iin} onChange={(event) => setFormData((prev) => ({ ...prev, guest_iin: event.target.value }))} />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <Label>Компания</Label>
                                <Input value={formData.guest_company_name} onChange={(event) => setFormData((prev) => ({ ...prev, guest_company_name: event.target.value }))} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Должность</Label>
                                <Input value={formData.guest_position} onChange={(event) => setFormData((prev) => ({ ...prev, guest_position: event.target.value }))} />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <Label>Телефон гостя</Label>
                                <Input value={formData.guest_phone} onChange={(event) => setFormData((prev) => ({ ...prev, guest_phone: event.target.value }))} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Встречающая сторона</Label>
                                <Input value={formData.host_name} onChange={(event) => setFormData((prev) => ({ ...prev, host_name: event.target.value }))} />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <Label>Телефон встречающего</Label>
                                <Input value={formData.host_phone} onChange={(event) => setFormData((prev) => ({ ...prev, host_phone: event.target.value }))} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Время начала визита</Label>
                                <Input type="datetime-local" value={formData.visit_starts_at} onChange={(event) => setFormData((prev) => ({ ...prev, visit_starts_at: event.target.value }))} />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <Label>Время окончания визита</Label>
                                <Input type="datetime-local" value={formData.visit_ends_at} onChange={(event) => setFormData((prev) => ({ ...prev, visit_ends_at: event.target.value }))} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Комментарий</Label>
                                <Textarea value={formData.comment} onChange={(event) => setFormData((prev) => ({ ...prev, comment: event.target.value }))} />
                            </div>
                        </div>

                        <Card className="p-4 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="font-medium">Транспорт гостя</div>
                                    <div className="text-sm text-muted-foreground">Для каждого ТС сохраняется отдельная карточка и связь с гостевым визитом.</div>
                                </div>
                                <Button variant="outline" onClick={addVehicle} className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    Добавить ТС
                                </Button>
                            </div>

                            {formData.vehicles.length === 0 ? (
                                <div className="text-sm text-muted-foreground">ТС не добавлено.</div>
                            ) : (
                                <div className="space-y-4">
                                    {formData.vehicles.map((vehicle, index) => (
                                        <Card key={`${vehicle.id ?? 'new'}-${index}`} className="p-4 space-y-3 border-dashed">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="font-medium">ТС #{index + 1}</div>
                                                <Button variant="ghost" size="icon" onClick={() => removeVehicle(index)}>
                                                    <CircleX className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                                <div className="grid gap-2">
                                                    <Label>Гос. номер</Label>
                                                    <Input value={vehicle.plate_number} onChange={(event) => updateVehicle(index, 'plate_number', event.target.value)} />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label>Марка</Label>
                                                    <Input value={vehicle.brand || ''} onChange={(event) => updateVehicle(index, 'brand', event.target.value)} />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label>Модель</Label>
                                                    <Input value={vehicle.model || ''} onChange={(event) => updateVehicle(index, 'model', event.target.value)} />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label>Цвет</Label>
                                                    <Input value={vehicle.color || ''} onChange={(event) => updateVehicle(index, 'color', event.target.value)} />
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
                        <Button onClick={handleSave} disabled={saving}>{saving ? 'Сохранение...' : selectedVisit ? 'Сохранить' : 'Создать'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default GuestVisitsManager;