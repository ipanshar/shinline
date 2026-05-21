import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { AlertTriangle, CalendarDays, Download, ShieldCheck, TrendingUp } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { type BreadcrumbItem } from '@/types';
import shinLineLogo from '../../../images/shin-line-logo.png';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Спецтехника', href: '/spectech/dashboard' },
    { title: 'Отчёт', href: '/spectech/reports' },
];

type ReportData = {
    period: { from: string; to: string; label: string };
    summary: {
        total_requests: number;
        conflict_requests: number;
        frozen_requests: number;
        cancelled_requests: number;
    };
    problem_requests: Array<{
        id: number;
        essence: string;
        solution: string;
        status_label: string;
        initiator_name: string;
        equipment_name: string;
        plate_number?: string | null;
        location: string;
    }>;
    recommendations: string[];
    peak_hours: Array<{ hour: string; label: string; count: number }>;
    journal_rows: Array<{
        id: number;
        initiator_name: string;
        initiator_phone: string;
        equipment_name: string;
        plate_number?: string | null;
        period: string;
        status: string;
        status_label: string;
        has_conflict: boolean;
        is_frozen: boolean;
        is_cancelled: boolean;
        location: string;
        comment: string;
        source_label: string;
        status_freeze_reason?: string | null;
        cancellation_reason?: string | null;
        cancelled_by_label: string;
        conflict_summary: string;
        place_confirmed: string;
    }>;
};

function startOfCurrentWeek(): string {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    now.setDate(now.getDate() - day);
    return now.toISOString().slice(0, 10);
}

function endOfCurrentWeek(): string {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    now.setDate(now.getDate() + (6 - day));
    return now.toISOString().slice(0, 10);
}

function statusClass(status: string): string {
    if (status === 'cancelled') return 'bg-red-100 text-red-800 border-red-200';
    if (status === 'completed' || status === 'returned') return 'bg-green-100 text-green-800 border-green-200';
    if (status === 'work_started' || status === 'on_location') return 'bg-red-100 text-red-800 border-red-200';
    if (status === 'departure') return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
}

function splitMultiline(value: string): string[] {
    return value.split('\n').filter(Boolean);
}

function locationLines(value: string): string[] {
    return splitMultiline(value).filter((line) => !line.startsWith('Место согласовано:'));
}

