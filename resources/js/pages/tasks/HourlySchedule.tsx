import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Clock, Timer, Truck } from 'lucide-react';
import "./HourlySchedule.css";

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

function getMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
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

function getTaskLoadingForWarehouse(task: Task, warehouseId: string) {
  return task.task_loadings?.find((loading) => String(loading.warehouse_id) === warehouseId);
}

function getTasksForHour(tasks: Task[], hour: number, warehouseId: string) {
  return tasks.filter((task) => {
    const loading = getTaskLoadingForWarehouse(task, warehouseId);

    if (!loading?.plane_date) {
      return false;
    }

    return new Date(loading.plane_date).getHours() === hour;
  });
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
  } catch {
    // ignore
  }

  return [];
}

interface DayTableScheduleProps {
  tasks: Task[];
  warehouseId: string;
  onEditTask: (task: Task) => void;
}

const DayTableSchedule: React.FC<DayTableScheduleProps> = ({ tasks, warehouseId, onEditTask }) => {
  return (
    <div className="schedule">
      {HOURS.map((hour) => {
        const hourTasks = getTasksForHour(tasks, hour, warehouseId);

        return (
          <div key={hour} className="hour-block">
            <div className="hour-line">
              <span className="hour">{String(hour).padStart(2, '0')}:00</span>
            </div>

            <div className="tasks-table-container">
              {hourTasks.length > 0 ? (
                <table className="task-table">
                  <thead>
                    <tr>
                      <th style={{ width: '10%' }}>№ Задачи</th>
                      <th style={{ width: '20%' }}>Номер ТС</th>
                      <th style={{ width: '12%' }}>Время</th>
                      <th style={{ width: '40%' }}>Примечание</th>
                      <th style={{ width: '18%' }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hourTasks.map((task) => {
                      const taskLoading = getTaskLoadingForWarehouse(task, warehouseId);

                      return (
                        <tr key={task.id}>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontWeight: 600 }}>№{task.name}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="plate-badge">
                              <Truck size={14} />
                              {task.truck_plate_number}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="time-badge">
                              <Clock size={14} />
                              {fmtTime(taskLoading?.plane_date)}
                            </span>
                          </td>
                          <td>
                            <div className="task-description" title={task.description || ''}>
                              {task.description || '—'}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="edit-time-btn"
                              onClick={() => onEditTask(task)}
                            >
                              <Clock size={14} />
                              Изменить
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-hour">Нет запланированных задач</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface CalendarOverviewProps {
  tasksByDate: Record<string, Task[]>;
  dates: Date[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  mode: 'week' | 'month';
}

const CalendarOverview: React.FC<CalendarOverviewProps> = ({ tasksByDate, dates, selectedDate, onSelectDate, mode }) => {
  const today = fmtDate(new Date());

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {mode === 'week' && WEEK_DAYS.map((d) => (
        <div key={d} className="pb-1 text-center text-[10px] font-semibold uppercase text-slate-400">
          {d}
        </div>
      ))}

      {dates.map((d) => {
        const key = fmtDate(d);
        const count = tasksByDate[key]?.length ?? 0;
        const isToday = key === today;
        const isSelected = key === fmtDate(selectedDate);

        return (
          <button
            key={key}
            onClick={() => onSelectDate(d)}
            className={`rounded-xl border p-2 text-left transition-all hover:border-blue-300 hover:bg-blue-50 ${
              isSelected ? 'border-blue-500 bg-blue-50 shadow-sm' :
              isToday ? 'border-blue-200 bg-blue-50/50' :
              'border-slate-200 bg-white'
            }`}
          >
            <div className={`mb-1 text-[11px] font-semibold ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>
              {d.getDate()}
              {mode === 'week' && <span className="ml-1 font-normal text-slate-400">{fmtDay(d).split(' ')[1]}</span>}
            </div>

            {count > 0 ? (
              <div className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
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

  useEffect(() => {
    axios.post('/warehouse/getwarehouses')
      .then((r) => {
        if (r.data?.status) {
          setWarehouses(r.data.data);
        }
      })
      .catch(() => {});
  }, []);

  const loadDay = useCallback(async (date: Date, warehouseId: string) => {
    if (!warehouseId) return;

    setLoading(true);
    const list = await loadTasksForDate(date, warehouseId);
    setTasks(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (viewMode === 'day') {
      loadDay(selectedDate, selectedWarehouse);
    }
  }, [selectedDate, selectedWarehouse, viewMode, loadDay]);

  const calendarDates = useMemo<Date[]>(() => {
    if (viewMode === 'week') {
      const mon = getMonday(selectedDate);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon);
        d.setDate(d.getDate() + i);
        return d;
      });
    }

    if (viewMode === 'month') {
      const first = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      const last = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
      const days: Date[] = [];
      const startMon = getMonday(first);
      let cur = new Date(startMon);

      while (cur <= last || days.length % 7 !== 0) {
        days.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);

        if (days.length > 42) {
          break;
        }
      }

      return days;
    }

    return [];
  }, [viewMode, selectedDate]);

  useEffect(() => {
    if ((viewMode === 'week' || viewMode === 'month') && selectedWarehouse && calendarDates.length > 0) {
      setCalLoading(true);

      Promise.all(
        calendarDates.map((d) => loadTasksForDate(d, selectedWarehouse).then((dayTasks) => ({
          key: fmtDate(d),
          tasks: dayTasks,
        })))
      )
        .then((results) => {
          const map: Record<string, Task[]> = {};
          results.forEach((result) => {
            map[result.key] = result.tasks;
          });
          setTasksByDate(map);
        })
        .finally(() => setCalLoading(false));
    }
  }, [viewMode, selectedWarehouse, calendarDates]);

  const navigate = (dir: -1 | 1) => {
    const d = new Date(selectedDate);

    if (viewMode === 'day') d.setDate(d.getDate() + dir);
    if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
    if (viewMode === 'month') d.setMonth(d.getMonth() + dir);

    setSelectedDate(d);
  };

  const handleCalendarDayClick = (d: Date) => {
    setSelectedDate(d);
    setViewMode('day');
  };

  const stats = useMemo(() => {
    const src = viewMode === 'day' ? tasks : Object.values(tasksByDate).flat();
    const uniqueTrucks = new Set(src.map((task) => task.truck_plate_number)).size;
    const busiestHour = HOURS.reduce((max, hour) => {
      const count = selectedWarehouse ? getTasksForHour(src, hour, selectedWarehouse).length : 0;
      return count > max.count ? { hour, count } : max;
    }, { hour: 0, count: 0 });

    return [
      { icon: <ClipboardList size={14} />, value: src.length, label: 'Задач', color: 'text-blue-600' },
      { icon: <Truck size={14} />, value: uniqueTrucks, label: 'ТС', color: 'text-emerald-600' },
      { icon: <Timer size={14} />, value: busiestHour.count > 0 ? `${String(busiestHour.hour).padStart(2, '0')}:00` : '—', label: 'Пик', color: 'text-orange-600' },
    ];
  }, [tasks, tasksByDate, viewMode, selectedWarehouse]);

  const periodLabel = useMemo(() => {
    if (viewMode === 'day') {
      return selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    if (viewMode === 'week') {
      const mon = getMonday(selectedDate);
      const sun = new Date(mon);
      sun.setDate(sun.getDate() + 6);
      return `${fmtDay(mon)} — ${fmtDay(sun)} ${sun.getFullYear()}`;
    }

    return selectedDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  }, [viewMode, selectedDate]);

  const breadcrumbs: BreadcrumbItem[] = [{ title: t('tasks'), href: '/tasks' }];

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title={t('tasks')} />
      <TaskLayouts>
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-4">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-3">
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ru}>
              <DatePicker
                label="Дата"
                value={selectedDate}
                onChange={(d) => d && setSelectedDate(d)}
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
                {warehouses.map((w) => (
                  <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <div className="ml-auto flex overflow-hidden rounded-lg border border-slate-200">
              {(['day', 'week', 'month'] as ViewMode[]).map((mode, index) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`h-9 px-4 text-[12px] font-medium transition-colors ${index > 0 ? 'border-l border-slate-200' : ''} ${viewMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {{ day: 'День', week: 'Неделя', month: 'Месяц' }[mode]}
                </button>
              ))}
            </div>
          </div>

          {selectedWarehouse && (
            <div className="flex gap-2">
              {stats.map((stat, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className={`${stat.color} opacity-70`}>{stat.icon}</div>
                  <div>
                    <div className={`text-base font-bold leading-none ${stat.color}`}>{stat.value}</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50"
            >
              <ChevronLeft size={14} />
            </button>

            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CalendarDays size={15} className="text-blue-500" />
              {periodLabel}
            </div>

            <button
              onClick={() => navigate(1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="min-h-[300px] rounded-xl border border-slate-200 bg-white p-4">
            {!selectedWarehouse && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
                <Truck size={40} className="opacity-30" />
                <p className="text-sm">Выберите склад для просмотра расписания</p>
              </div>
            )}

            {selectedWarehouse && (loading || calLoading) && (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            )}

            {selectedWarehouse && !loading && !calLoading && viewMode === 'day' && (
              <DayTableSchedule
                tasks={tasks}
                warehouseId={selectedWarehouse}
                onEditTask={(task) => {
                  setSelectedTask(task);
                  setIsEditModalOpen(true);
                }}
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
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedTask(null);
          }}
          task={selectedTask}
          onTaskUpdated={() => loadDay(selectedDate, selectedWarehouse)}
          warehouseId={selectedWarehouse}
        />
      </TaskLayouts>
    </AppLayout>
  );
};

export default HourlySchedule;
