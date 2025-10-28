import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { ru } from 'date-fns/locale';
import axios from 'axios';

interface Task {
  id: number;
  name: string;
  plan_date: string;
  truck_plate_number: string;
  description: string;
}

interface EditTaskTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onTaskUpdated: () => void;
  warehouseId: number | string;
}

const EditTaskTimeModal: React.FC<EditTaskTimeModalProps> = ({
  isOpen,
  onClose,
  task,
  onTaskUpdated,
  warehouseId,
}) => {
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Устанавливаем начальное время при открытии модалки
  useEffect(() => {
    if (task && task.plan_date) {
      const initialTime = new Date(task.plan_date);
      console.log('🕐 Инициализация времени из задачи:', {
        task_plan_date: task.plan_date,
        parsed_time: initialTime.toString(),
        hours: initialTime.getHours(),
      });
      setSelectedTime(initialTime);
    }
  }, [task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!task || !selectedTime) {
      setError('Выберите время');
      return;
    }

    if (!warehouseId) {
      setError('Склад не выбран. Пожалуйста, выберите склад на странице планирования.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Форматируем дату в локальное время (не UTC!)
      const year = selectedTime.getFullYear();
      const month = String(selectedTime.getMonth() + 1).padStart(2, '0');
      const day = String(selectedTime.getDate()).padStart(2, '0');
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      const seconds = String(selectedTime.getSeconds()).padStart(2, '0');
      const localDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      console.log('📤 Отправка updatetime:', {
        task_id: task.id,
        warehouse_id: warehouseId,
        plan_date: localDateTime,
        selectedTime_local: selectedTime.toString(),
      });

      const response = await axios.post('/task/updatetime', {
        task_id: task.id,
        warehouse_id: warehouseId,
        plan_date: localDateTime,
      });

      console.log('📥 Ответ updatetime:', response.data);

      if (response.data.status) {
        console.log('✅ Время успешно обновлено, закрываем модалку и обновляем список');
        onClose();
        onTaskUpdated();
      } else {
        setError(response.data.message || 'Ошибка при обновлении времени');
      }
    } catch (err: any) {
      console.error('❌ Ошибка updatetime:', err);
      console.error('Response:', err.response?.data);
      
      const errorMessage = err.response?.data?.message || err.message || 'Ошибка при обновлении времени';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !task) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
        {/* Кнопка закрытия */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Заголовок */}
        <h2 className="text-2xl font-bold mb-6">Изменить время задачи</h2>

        {/* Информация о задаче */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="text-sm space-y-2">
            <div>
              <span className="font-medium">Задача:</span> №{task.name}
            </div>
            <div>
              <span className="font-medium">Грузовик:</span> {task.truck_plate_number}
            </div>
            {task.description && (
              <div>
                <span className="font-medium">Примечание:</span> {task.description}
              </div>
            )}
          </div>
        </div>

        {/* Форма */}
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* TimePicker */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Выберите новое время
            </label>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ru}>
              <TimePicker
                value={selectedTime}
                onChange={(newValue) => setSelectedTime(newValue)}
                ampm={false}
                format="HH:mm"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    variant: 'outlined',
                  },
                }}
              />
            </LocalizationProvider>
          </div>

          {/* Кнопки */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditTaskTimeModal;
