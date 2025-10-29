import React from 'react';
import { Package, Calendar, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Vehicle {
  type: string;
  number: string;
  model: string;
}

interface CompletedTask {
  route: string;
  taskNumber: string;
  date: string;
}

interface ContactInfoProps {
  vehicles: Vehicle[];
  completedTasks: CompletedTask[];
}

const ContactInfo: React.FC<ContactInfoProps> = ({ vehicles, completedTasks }) => {
  return (
    <div className="w-80 border-l bg-gray-50 flex flex-col h-full overflow-y-auto">
      {/* Транспортные средства */}
      <div className="p-4 space-y-3">
        <div className="bg-red-600 text-white text-center py-2 px-4 rounded-lg font-semibold shadow-sm">
          Транспортные средства
        </div>
        
        {vehicles.map((vehicle, index) => (
          <div key={index} className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-3 border-b border-gray-100">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <Truck className="h-4 w-4 text-gray-600" />
                {vehicle.type}
              </div>
            </div>
            <div className="p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Номер:</span>
                <span className="font-medium text-gray-900">{vehicle.number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Модель:</span>
                <span className="font-medium text-gray-900">{vehicle.model}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Выполненные задания */}
      <div className="p-4 space-y-3 flex-1">
        <div className="bg-red-600 text-white text-center py-2 px-4 rounded-lg font-semibold shadow-sm">
          Выполненные задания
        </div>
        
        {completedTasks.map((task, index) => (
          <div key={index} className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-3 border-b border-gray-100">
              <div className="font-semibold text-gray-900">{task.route}</div>
            </div>
            <div className="p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-600" />
                <span className="text-gray-600">Задание №:</span>
                <span className="font-medium text-gray-900">{task.taskNumber}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-600" />
                <span className="text-gray-600">Дата:</span>
                <span className="font-medium text-gray-900">{task.date}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContactInfo;
