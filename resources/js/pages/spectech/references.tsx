import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { type BreadcrumbItem } from '@/types';
import { BookOpen, Plus, Pencil, Trash2, Search, X, Check, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/components/UserContext';
import EquipmentImage from '@/components/spectech/EquipmentImage';
import { resolveEquipmentPhotoCandidates } from '@/lib/equipment-photo';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Справочники', href: '/spectech/references' },
    { title: 'Спецтехника', href: '/spectech/references' },
];

interface Truck {
    id: number;
    name: string;
    plate_number: string | null;
    own: string;
    description: string | null;
    functionality: string | null;
    image_url: string | null;
    anpr_source: boolean;
    last_seen_gate: string | null;
    last_seen_at: string | null;
    anpr_confidence: number | null;
}

interface TruckForm {
    name: string;
    plate_number: string;
    own: string;
    description: string;
    functionality: string;
    image_url: string;
}

const EMPTY_FORM: TruckForm = {
    name: '', plate_number: '', own: 'собственный', description: '', functionality: '', image_url: '',
};

/* ─── Модальная форма ─── */
function TruckFormModal({
    initial, onSave, onClose, saving,
}: {
    initial: TruckForm & { id?: number };
    onSave: (form: TruckForm & { id?: number }) => void;
    onClose: () => void;
    saving: boolean;
}) {
    const [form, setForm] = useState<TruckForm & { id?: number }>(initial);
    const set = (key: keyof TruckForm) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
            setForm(f => ({ ...f, [key]: e.target.value }));

    const autoDetectPhoto = () => {
        const candidates = resolveEquipmentPhotoCandidates(form.name, form.plate_number);
        if (candidates.length > 0) {
            setForm(f => ({ ...f, image_url: candidates[0] }));
        }
    };

    const autoPreviewUrl = form.image_url || resolveEquipmentPhotoCandidates(form.name, form.plate_number)[0] || '';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-background rounded-xl shadow-xl border border-border p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-base">{form.id ? 'Редактировать технику' : 'Добавить технику'}</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>

                {/* Превью фото */}
                {autoPreviewUrl && (
                    <div className="rounded-lg overflow-hidden border border-border bg-muted h-36">
                        <EquipmentImage
                            name={form.name}
                            plate={form.plate_number || null}
                            imageUrl={form.image_url || null}
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}

                <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">Наименование *</span>
                        <input value={form.name} onChange={set('name')} className="h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30" placeholder="Autocrane 25t" />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">Гос. номер</span>
                        <input value={form.plate_number} onChange={set('plate_number')} className="h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30" placeholder="282FD02 (оставьте пустым если нет)" />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">Принадлежность</span>
                        <select value={form.own} onChange={set('own')} className="h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30">
                            <option value="собственный">Собственный</option>
                            <option value="аренда">Аренда</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">Описание</span>
                        <textarea value={form.description} onChange={set('description')} rows={3} className="px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30 resize-none" placeholder="Характеристики, назначение..." />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">Функционал</span>
                        <textarea value={form.functionality} onChange={set('functionality')} rows={4} className="px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30 resize-none" placeholder="Каждый пункт с новой строки" />
                    </label>
                    <div className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">URL картинки</span>
                        <div className="flex gap-2">
                            <input
                                value={form.image_url}
                                onChange={set('image_url')}
                                className="flex-1 h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
                                placeholder="/equipment/autocrane-25t-282fd02.jpg"
                            />
                            <button
                                type="button"
                                onClick={autoDetectPhoto}
                                title="Подобрать фото автоматически по имени и номеру"
                                className="h-9 px-3 rounded-md border border-dashed border-red-400 text-red-600 text-xs hover:bg-red-50 flex items-center gap-1 whitespace-nowrap"
                            >
                                <Wand2 className="h-3.5 w-3.5" />
                                Авто
                            </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Формат авто: /equipment/&#123;наименование-slug&#125;-&#123;номер&#125;.jpg
                        </p>
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Отмена</Button>
                    <Button size="sm" onClick={() => onSave(form)} disabled={saving || !form.name.trim()}>
                        <Check className="h-4 w-4 mr-1" />
                        {saving ? 'Сохранение...' : 'Сохранить'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/* ─── Главная страница ─── */
export default function SpectechReferences() {
    const { user } = useUser();
    const isOperator = user?.isAdmin || user?.permissions?.includes('spectech.manage');

    const [trucks, setTrucks] = useState<Truck[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [modal, setModal] = useState<(TruckForm & { id?: number }) | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const fetchTrucks = async (q = '') => {
        setLoading(true);
        setError(null);
        try {
            const params = q ? { search: q } : {};
            const res = await axios.get('/spectech/api/trucks', { params });
            if (res.data?.status && Array.isArray(res.data.data)) {
                setTrucks(res.data.data);
            } else {
                setTrucks([]);
                setError('Данные не получены: ' + JSON.stringify(res.data));
            }
        } catch (e: unknown) {
            setTrucks([]);
            const msg = e instanceof Error ? e.message : String(e);
            setError('Ошибка загрузки: ' + msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void fetchTrucks(); }, []);

    const openCreate = () => setModal({ ...EMPTY_FORM });
    const openEdit = (t: Truck) => setModal({
        id: t.id,
        name: t.name,
        plate_number: t.plate_number ?? '',
        own: t.own === 'аренда' ? 'аренда' : 'собственный',
        description: t.description ?? '',
        functionality: t.functionality ?? '',
        image_url: t.image_url ?? '',
    });

    const handleSave = async (form: TruckForm & { id?: number }) => {
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                plate_number: form.plate_number.trim() || null,
                own: form.own,
                description: form.description.trim() || null,
                functionality: form.functionality.trim() || null,
                image_url: form.image_url.trim() || null,
            };
            if (form.id) {
                await axios.put(`/spectech/api/trucks/${form.id}`, payload);
            } else {
                await axios.post('/spectech/api/trucks', payload);
            }
            setModal(null);
            await fetchTrucks();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            alert('Ошибка сохранения: ' + msg);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Удалить эту единицу техники?')) return;
        setDeletingId(id);
        try {
            await axios.delete(`/spectech/api/trucks/${id}`);
            await fetchTrucks();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            alert('Ошибка удаления: ' + msg);
        } finally {
            setDeletingId(null);
        }
    };

    const filtered = trucks.filter(t =>
        (t.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (t.plate_number ?? '').toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Спецтехника — Справочник" />

            {modal && (
                <TruckFormModal initial={modal} onSave={handleSave} onClose={() => setModal(null)} saving={saving} />
            )}

            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                {/* Заголовок */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h1 className="text-lg font-semibold flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-red-600" />
                        Справочник спецтехники
                    </h1>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Поиск..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="h-9 pl-9 pr-3 rounded-md border border-border bg-background text-sm w-60 focus:outline-none focus:ring-2 focus:ring-red-600/30"
                            />
                        </div>
                        {isOperator && (
                            <Button size="sm" onClick={openCreate}>
                                <Plus className="h-4 w-4 mr-1" />
                                Добавить
                            </Button>
                        )}
                    </div>
                </div>

                {/* Статус */}
                {error && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-2">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">Загрузка...</div>
                ) : filtered.length === 0 && !error ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">Техника не найдена</div>
                ) : (
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filtered.map(truck => (
                            <div key={truck.id} className="border rounded-lg bg-card border-border hover:shadow-md transition-all flex flex-col overflow-hidden">
                                {/* Фото */}
                                <EquipmentImage
                                    name={truck.name}
                                    plate={truck.plate_number}
                                    imageUrl={truck.image_url}
                                    className="w-full h-36 object-cover"
                                />

                                <div className="p-4 flex flex-col flex-1 gap-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-sm leading-tight">{truck.name}</div>
                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                {truck.plate_number || <span className="italic">Без номера</span>}
                                            </div>
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${
                                            truck.own === 'аренда'
                                                ? 'bg-orange-100 text-orange-700 border-orange-200'
                                                : 'bg-green-100 text-green-700 border-green-200'
                                        }`}>
                                            {truck.own === 'аренда' ? 'Аренда' : 'Собственный'}
                                        </span>
                                    </div>

                                    {truck.description && (
                                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                                            {truck.description}
                                        </p>
                                    )}

                                    {truck.functionality && (
                                        <div>
                                            <div className="text-[11px] font-medium text-foreground mb-1">Функционал:</div>
                                            <ul className="text-[11px] text-muted-foreground space-y-1 max-h-28 overflow-auto pr-1">
                                                {truck.functionality
                                                    .split('\n')
                                                    .map(item => item.trim())
                                                    .filter(Boolean)
                                                    .map((item, index) => (
                                                        <li key={index} className="leading-snug">- {item}</li>
                                                    ))}
                                            </ul>
                                        </div>
                                    )}

                                    {truck.anpr_source && (
                                        <div className="rounded-md bg-[#FFF4E6] px-2 py-1 text-[11px] text-[#E67E22]">
                                            🎥 {truck.last_seen_gate} ·{' '}
                                            {truck.last_seen_at ? new Date(truck.last_seen_at).toLocaleString('ru-RU') : '—'}
                                        </div>
                                    )}

                                    {isOperator && (
                                        <div className="flex gap-2 mt-auto pt-2 border-t border-border">
                                            <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => openEdit(truck)}>
                                                <Pencil className="h-3 w-3 mr-1" />Изменить
                                            </Button>
                                            <Button
                                                variant="outline" size="sm"
                                                className="h-7 px-2 text-destructive hover:bg-destructive/10 border-destructive/30"
                                                onClick={() => handleDelete(truck.id)}
                                                disabled={deletingId === truck.id}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

