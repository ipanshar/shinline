import React, { useState } from 'react';
import AppLayout from '@/layouts/app-layout';
import TaskLayouts from '@/layouts/task-layout';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MapPin, Truck, Package, Clock } from 'lucide-react';

// Моковые данные для заданий
const mockTasks = [
  { id: 1, name: 'Задание №12419' },
  { id: 2, name: 'Задание №12430' },
  { id: 3, name: 'Задание №12445' },
  { id: 4, name: 'Задание №12456' },
];

// Моковые данные для водителей по маршрутам
const mockRoutes = [
  {
    id: 1,
    taskNumber: '12419',
    drivers: [
      { name: 'Иванов Иван', phone: '+7 777 123 45 67', trips: 15, rating: 4.8, lastTrip: '2025-10-25', successRate: 98 },
      { name: 'Петров Петр', phone: '+7 777 234 56 78', trips: 12, rating: 4.6, lastTrip: '2025-10-22', successRate: 95 },
      { name: 'Сидоров Сергей', phone: '+7 777 345 67 89', trips: 8, rating: 4.9, lastTrip: '2025-10-20', successRate: 100 },
    ],
    status: 'В процессе',
    warehouseCount: 3,
    loadingTime: '10:00',
    totalDriversInHistory: 15, // Всего водителей ездило по этому маршруту
  },
  {
    id: 2,
    taskNumber: '12430',
    drivers: [
      { name: 'Алиев Алибек', phone: '+7 777 456 78 90', trips: 20, rating: 4.7, lastTrip: '2025-10-28', successRate: 97 },
      { name: 'Касымов Касым', phone: '+7 777 567 89 01', trips: 18, rating: 4.5, lastTrip: '2025-10-26', successRate: 94 },
      { name: 'Мухамедов Мурат', phone: '+7 777 111 22 33', trips: 15, rating: 4.6, lastTrip: '2025-10-24', successRate: 96 },
      { name: 'Сулейменов Серик', phone: '+7 777 222 33 44', trips: 12, rating: 4.4, lastTrip: '2025-10-20', successRate: 93 },
      { name: 'Абдуллаев Азамат', phone: '+7 777 333 44 55', trips: 10, rating: 4.3, lastTrip: '2025-10-18', successRate: 91 },
      { name: 'Токтаров Талгат', phone: '+7 777 444 55 66', trips: 8, rating: 4.2, lastTrip: '2025-10-15', successRate: 90 },
      { name: 'Байжанов Бахыт', phone: '+7 777 555 66 77', trips: 6, rating: 4.0, lastTrip: '2025-10-12', successRate: 88 },
      { name: 'Есенов Ерлан', phone: '+7 777 666 77 88', trips: 5, rating: 3.9, lastTrip: '2025-10-10', successRate: 85 },
    ],
    status: 'Запланировано',
    warehouseCount: 2,
    loadingTime: '14:00',
    totalDriversInHistory: 8,
  },
  {
    id: 3,
    taskNumber: '12445',
    drivers: [
      { name: 'Нурланов Нурлан', phone: '+7 777 678 90 12', trips: 25, rating: 5.0, lastTrip: '2025-10-27', successRate: 100 },
      { name: 'Ержанов Ержан', phone: '+7 777 789 01 23', trips: 10, rating: 4.4, lastTrip: '2025-10-24', successRate: 92 },
      { name: 'Болатов Болат', phone: '+7 777 890 12 34', trips: 14, rating: 4.6, lastTrip: '2025-10-23', successRate: 96 },
    ],
    status: 'Завершено',
    warehouseCount: 4,
    loadingTime: '08:00',
    totalDriversInHistory: 12,
  },
  {
    id: 4,
    taskNumber: '12456',
    drivers: [
      { name: 'Жанибеков Жанибек', phone: '+7 777 901 23 45', trips: 22, rating: 4.8, lastTrip: '2025-10-29', successRate: 99 },
      { name: 'Темиров Темир', phone: '+7 777 012 34 56', trips: 16, rating: 4.7, lastTrip: '2025-10-21', successRate: 95 },
    ],
    status: 'В процессе',
    warehouseCount: 5,
    loadingTime: '12:00',
    totalDriversInHistory: 10,
  },
];

