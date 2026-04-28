import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface YardOption { id: number; name: string }

interface TelegramUser {
    id: number;
    chat_id: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    display_full_name: string | null;
    display_phone: string | null;
    approval_status: 'none' | 'awaiting_review' | 'approved' | 'rejected' | 'blocked';
    rejection_reason: string | null;
    approved_at: string | null;
    approved_user: { id: number; name: string } | null;
    approved_by: { id: number; name: string } | null;
    yards: YardOption[];
    last_interaction_at: string | null;
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
}

const STATUS_LABELS: Record<TelegramUser['approval_status'], string> = {
    none: 'Новый',
    awaiting_review: 'Ожидает',
    approved: 'Подтверждён',
    rejected: 'Отклонён',
    blocked: 'Заблокирован',
};

const STATUS_VARIANTS: Record<TelegramUser['approval_status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
    none: 'outline',
    awaiting_review: 'secondary',
    approved: 'default',
    rejected: 'destructive',
    blocked: 'destructive',
};

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Telegram-пользователи', href: '/telegram-users' },
];

export default function TelegramUsersPage() {
    const { toast } = useToast();
    const [items, setItems] = useState<TelegramUser[]>([]);
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [status, setStatus] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [yards, setYards] = useState<YardOption[]>([]);

    const [approveTarget, setApproveTarget] = useState<TelegramUser | null>(null);
    const [rejectTarget, setRejectTarget] = useState<TelegramUser | null>(null);
    const [yardsTarget, setYardsTarget] = useState<TelegramUser | null>(null);
    const [selectedYardIds, setSelectedYardIds] = useState<number[]>([]);
    const [rejectReason, setRejectReason] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get<{ data: Paginated<TelegramUser> }>('/admin/telegram-users', {
                params: {
                    page,
                    status: status === 'all' ? undefined : status,
                    search: search || undefined,
                },
            });
            setItems(r.data.data.data);
            setLastPage(r.data.data.last_page);
        } catch (e: any) {
            toast({ title: 'Ошибка', description: e.response?.data?.message ?? 'Не удалось загрузить', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [page, status, search, toast]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        axios.post('/yard/getyards').then((r) => setYards(r.data.data ?? [])).catch(() => setYards([]));
    }, []);

    const openApprove = (u: TelegramUser) => {
        setApproveTarget(u);
        setSelectedYardIds(u.yards.map((y) => y.id));
    };

    const openYards = (u: TelegramUser) => {
        setYardsTarget(u);
        setSelectedYardIds(u.yards.map((y) => y.id));
    };

    const submitApprove = async () => {
        if (!approveTarget || selectedYardIds.length === 0) return;
        setBusy(true);
        try {
            await axios.post(`/admin/telegram-users/${approveTarget.id}/approve`, { yard_ids: selectedYardIds });
            toast({ title: 'Подтверждено' });
            setApproveTarget(null);
            await load();
        } catch (e: any) {
            toast({ title: 'Ошибка', description: e.response?.data?.message ?? '', variant: 'destructive' });
        } finally {
            setBusy(false);
        }
    };

    const submitReject = async () => {
        if (!rejectTarget || !rejectReason.trim()) return;
        setBusy(true);
        try {
            await axios.post(`/admin/telegram-users/${rejectTarget.id}/reject`, { reason: rejectReason });
            toast({ title: 'Отклонено' });
            setRejectTarget(null);
            setRejectReason('');
            await load();
        } catch (e: any) {
            toast({ title: 'Ошибка', description: e.response?.data?.message ?? '', variant: 'destructive' });
        } finally {
            setBusy(false);
        }
    };

    const submitYards = async () => {
        if (!yardsTarget) return;
        setBusy(true);
        try {
            await axios.post(`/admin/telegram-users/${yardsTarget.id}/yards`, { yard_ids: selectedYardIds });
            toast({ title: 'Площадки обновлены' });
            setYardsTarget(null);
            await load();
        } catch (e: any) {
            toast({ title: 'Ошибка', description: e.response?.data?.message ?? '', variant: 'destructive' });
        } finally {
            setBusy(false);
        }
    };

    const block = async (u: TelegramUser) => {
        if (!confirm(`Заблокировать пользователя ${u.display_full_name ?? u.chat_id}?`)) return;
        try {
            await axios.post(`/admin/telegram-users/${u.id}/block`);
            toast({ title: 'Заблокирован' });
            await load();
        } catch (e: any) {
            toast({ title: 'Ошибка', description: e.response?.data?.message ?? '', variant: 'destructive' });
        }
    };

    const toggleYardId = (id: number) => {
        setSelectedYardIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Telegram-пользователи" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <Label>Статус</Label>
                        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Все</SelectItem>
                                <SelectItem value="awaiting_review">Ожидают</SelectItem>
                                <SelectItem value="approved">Подтверждённые</SelectItem>
                                <SelectItem value="rejected">Отклонённые</SelectItem>
                                <SelectItem value="blocked">Заблокированные</SelectItem>
                                <SelectItem value="none">Новые</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <Label>Поиск (ФИО / телефон / chat_id / username)</Label>
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }} />
                    </div>
                    <Button onClick={() => { setPage(1); load(); }} disabled={loading}>Обновить</Button>
                </div>

                <div className="rounded-xl border overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Telegram</TableHead>
                                <TableHead>ФИО</TableHead>
                                <TableHead>Телефон</TableHead>
                                <TableHead>Статус</TableHead>
                                <TableHead>Площадки</TableHead>
                                <TableHead>Действия</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.length === 0 && (
                                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Нет данных</TableCell></TableRow>
                            )}
                            {items.map((u) => (
                                <TableRow key={u.id}>
                                    <TableCell>
                                        <div className="font-mono text-xs">{u.chat_id}</div>
                                        <div className="text-sm">@{u.username ?? '—'}</div>
                                    </TableCell>
                                    <TableCell>{u.display_full_name ?? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() ?? '—'}</TableCell>
                                    <TableCell>{u.display_phone ?? '—'}</TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_VARIANTS[u.approval_status]}>{STATUS_LABELS[u.approval_status]}</Badge>
                                        {u.approval_status === 'rejected' && u.rejection_reason && (
                                            <div className="text-xs text-muted-foreground mt-1">{u.rejection_reason}</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {u.yards.length === 0 ? '—' : u.yards.map((y) => y.name).join(', ')}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-2 flex-wrap">
                                            {(u.approval_status === 'awaiting_review' || u.approval_status === 'rejected' || u.approval_status === 'none') && (
                                                <Button size="sm" onClick={() => openApprove(u)}>Подтвердить</Button>
                                            )}
                                            {(u.approval_status === 'awaiting_review' || u.approval_status === 'approved') && (
                                                <Button size="sm" variant="outline" onClick={() => { setRejectTarget(u); setRejectReason(''); }}>Отклонить</Button>
                                            )}
                                            {u.approval_status === 'approved' && (
                                                <Button size="sm" variant="outline" onClick={() => openYards(u)}>Площадки</Button>
                                            )}
                                            {u.approval_status !== 'blocked' && (
                                                <Button size="sm" variant="destructive" onClick={() => block(u)}>Блок</Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Назад</Button>
                    <span className="self-center text-sm">{page} / {lastPage}</span>
                    <Button variant="outline" disabled={page >= lastPage || loading} onClick={() => setPage((p) => p + 1)}>Вперёд</Button>
                </div>
            </div>

            {/* Approve dialog */}
            <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Подтверждение пользователя</DialogTitle>
                        <DialogDescription>Выберите площадки, на которых пользователь сможет создавать гостевые визиты.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {yards.map((y) => (
                            <label key={y.id} className="flex items-center gap-2">
                                <Checkbox checked={selectedYardIds.includes(y.id)} onCheckedChange={() => toggleYardId(y.id)} />
                                <span>{y.name}</span>
                            </label>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setApproveTarget(null)}>Отмена</Button>
                        <Button disabled={busy || selectedYardIds.length === 0} onClick={submitApprove}>Подтвердить</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject dialog */}
            <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Отклонить заявку</DialogTitle>
                    </DialogHeader>
                    <Label>Причина</Label>
                    <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={255} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectTarget(null)}>Отмена</Button>
                        <Button variant="destructive" disabled={busy || !rejectReason.trim()} onClick={submitReject}>Отклонить</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Yards edit dialog */}
            <Dialog open={!!yardsTarget} onOpenChange={(o) => !o && setYardsTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Площадки пользователя</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {yards.map((y) => (
                            <label key={y.id} className="flex items-center gap-2">
                                <Checkbox checked={selectedYardIds.includes(y.id)} onCheckedChange={() => toggleYardId(y.id)} />
                                <span>{y.name}</span>
                            </label>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setYardsTarget(null)}>Отмена</Button>
                        <Button disabled={busy} onClick={submitYards}>Сохранить</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
