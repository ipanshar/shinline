import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { type BreadcrumbItem } from '@/types';
import { Search, Truck } from 'lucide-react';
import EquipmentImage from '@/components/spectech/EquipmentImage';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Спецтехника', href: '/spectech/catalog' },
    { title: 'Каталог техники', href: '/spectech/catalog' },
];

interface Equipment {
    id: number;
    name: string;
    number: string;
    type: string;
    description: string;
    functionality?: string;
    image_url?: string;
    // ANPR
    anpr_source?: boolean;
    last_seen_gate?: string;
    last_seen_at?: string;
    anpr_confidence?: number;
}

// Константа: id категории «Спец техника» — загружается динамически
let SPECTECH_CATEGORY_ID: number | null = null;

interface TruckCategory {
    id: number;
    name: string;
}

interface TruckRaw {
    id: number;
    name?: string | null;
    plate_number?: string | null;
    own?: string | null;
    description?: string | null;
    functionality?: string | null;
    image_url?: string | null;
    anpr_source?: boolean;
    last_seen_gate?: string | null;
    last_seen_at?: string | null;
    anpr_confidence?: number | null;
    truck_brand_name?: string | null;
    truck_model_name?: string | null;
    truck_categories_name?: string | null;
    color?: string | null;
}

async function fetchSpectechCategoryId(): Promise<number | null> {
    if (SPECTECH_CATEGORY_ID !== null) return SPECTECH_CATEGORY_ID;
    try {
        const res = await axios.post('/trucs/getcategories');
        if (res.data?.status && Array.isArray(res.data.data)) {
            const cat = (res.data.data as TruckCategory[]).find(c => c.name === 'Спец техника');
            if (cat) {
                SPECTECH_CATEGORY_ID = cat.id;
                return cat.id;
            }
        }
    } catch {
        // silent
    }
    return null;
}

function mapTruck(t: TruckRaw): Equipment {
    const own = t.own === 'собственный' || t.own === 'Собственный' ? 'Собственный' : 'Аренда';
    return {
        id:             t.id,
        name:           t.name || `${t.truck_brand_name ?? ''} ${t.truck_model_name ?? ''}`.trim(),
        number:         t.plate_number ?? 'Без номера',
        type:           own,
        description:    t.description || [
            t.truck_categories_name,
            t.color ? `цвет: ${t.color}` : null,
        ].filter(Boolean).join(', '),
        functionality:  t.functionality ?? '',
        image_url:      t.image_url,
        anpr_source:    t.anpr_source,
        last_seen_gate: t.last_seen_gate,
        last_seen_at:   t.last_seen_at,
        anpr_confidence:t.anpr_confidence,
    };
}

export default function SpectechCatalog() {
    const [equipment, setEquipment] = useState<Equipment[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Equipment | null>(null);

    const fetchEquipment = async (plate?: string) => {
        setLoading(true);
        try {
            const catId = await fetchSpectechCategoryId();
            const body: Record<string, unknown> = { plate_number: plate ?? '' };
            if (catId !== null) body.truck_category_id = catId;

            const res = await axios.post('/trucs/gettrucks', body);
            if (res.data?.status && Array.isArray(res.data.data)) {
                setEquipment((res.data.data as TruckRaw[]).map(mapTruck));
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchEquipment(); }, []);

    const filtered = equipment.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.number?.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Каталог техники" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">

                {/* Заголовок */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h1 className="text-lg font-semibold flex items-center gap-2">
                        <Truck className="h-5 w-5 text-red-600" />
                        Каталог спецтехники
                    </h1>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Поиск по названию или номеру..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && fetchEquipment(search)}
                            className="h-9 pl-9 pr-3 rounded-md border border-border bg-background text-sm w-72 focus:outline-none focus:ring-2 focus:ring-red-600/30"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">Загрузка...</div>
                ) : filtered.length === 0 ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">Техника не найдена</div>
                ) : (
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filtered.map(eq => (
                            <div
                                key={eq.id}
                                onClick={() => setSelected(selected?.id === eq.id ? null : eq)}
                                className={`border rounded-lg p-4 bg-card cursor-pointer transition-all hover:shadow-md ${
                                    selected?.id === eq.id ? 'border-red-500 shadow-md' : 'border-border'
                                }`}
                            >
                                {/* Картинка */}
                                <EquipmentImage
                                    name={eq.name}
                                    plate={eq.number !== 'Без номера' ? eq.number : null}
                                    imageUrl={eq.image_url}
                                />

                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div>
                                        <div className="font-semibold text-sm leading-tight">{eq.name}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">{eq.number}</div>
                                    </div>
                                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${
                                        eq.type === 'Собственный'
                                            ? 'bg-green-100 text-green-700 border-green-200'
                                            : 'bg-orange-100 text-orange-700 border-orange-200'
                                    }`}>
                                        {eq.type}
                                    </span>
                                </div>

                                {eq.description && (
                                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-2">
                                        {eq.description}
                                    </p>
                                )}

                                {eq.functionality && (
                                    <div className="mb-2 text-[11px] text-muted-foreground">
                                        <div className="font-medium text-foreground mb-1">Функционал:</div>
                                        {eq.functionality
                                            .split('\n')
                                            .map(item => item.trim())
                                            .filter(Boolean)
                                            .slice(0, 2)
                                            .map((item, index) => (
                                                <div key={index} className="leading-snug">- {item}</div>
                                            ))}
                                    </div>
                                )}

                                {/* ANPR-бейдж */}
                                {eq.anpr_source && (
                                    <div className="mt-2 rounded-md bg-[#FFF4E6] px-2 py-1 text-[11px] text-[#E67E22]">
                                        🎥 Из видеонаблюдения · {eq.last_seen_gate} ·{' '}
                                        {eq.last_seen_at ? new Date(eq.last_seen_at).toLocaleString('ru-RU') : '—'}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

