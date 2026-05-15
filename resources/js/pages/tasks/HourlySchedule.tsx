import React, { useState, useEffect, useMemo, useCallback } from "react";
import AppLayout from '@/layouts/app-layout';
import TaskLayouts from '@/layouts/task-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { FormControl, InputLabel, MenuItem, Select, SelectChangeEvent } from '@mui/material';
import axios from 'axios';
import { ru } from 'date-fns/locale';
import EditTaskTimeModal from '@/components/tasks/EditTaskTimeModal';
import { Clock, Truck, CalendarDays, ClipboardList, Timer, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

interface Warehouse {
  id: number;
  name: string;
}

interface TaskLoading {
  plane_date: any;
  warehouse_id: number;
  warehouse_name: string;
  warehouse_gate_plan_name: string;
  warehouse_gate_fact_name: string;
}

interface Task {
  id: number;
  name: string;
  status_name: string;
  plan_date: string;
  begin_date: string;
  end_date: string;
  description: string;
  yard_name: string;
  truck_plate_number: string;
  task_loadings: TaskLoading[];
}

type ViewMode = 'day' | 'week' | 'month';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  default: { bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8' },
  active:  { bg: '#F0FDF4', border: '#22C55E', text: '#15803D' },
  late:    { bg: '#FEF2F2', border: '#EF4444', text: '#B91C1C' },
};

function getMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function fmtDay(d: Date) {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

async function loadTasksForDate(date: Date, warehouseId: string): Promise<Task[]> {
  try {
    const res = await axios.post('/task/gettasks', {
      plan_date_warehouse: fmtDate(date),
      warehouse_id: warehouseId,
    });
    if (res.data?.status && res.data.data?.tasks) {
      return Array.isArray(res.data.data.tasks) ? res.data.data.tasks : [];
    }
  } catch { /* ignore */ }
  return [];
}

// ─── Gantt Day View ───────────────────────────────────────────────────────────

interface DayGanttProps {
  tasks: Task[];
  warehouseId: string;
  onEditTask: (task: Task) => void;
}

const DayGantt: React.FC<DayGanttProps> = ({ tasks, warehouseId, onEditTask }) => {
  const [tooltip, setTooltip] = useState<{ task: Task; x: number; y: number } | null>(null);

  const trucks = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const t of tasks) {
      if (t.truck_plate_number && !seen.has(t.truck_plate_number)) {
        seen.add(t.truck_plate_number);
        list.push(t.truck_plate_number);
      }
    }
    return list.sort();
  }, [tasks]);

  const getBar = (task: Task) => {
    const loading = task.task_loadings?.find(l => String(l.warehouse_id) === warehouseId);
    const startIso = loading?.plane_date ?? task.plan_date;
    if (!startIso) return null;
    const start = new Date(startIso);
    const endIso = task.end_date;
    const end = endIso ? new Date(endIso) : new Date(start.getTime() + 60 * 60 * 1000);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = Math.max(end.getHours() * 60 + end.getMinutes(), startMin + 30);
    return { startMin, endMin, startIso, endIso };
  };

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const LABEL_W = 100;

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
        <Truck size={40} className="opacity-30" />
        <p className="text-sm">Нет задач на эту дату</p>
      </div>
    );
  }

  return (
    <div className="relative select-none">
      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 rounded-xl border border-slate-200 bg-white shadow-xl px-3 py-2.5 text-xs pointer-events-none max-w-[220px]"
          style={{ left: tooltip.x + 14, top: tooltip.y - 6 }}
        >
          <div className="font-semibold text-slate-800 mb-1">№{tooltip.task.name}</div>
          <div className="text-slate-500 space-y-0.5">
            <div>🚛 {tooltip.task.truck_plate_number}</div>
            {tooltip.task.description && <div className="truncate">📝 {tooltip.task.description}</div>}
            <div>🕐 {fmtTime(tooltip.task.plan_date)} → {fmtTime(tooltip.task.end_date)}</div>
            <div>📌 {tooltip.task.status_name}</div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <div style={{ minWidth: 700 }}>
          {/* Hour axis */}
          <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
            <div style={{ width: LABEL_W, flexShrink: 0 }} className="border-r border-slate-200" />
            <div className="relative flex-1" style={{ height: 28 }}>
              {HOURS.filter(h => h % 2 === 0).map(h => (
                <div
                  key={h}
                  className="absolute top-0 bottom-0 flex items-center"
                  style={{ left: `${(h / 24) * 100}%` }}
                >
                  <span className="text-[10px] text-slate-400 font-mono pl-1">{String(h).padStart(2, '0')}:00</span>
                </div>
              ))}
              {/* Now line header dot */}
              {nowMin <= 1440 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-400"
                  style={{ left: `${(nowMin / 1440) * 100}%` }}
                />
              )}
            </div>
          </div>

          {/* Truck rows */}
          {trucks.map((plate, ri) => {
            const truckTasks = tasks.filter(t => t.truck_plate_number === plate);
            return (
              <div
                key={plate}
                className={`flex border-b border-slate-100 ${ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/30 transition-colors`}
                style={{ minHeight: 44 }}
              >
                {/* Label */}
                <div
                  className="flex-shrink-0 flex items-center px-2 border-r border-slate-200 gap-1.5"
                  style={{ width: LABEL_W }}
                >
                  <Truck size={12} className="text-slate-400 flex-shrink-0" />
                  <span className="text-[11px] font-mono font-semibold text-slate-700 truncate">{plate}</span>
                </div>

                {/* Timeline lane */}
                <div className="relative flex-1" style={{ minHeight: 44 }}>
                  {/* Grid lines */}
                  {HOURS.filter(h => h % 2 === 0).map(h => (
                    <div
                      key={h}
                      className="absolute inset-y-0 border-l border-slate-100"
                      style={{ left: `${(h / 24) * 100}%` }}
                    />
                  ))}

                  {/* Now line */}
                  {nowMin <= 1440 && (
                    <div
                      className="absolute inset-y-0 w-px bg-red-400/60 z-10"
                      style={{ left: `${(nowMin / 1440) * 100}%` }}
                    />
                  )}

                  {/* Task bars */}
                  {truckTasks.map(task => {
                    const bar = getBar(task);
                    if (!bar) return null;
                    const left  = (bar.startMin / 1440) * 100;
                    const width = Math.max(((bar.endMin - bar.startMin) / 1440) * 100, 1.5);
                    const col   = STATUS_COLORS.default;
                    return (
                      <div
                        key={task.id}
                        className="absolute top-2 bottom-2 rounded-md flex items-center px-2 overflow-hidden cursor-pointer hover:brightness-95 transition-all"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: col.bg,
                          borderLeft: `3px solid ${col.border}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        }}
                        onClick={() => onEditTask(task)}
                        onMouseEnter={e => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setTooltip({ task, x: r.left, y: r.top });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <span className="truncate text-[10px] font-semibold" style={{ color: col.text }}>
                          №{task.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-0.5 h-3 bg-red-400 rounded-full" />
          <span>Текущее время</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 rounded-sm bg-blue-50 border-l-2 border-blue-500" />
          <span>Задача (нажмите для редактирования)</span>
        </div>
      </div>
    </div>
  );
};

// ─── Week / Month overview ─────────────────────────────────────────────────────

interface CalendarOverviewProps {
  tasksByDate: Record<string, Task[]>;
  dates: Date[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  mode: 'week' | 'month';
}

const CalendarOverview: React.FC<CalendarOverviewProps> = ({ tasksByDate, dates, selectedDate, onSelectDate, mode }) => {
  const today = fmtDate(new Date());
  const cols = mode === 'week' ? 7 : Math.ceil(dates.length / 7);

  return (
    <div className={`grid gap-1.5 ${mode === 'week' ? 'grid-cols-7' : 'grid-cols-7'}`}>
      {mode === 'week' && WEEK_DAYS.map(d => (
        <div key={d} className="text-center text-[10px] font-semibold text-slate-400 uppercase pb-1">{d}</div>
      ))}
      {dates.map(d => {
        const key = fmtDate(d);
        const count = tasksByDate[key]?.length ?? 0;
        const isToday = key === today;
        const isSelected = key === fmtDate(selectedDate);
        return (
          <button
            key={key}
            onClick={() => onSelectDate(d)}
            className={`rounded-xl p-2 border text-left transition-all hover:border-blue-300 hover:bg-blue-50 ${
              isSelected ? 'border-blue-500 bg-blue-50 shadow-sm' :
              isToday    ? 'border-blue-200 bg-blue-50/50' :
                           'border-slate-200 bg-white'
            }`}
          >
            <div className={`text-[11px] font-semibold mb-1 ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>
              {d.getDate()}
              {mode === 'week' && <span className="text-slate-400 font-normal ml-1">{fmtDay(d).split(' ')[1]}</span>}
            </div>
            {count > 0 ? (
              <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
                <ClipboardList size={9} />
                {count}
              </div>
            ) : (
              <div className="text-[10px] text-slate-300">—</div>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const HourlySchedule = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [tasksByDate, setTasksByDate] = useState<Record<string, Task[]>>({});
  const [calLoading, setCalLoading] = useState(false);
  const { t } = useTranslation();

  // Load warehouses
  useEffect(() => {
    axios.post('/warehouse/getwarehouses').then(r => {
      if (r.data?.status) setWarehouses(r.data.data);
    }).catch(() => {});
  }, []);

  // Load tasks for day view
  const loadDay = useCallback(async (date: Date, wh: string) => {
    if (!wh) return;
    setLoading(true);
    const list = await loadTasksForDate(date, wh);
    setTasks(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (viewMode === 'day') loadDay(selectedDate, selectedWarehouse);
  }, [selectedDate, selectedWarehouse, viewMode, loadDay]);

  // Build date range for week/month
  const calendarDates = useMemo<Date[]>(() => {
    if (viewMode === 'week') {
      const mon = getMonday(selectedDate);
      return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(d.getDate() + i); return d; });
    }
    if (viewMode === 'month') {
      const first = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      const last  = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
      const days: Date[] = [];
      // pad to monday
      const startMon = getMonday(first);
      let cur = new Date(startMon);
      while (cur <= last || days.length % 7 !== 0) {
        days.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
        if (days.length > 42) break;
      }
      return days;
    }
    return [];
  }, [viewMode, selectedDate]);

  // Load tasks for calendar view
  useEffect(() => {
    if ((viewMode === 'week' || viewMode === 'month') && selectedWarehouse && calendarDates.length > 0) {
      setCalLoading(true);
      Promise.all(calendarDates.map(d => loadTasksForDate(d, selectedWarehouse).then(tasks => ({ key: fmtDate(d), tasks }))))
        .then(results => {
          const map: Record<string, Task[]> = {};
          results.forEach(r => { map[r.key] = r.tasks; });
          setTasksByDate(map);
        })
        .finally(() => setCalLoading(false));
    }
  }, [viewMode, selectedWarehouse, calendarDates]);

  // Navigate periods
  const navigate = (dir: -1 | 1) => {
    const d = new Date(selectedDate);
    if (viewMode === 'day')   d.setDate(d.getDate() + dir);
    if (viewMode === 'week')  d.setDate(d.getDate() + dir * 7);
    if (viewMode === 'month') d.setMonth(d.getMonth() + dir);
    setSelectedDate(d);
  };

  const handleCalendarDayClick = (d: Date) => {
    setSelectedDate(d);
    setViewMode('day');
  };

  // Stats
  const stats = useMemo(() => {
    const src = viewMode === 'day' ? tasks : Object.values(tasksByDate).flat();
    const uniqueTrucks = new Set(src.map(t => t.truck_plate_number)).size;
    const busiestHour = HOURS.reduce((max, h) => {
      const c = tasks.filter(t => {
        const l = t.task_loadings?.find(l => String(l.warehouse_id) === selectedWarehouse);
        return l?.plane_date && new Date(l.plane_date).getHours() === h;
      }).length;
      return c > max.count ? { h, count: c } : max;
    }, { h: 0, count: 0 });
    return [
      { icon: <ClipboardList size={14} />, value: src.length, label: 'Задач', color: 'text-blue-600' },
      { icon: <Truck size={14} />, value: uniqueTrucks, label: 'ТС', color: 'text-emerald-600' },
      { icon: <Timer size={14} />, value: busiestHour.count > 0 ? `${String(busiestHour.h).padStart(2, '0')}:00` : '—', label: 'Пик', color: 'text-orange-600' },
    ];
  }, [tasks, tasksByDate, viewMode, selectedWarehouse]);

  const periodLabel = useMemo(() => {
    if (viewMode === 'day') return selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    if (viewMode === 'week') {
      const mon = getMonday(selectedDate);
      const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
      return `${fmtDay(mon)} — ${fmtDay(sun)} ${sun.getFullYear()}`;
    }
    return selectedDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  }, [viewMode, selectedDate]);

  const breadcrumbs: BreadcrumbItem[] = [{ title: t('tasks'), href: '/tasks' }];

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title={t('tasks')} />
      <TaskLayouts>
        <div className="p-4 flex flex-col gap-4 max-w-[1400px] mx-auto">

          {/* ── Filters bar ── */}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-3">
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ru}>
              <DatePicker
                label="Дата"
                value={selectedDate}
                onChange={d => d && setSelectedDate(d)}
                format="dd.MM.yyyy"
                slotProps={{ textField: { size: 'small', sx: { minWidth: 160 } } }}
              />
            </LocalizationProvider>

            <FormControl sx={{ minWidth: 220 }} size="small">
              <InputLabel id="wh-label">Склад</InputLabel>
              <Select
                labelId="wh-label"
                value={selectedWarehouse}
                label="Склад"
                onChange={(e: SelectChangeEvent) => setSelectedWarehouse(e.target.value)}
              >
                {warehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
              </Select>
            </FormControl>

            {/* View mode toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden ml-auto">
              {(['day', 'week', 'month'] as ViewMode[]).map((m, i) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={`h-9 px-4 text-[12px] font-medium transition-colors ${i > 0 ? 'border-l border-slate-200' : ''} ${viewMode === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {{ day: 'День', week: 'Неделя', month: 'Месяц' }[m]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Stats row ── */}
          {selectedWarehouse && (
            <div className="flex gap-2">
              {stats.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className={`${s.color} opacity-70`}>{s.icon}</div>
                  <div>
                    <div className={`text-base font-bold leading-none ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Period header + nav ── */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CalendarDays size={15} className="text-blue-500" />
              {periodLabel}
            </div>
            <button
              onClick={() => navigate(1)}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* ── Main content ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 min-h-[300px]">
            {!selectedWarehouse && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                <Truck size={40} className="opacity-30" />
                <p className="text-sm">Выберите склад для просмотра расписания</p>
              </div>
            )}

            {selectedWarehouse && (loading || calLoading) && (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
              </div>
            )}

            {selectedWarehouse && !loading && !calLoading && viewMode === 'day' && (
              <DayGantt
                tasks={tasks}
                warehouseId={selectedWarehouse}
                onEditTask={task => { setSelectedTask(task); setIsEditModalOpen(true); }}
              />
            )}

            {selectedWarehouse && !calLoading && (viewMode === 'week' || viewMode === 'month') && (
              <CalendarOverview
                tasksByDate={tasksByDate}
                dates={calendarDates}
                selectedDate={selectedDate}
                onSelectDate={handleCalendarDayClick}
                mode={viewMode}
              />
            )}
          </div>
        </div>

        <EditTaskTimeModal
          isOpen={isEditModalOpen}
          onClose={() => { setIsEditModalOpen(false); setSelectedTask(null); }}
          task={selectedTask}
          onTaskUpdated={() => loadDay(selectedDate, selectedWarehouse)}
          warehouseId={selectedWarehouse}
        />
      </TaskLayouts>
    </AppLayout>
  );
};

export default HourlySchedule;