function placeConfirmedClass(value: string): string {
    return value === 'Да'
        ? 'border-green-200 bg-green-50 text-green-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function SpectechReportsPage() {
    const [from, setFrom] = useState(startOfCurrentWeek());
    const [to, setTo] = useState(endOfCurrentWeek());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [report, setReport] = useState<ReportData | null>(null);

    const loadReport = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await axios.get('/spectech/api/reports/weekly', {
                params: { from, to },
            });

            setReport(response.data?.data ?? null);
        } catch {
            setError('Не удалось загрузить отчёт');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const exportHref = useMemo(
        () => `/spectech/reports/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        [from, to],
    );
    const exportDisabled = !report || loading;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Отчёт по спецтехнике" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8E8E8] bg-gradient-to-r from-white to-[#FFF8F8] px-4 py-4">
                    <div className="flex items-center gap-3">
                        <img src={shinLineLogo} alt="Shin Line" className="h-10 w-auto" />
                        <div>
                            <h1 className="text-lg font-semibold text-slate-900">Отчёт по спецтехнике</h1>
                            <p className="text-xs text-slate-500">
                                Недельный журнал работ, конфликтов и загрузки
                                {report ? ` · ${report.period.label}` : ''}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                <span>Ответственный руководитель: Цай Игорь Робикович</span>
                                <span>Период считается по времени выполнения заявки</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
                            <CalendarDays className="h-4 w-4 text-slate-500" />
                            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-transparent outline-none" disabled={loading} />
                            <span className="text-slate-400">—</span>
                            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-transparent outline-none" disabled={loading} />
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadReport()}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <TrendingUp className="h-4 w-4" />
                            {loading ? 'Формирование...' : 'Сформировать'}
                        </button>
                        <a
                            href={exportDisabled ? '#' : exportHref}
                            aria-disabled={exportDisabled}
                            tabIndex={exportDisabled ? -1 : 0}
                            onClick={(event) => {
                                if (exportDisabled) event.preventDefault();
                            }}
                            className={`inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 ${exportDisabled ? 'pointer-events-none opacity-60' : ''}`}
                        >
                            <Download className="h-4 w-4" />
                            Скачать Excel
                        </a>
                    </div>
                </section>

                {error && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                )}

                {report && (
                    <>
                        <div className="grid gap-3 md:grid-cols-4">
                            {[
                                { label: 'Заявки в периоде', value: report.summary.total_requests, tone: 'bg-[#FFF8F8] border-red-100' },
                                { label: 'Конфликты', value: report.summary.conflict_requests, tone: 'bg-red-50 border-red-200' },
                                { label: 'Заморожено', value: report.summary.frozen_requests, tone: 'bg-amber-50 border-amber-200' },
                                { label: 'Отменено', value: report.summary.cancelled_requests, tone: 'bg-red-50 border-red-200' },
                            ].map((item) => (
                                <div key={item.label} className={`rounded-md border bg-white p-4 ${item.tone}`}>
                                    <div className="text-xs text-slate-500">{item.label}</div>
                                    <div className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</div>
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                            <section className="rounded-md border bg-white p-4">
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <h2 className="text-sm font-semibold text-slate-900">Проблемные заявки</h2>
                                    <span className="text-xs text-slate-500">{report.problem_requests.length} записей</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full border-collapse text-left text-xs">
                                        <thead>
                                            <tr className="bg-red-600 text-white">
                                                <th className="px-3 py-2">ID</th>
                                                <th className="px-3 py-2">Суть</th>
                                                <th className="px-3 py-2">Решение / статус</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {report.problem_requests.length === 0 ? (
                                                <tr>
                                                    <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                                                        Проблемных заявок нет
                                                    </td>
                                                </tr>
                                            ) : report.problem_requests.map((item, index) => (
                                                <tr key={item.id} className={index % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                                                    <td className="px-3 py-2 font-medium text-slate-900">#{item.id}</td>
                                                    <td className="px-3 py-2">
                                                        <div className="font-medium text-red-700">{item.essence}</div>
                                                        <div className="mt-1 text-[11px] text-slate-500">
                                                            {item.initiator_name}
                                                            {item.plate_number ? ` · ${item.plate_number}` : ''}
                                                        </div>
                                                        <div className="mt-1 whitespace-pre-line text-[11px] text-slate-400">
                                                            {splitMultiline(item.location)[0] ?? 'Локация не указана'}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-700">{item.solution}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <div className="rounded-md border bg-white p-4">
                                    <h2 className="mb-3 text-sm font-semibold text-slate-900">Аналитика и рекомендации</h2>
                                    <div className="space-y-2 text-sm text-slate-700">
                                        {report.recommendations.map((line, index) => (
                                            <div key={index} className="flex items-start gap-2">
                                                <ShieldCheck className="mt-0.5 h-4 w-4 text-red-600" />
                                                <span>{line}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-md border bg-white p-4">
                                    <h2 className="mb-3 text-sm font-semibold text-slate-900">Пиковые часы</h2>
                                    <div className="space-y-2">
                                        {report.peak_hours.length === 0 ? (
                                            <div className="text-sm text-slate-500">Нет данных</div>
                                        ) : report.peak_hours.map((item) => (
                                            <div key={item.hour} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                                                <span>{item.label}</span>
                                                <span className="font-semibold text-slate-900">{item.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </div>

                        <section className="rounded-md border bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <h2 className="text-sm font-semibold text-slate-900">Детальный журнал заявок</h2>
                                <div className="text-xs text-slate-500">
                                    Фильтры доступны в Excel, в веб-версии показан текущий период.
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse text-left text-xs">
                                    <thead>
                                        <tr className="bg-red-600 text-white">
                                            <th className="px-3 py-2">ID заявки</th>
                                            <th className="px-3 py-2">Инициатор</th>
                                            <th className="px-3 py-2">Техника</th>
                                            <th className="px-3 py-2">Период выполнения</th>
                                            <th className="px-3 py-2">Статус / Ошибки</th>
                                            <th className="px-3 py-2">Локация / Комментарий</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.journal_rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                                                    За выбранный период заявок нет
                                                </td>
                                            </tr>
                                        ) : report.journal_rows.map((row, index) => (
                                            <tr key={row.id} className={index % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                                                <td className="px-3 py-2 font-medium text-slate-900">#{row.id}</td>
                                                <td className="px-3 py-2">
                                                    <div className="font-medium text-slate-900">{row.initiator_name}</div>
                                                    <div className="text-[11px] text-slate-500">{row.initiator_phone}</div>
                                                    <div className="mt-1 text-[11px] text-slate-400">{row.source_label}</div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="font-medium text-slate-900">{row.equipment_name}</div>
                                                    {row.plate_number && <div className="text-[11px] text-slate-500">{row.plate_number}</div>}
                                                </td>
                                                <td className="px-3 py-2 whitespace-pre-line text-slate-700">{row.period}</td>
                                                <td className="px-3 py-2">
                                                    <div className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusClass(row.status)}`}>
                                                        {row.status_label}
                                                    </div>
                                                    {(row.has_conflict || row.is_frozen || row.is_cancelled) && (
                                                        <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                                                            {row.has_conflict && <div className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-600" />{row.conflict_summary !== '—' ? row.conflict_summary : 'Конфликт планирования'}</div>}
                                                            {row.is_frozen && <div className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-600" />{row.status_freeze_reason || 'Заморожено'}</div>}
                                                            {row.is_cancelled && <div className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-600" />{row.cancellation_reason || `Отмена: ${row.cancelled_by_label}`}</div>}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 whitespace-pre-line text-slate-700">
                                                    <div className={`mb-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${placeConfirmedClass(row.place_confirmed)}`}>
                                                        Место согласовано: {row.place_confirmed}
                                                    </div>
                                                    {locationLines(row.location).map((line, lineIndex) => (
                                                        <div key={lineIndex}>{line}</div>
                                                    ))}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </>
                )}

                {loading && !report && (
                    <div className="rounded-md border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                        Загрузка отчёта...
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
