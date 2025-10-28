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
import { Clock } from 'lucide-react';

interface Warehouse {
  id: number;
  name: string;
}

interface TaskLoading {
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
          if (response.data.status) {
            setTasks(response.data.data);
          }
        })
        .catch(error => {
          console.error('Ошибка при загрузке задач:', error);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [selectedDate, selectedWarehouse]);

  // Получение задач для конкретного часа
  const getTasksForHour = (hour: number) => {
    return tasks.filter(task => {
      const taskHour = new Date(task.plan_date).getHours();
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
        plan_date: formattedDate,
        warehouse_id: selectedWarehouse
      })
        .then(response => {
          if (response.data.status) {
            setTasks(response.data.data);
          }
        })
        .catch(error => {
          console.error('Ошибка при загрузке задач:', error);
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
  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title={t('tasks')} />
      <TaskLayouts>
        <div className="schedule-container">
          <div className="filters mb-4 flex gap-4">
            {/* Выбор даты */}
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ru}>
              <DatePicker
                label="Выберите дату"
                value={selectedDate}
                onChange={handleDateChange}
                format="dd.MM.yyyy"
              />
            </LocalizationProvider>

            {/* Выбор склада */}
            <FormControl fullWidth sx={{ maxWidth: 300 }}>
              <InputLabel id="warehouse-select-label">Выберите склад</InputLabel>
              <Select
                labelId="warehouse-select-label"
                id="warehouse-select"
                value={selectedWarehouse}
                label="Выберите склад"
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

          <h2>План-график по часам</h2>
          <div className="schedule">
            {hours.map((hour) => (
              <div key={hour} className="hour-block">
                <div className="hour-line">
                  <span className="hour">{hour.toString().padStart(2, '0')}:00</span>
                </div>
                <div className="tasks-table-container" style={{ width: '100%', paddingRight: '20px' }}>
                  {getTasksForHour(hour).length > 0 && (
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      border: '1px solid #ccc',
                      backgroundColor: 'white'
                    }}>
                      <thead>
                        <tr>
                          <th style={{
                            padding: '12px',
                            border: '1px solid #ccc',
                            backgroundColor: '#f5f5f5',
                            width: '15%',
                            textAlign: 'center'
                          }}>№ Задачи</th>
                          <th style={{
                            padding: '12px',
                            border: '1px solid #ccc',
                            backgroundColor: '#f5f5f5',
                            width: '25%',
                            textAlign: 'center'
                          }}>Номер ТС</th>
                          <th style={{
                            padding: '12px',
                            border: '1px solid #ccc',
                            backgroundColor: '#f5f5f5',
                            width: '45%',
                            textAlign: 'center'
                          }}>Примечание</th>
                          <th style={{
                            padding: '12px',
                            border: '1px solid #ccc',
                            backgroundColor: '#f5f5f5',
                            width: '15%',
                            textAlign: 'center'
                          }}>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getTasksForHour(hour).map(task => (
                          <tr key={task.id}>
                            <td style={{
                              padding: '8px',
                              border: '1px solid #ccc',
                              textAlign: 'center'
                            }}>№{task.name}</td>
                            <td style={{
                              padding: '8px',
                              border: '1px solid #ccc',
                              textAlign: 'center'
                            }}>{task.truck_plate_number}</td>
                            <td style={{
                              padding: '8px',
                              border: '1px solid #ccc',
                              textAlign: 'left'
                            }}>{task.description || '-'}</td>
                            <td style={{
                              padding: '8px',
                              border: '1px solid #ccc',
                              textAlign: 'center'
                            }}>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditTime(task)}
                              >
                                <Clock className="mr-2 h-4 w-4" />
                                Изменить время
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>                {/* <div className="event" onClick={() => addEvent(hour)}>
              {events[hour] ? events[hour] : "Добавить событие"}
            </div> */}
              </div>
            ))}
          </div>
        </div>

        {/* Модальное окно редактирования времени */}
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