const OperatorWorkplace = () => {
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [routes, setRoutes] = useState(mockRoutes);

  // Фильтруем маршруты по выбранному заданию
  // Если задание не выбрано - не показываем водителей
  const filteredRoutes = selectedTask
    ? routes.filter((route) => route.taskNumber === mockTasks.find((t) => t.id.toString() === selectedTask)?.name.replace('Задание №', ''))
    : [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'В процессе':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Запланировано':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Завершено':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <AppLayout
      header={
        <h2 className="font-semibold text-xl text-gray-800 leading-tight">
          Рабочее место оператора
        </h2>
      }
    >
      <TaskLayouts>
        <div className="p-6 space-y-6">
          {/* Заголовок и выбор задания */}
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Выбор задания
              </h3>
              <div className="text-sm text-gray-500">
                Всего заданий: {mockTasks.length}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Выберите задание
                </label>
                <Select value={selectedTask} onValueChange={setSelectedTask}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите задание из списка" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockTasks.map((task) => (
                      <SelectItem key={task.id} value={task.id.toString()}>
                        {task.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTask && (
                <div className="flex items-end">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full">
                    <div className="flex items-center gap-2 text-blue-900">
                      <Package className="h-5 w-5" />
                      <span className="font-medium">
                        Выбрано: {mockTasks.find((t) => t.id.toString() === selectedTask)?.name}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Список водителей по маршрутам */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Водители по маршруту
                </h3>
                {selectedTask && filteredRoutes.length > 0 && (
                  <div className="text-sm text-gray-500">
                    Отсортировано по рейтингу
                  </div>
                )}
              </div>
            </div>

            <div className="p-6">
              {!selectedTask ? (
                <div className="text-center py-12 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium mb-2">Выберите задание</p>
                  <p className="text-sm">Выберите задание из списка выше, чтобы увидеть водителей по этому маршруту</p>
                </div>
              ) : filteredRoutes.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <MapPin className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>Водители для этого задания не найдены</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredRoutes.map((route) => (
                    <div
                      key={route.id}
                      className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
                    >
                      {/* Номер задания */}
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                        <Package className="h-5 w-5 text-blue-600" />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">
                            Задание №{route.taskNumber}
                          </div>
                          <div className="text-xs text-gray-500">
                            Складов: {route.warehouseCount} | Погрузка: {route.loadingTime}
                          </div>
                        </div>
                      </div>

                      {/* Список водителей */}
                      <div className="space-y-3 mb-3">
                        <div className="text-sm font-medium text-gray-700">
                          Водители ({route.drivers.length}):
                        </div>
                        {route.drivers.map((driver, index) => (
                          <div
                            key={index}
                            className="bg-gray-50 rounded-lg p-3 text-sm border border-gray-200"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="font-medium text-gray-900">
                                {driver.name}
                              </div>
                              <div className="flex items-center gap-1 text-yellow-600">
                                <span className="text-xs">⭐</span>
                                <span className="font-medium">{driver.rating}</span>
                              </div>
                            </div>
                            <div className="text-xs text-gray-600 space-y-1.5">
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400">📞</span>
                                {driver.phone}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-gray-500">Поездок:</span>
                                <span className="font-medium text-gray-900">{driver.trips}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-gray-500">Успешность:</span>
                                <span className={`font-medium ${driver.successRate >= 95 ? 'text-green-600' : 'text-yellow-600'}`}>
                                  {driver.successRate}%
                                </span>
                              </div>
                              <div className="pt-1.5 border-t border-gray-200">
                                <div className="text-gray-500">
                                  Последняя поездка:
                                </div>
                                <div className="font-medium text-gray-900">
                                  {new Date(driver.lastTrip).toLocaleDateString('ru-RU', { 
                                    day: '2-digit', 
                                    month: 'long', 
                                    year: 'numeric' 
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Статус */}
                      <div className="pt-3 border-t">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                            route.status
                          )}`}
                        >
                          {route.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Информационная панель */}
          {selectedTask && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 rounded-full p-2">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">
                    Информация
                  </h4>
                  <p className="text-sm text-blue-700">
                    Выбрано задание:{' '}
                    <span className="font-semibold">
                      {mockTasks.find((t) => t.id.toString() === selectedTask)?.name}
                    </span>
                    . Ниже отображены водители, которые ездили по этому маршруту.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </TaskLayouts>
    </AppLayout>
  );
};

export default OperatorWorkplace;
