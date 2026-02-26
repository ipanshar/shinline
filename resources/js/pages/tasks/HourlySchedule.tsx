import React, { useState, useEffect } from "react";
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
import "./HourlySchedule.css";
import { ru } from 'date-fns/locale';
import EditTaskTimeModal from '@/components/tasks/EditTaskTimeModal';
import { Button } from '@/components/ui/button';
import { Clock, Truck, CalendarDays, ClipboardList, Timer } from 'lucide-react';

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

const HourlySchedule = () => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const { t } = useTranslation();

  // Функция для форматирования даты в формат API
  const formatDateForAPI = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  // Загрузка списка складов
  useEffect(() => {
    axios.post('/warehouse/getwarehouses')
      .then(response => {
        if (response.data.status) {
          setWarehouses(response.data.data);
        }
      })
      .catch(error => {
        console.error('Ошибка при загрузке складов:', error);
      });
  }, []);

  // Загрузка задач при изменении даты или склада
  useEffect(() => {
    if (selectedDate && selectedWarehouse) {
      setLoading(true);
      const formattedDate = formatDateForAPI(selectedDate);
      
      axios.post('/task/gettasks', {
        plan_date_warehouse: formattedDate,
        warehouse_id: selectedWarehouse
      })
        .then(response => {
          if (response.data.status && response.data.data?.tasks) {
            setTasks(Array.isArray(response.data.data.tasks) ? response.data.data.tasks : []);
          } else {
            setTasks([]);
          }
        })
        .catch(error => {
          console.error('Ошибка при загрузке задач:', error);
          setTasks([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [selectedDate, selectedWarehouse]);

  // Получение задач для конкретного часа
  const getTasksForHour = (hour: number) => {
    return tasks.filter(task => {
      // Используем plane_date из task_loadings для выбранного склада
      const taskLoading = task.task_loadings?.find(
        (loading: any) => loading.warehouse_id == selectedWarehouse
      );
      
      if (!taskLoading || !taskLoading.plane_date) {
        return false;
      }
      
      const taskHour = new Date(taskLoading.plane_date).getHours();
      return taskHour === hour;
    });
  };

  // Обработчик изменения склада
  const handleWarehouseChange = (event: SelectChangeEvent) => {
    setSelectedWarehouse(event.target.value);
  };

  // Обработчик изменения даты
  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
  };

  // Открытие модалки редактирования времени
  const handleEditTime = (task: Task) => {
    setSelectedTask(task);
    setIsEditModalOpen(true);
  };

  // Закрытие модалки
  const handleCloseModal = () => {
    setIsEditModalOpen(false);
    setSelectedTask(null);
  };

  // Перезагрузка задач после обновления
  const handleTaskUpdated = () => {
    if (selectedDate && selectedWarehouse) {
      setLoading(true);
      const formattedDate = formatDateForAPI(selectedDate);
      
      axios.post('/task/gettasks', {
        plan_date_warehouse: formattedDate,
        warehouse_id: selectedWarehouse
      })
        .then(response => {
          if (response.data.status && response.data.data?.tasks) {
            setTasks(Array.isArray(response.data.data.tasks) ? response.data.data.tasks : []);
          } else {
            setTasks([]);
          }
        })
        .catch(error => {
          console.error('Ошибка при загрузке задач:', error);
          setTasks([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  };

  const breadcrumbs: BreadcrumbItem[] = [
    {
      title: t('tasks'),
      href: '/tasks',
    },
  ];

  // Подсчет статистики
  const totalTasks = tasks.length;
  const uniqueTrucks = new Set(tasks.map(t => t.truck_plate_number)).size;
  const busiestHour = hours.reduce((max, hour) => {
    const count = getTasksForHour(hour).length;
    return count > max.count ? { hour, count } : max;
  }, { hour: 0, count: 0 });

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title={t('tasks')} />
      <TaskLayouts>
        <div className="schedule-container">
          {/* Фильтры */}
          <div className="filters">
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ru}>
              <DatePicker
                label="Дата"
                value={selectedDate}
                onChange={handleDateChange}
                format="dd.MM.yyyy"
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { minWidth: 180 }
                  }
                }}
              />
            </LocalizationProvider>

            <FormControl sx={{ minWidth: 250 }} size="small">
              <InputLabel id="warehouse-select-label">Склад</InputLabel>
              <Select
                labelId="warehouse-select-label"
                id="warehouse-select"
                value={selectedWarehouse}
                label="Склад"
                onChange={handleWarehouseChange}
              >
                {warehouses.map((warehouse) => (
                  <MenuItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>

          {/* Статистика */}
          {selectedWarehouse && (
            <div className="schedule-stats">
              <div className="stat-card">
                <div className="stat-card-icon blue">
                  <ClipboardList size={24} />
                </div>
                <div className="stat-card-value">{totalTasks}</div>
                <div className="stat-card-label">Всего задач</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon green">
                  <Truck size={24} />
                </div>
                <div className="stat-card-value">{uniqueTrucks}</div>
                <div className="stat-card-label">Транспортных средств</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon orange">
                  <Timer size={24} />
                </div>
                <div className="stat-card-value">
                  {busiestHour.count > 0 ? `${busiestHour.hour.toString().padStart(2, '0')}:00` : '—'}
                </div>
                <div className="stat-card-label">Пик загрузки ({busiestHour.count} задач)</div>
              </div>
            </div>
          )}

          <h2>
            <CalendarDays size={20} />
            План-график на {selectedDate?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : !selectedWarehouse ? (
            <div className="text-center py-20 text-gray-400">
              <Truck size={48} className="mx-auto mb-4 opacity-50" />
              <p>Выберите склад для просмотра расписания</p>
            </div>
          ) : (
            <div className="schedule">
              {hours.map((hour) => {
                const hourTasks = getTasksForHour(hour);
                return (
                  <div key={hour} className="hour-block">
                    <div className="hour-line">
                      <span className="hour">{hour.toString().padStart(2, '0')}:00</span>
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
                            {hourTasks.map(task => {
                              const taskLoading = task.task_loadings?.find(
                                loading => loading.warehouse_id === Number(selectedWarehouse)
                              );
                              const timeStr = taskLoading?.plane_date 
                                ? new Date(taskLoading.plane_date).toLocaleTimeString('ru-RU', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : '—';
                              
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
                                      {timeStr}
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
                                      onClick={() => handleEditTime(task)}
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
          )}
        </div>

        <EditTaskTimeModal
          isOpen={isEditModalOpen}
          onClose={handleCloseModal}
          task={selectedTask}
          onTaskUpdated={handleTaskUpdated}
          warehouseId={selectedWarehouse}
        />
      </TaskLayouts>
    </AppLayout>
  );
};

export default HourlySchedule;
