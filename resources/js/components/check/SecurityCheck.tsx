import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Car, Plus, User, Phone, Clock, LogOut, FileText, Briefcase, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Yard {
  id: number;
  name: string;
}

interface Truck {
  id: number;
  plate_number: string;
  driver_name?: string;
  phone?: string;
  vip_level?: number;
}

interface Visitor {
  id: number;
  plate_number: string;
  truck_model_name?: string;
  truck_brand_name?: string;
  status_name: string;
  entry_date: string;
  exit_date?: string;
  truck: Truck;
  user_name?: string;
  user_phone?: string;
  user_company?: string;
  vip_full_name?: string;
  vip_position?: string;
  description?: string;
  name?: string;
  truck_own: any;
  truck_vip_level?: number;
  entrance_device_name?: string;
  exit_device_name?: string;
}

const SecurityCheck = () => {
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<number | null>(null);
  const [searchPlate, setSearchPlate] = useState('');
  const [foundTruck, setFoundTruck] = useState<Truck | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'on_territory' | 'left'>('on_territory');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCarNumber, setNewCarNumber] = useState('');
  const [newModel, setNewModel] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    axios.post('/yard/getyards')
      .then(res => setYards(res.data.data))
      .catch(err => console.error('Ошибка при загрузке дворов:', err));
  }, []);

  const loadVisitors = () => {
    if (!selectedYardId) return;
    setLoading(true);

    axios.post('/security/getvisitors', {
      yard_id: selectedYardId
    })
      .then(res => setVisitors(res.data.data))
      .catch(err => console.error('Ошибка при загрузке посетителей:', err))
      .finally(() => setLoading(false));
  };
useEffect(() => {
  if (selectedYardId !== null) {
    setVisitors([]);
  }
}, [selectedYardId]);
  useEffect(() => {
    loadVisitors();
    const interval = setInterval(loadVisitors, 15000);
    return () => clearInterval(interval);
  }, [selectedYardId]);

  const searchTruck = () => {
    if (searchPlate.length < 3) return;
    axios.post('/security/searchtruck', { plate_number: searchPlate })
      .then(res => {
        if (res.data.data.length > 0) {
          setFoundTruck(res.data.data[0]);
        } else {
          setFoundTruck(null);
          setNewCarNumber(searchPlate);
          setShowAddModal(true);
        }
      })
      .catch(() => {
        setFoundTruck(null);
        setNewCarNumber(searchPlate);
        setShowAddModal(true);
      });
  };

  const addVisitor = () => {
    if (!foundTruck || !selectedYardId) return;

    axios.post('/security/addvisitor', {
      plate_number: foundTruck.plate_number,
      truck_model_name: 'Unknown',
      yard_id: selectedYardId
    }).then(() => {
      toast.success('ТС добавлен в список');
      setFoundTruck(null);
      setSearchPlate('');
      inputRef.current?.focus();
      loadVisitors();
    }).catch(() => {
      toast.error('Ошибка при добавлении ТС');
    });
  };

  const addVisitorManually = () => {
    if (!newCarNumber || !newModel || !selectedYardId) return;
    axios.post('/security/addvisitor', {
      plate_number: newCarNumber,
      truck_model_name: newModel,
      yard_id: selectedYardId
    }).then(() => {
      toast.success('ТС добавлен вручную');
      setShowAddModal(false);
      setSearchPlate('');
      setNewModel('');
      setFoundTruck(null);
      inputRef.current?.focus();
      loadVisitors();
    }).catch(() => {
      toast.error('Ошибка при ручном добавлении ТС');
    });
  };

  const exitVisitor = (visitorId: number) => {
    if (!confirm('Подтвердите выход ТС?')) return;
    axios.post('/security/exitvisitor', { id: visitorId })
      .then(() => loadVisitors())
      .catch(() => toast.error('Ошибка при выходе'));
  };

  const filteredVisitors = visitors.filter(v => {
    if (filter === 'on_territory') return !v.exit_date;
    if (filter === 'left') return !!v.exit_date;
    return true;
  });

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold">Раздел охраны (КПП)</h2>

      <div className="flex items-center gap-4">
        <label className="text-lg font-semibold">Выбор двора:</label>
        <select
          onChange={(e) => setSelectedYardId(Number(e.target.value))}
          className="border px-4 py-2 text-lg rounded w-64"
        >
          <option value="">-- выбрать --</option>
          {yards.map(yard => (
            <option key={yard.id} value={yard.id}>{yard.name}</option>
          ))}
        </select>
      </div>


      {selectedYardId && (
        <>
          <div className="mt-4 items-center flex gap-2">
            <label className="text-lg font-medium">Введите номер ТС:</label>
            <input
              type="text"
              ref={inputRef}
              value={searchPlate}
              placeholder="111ААА01"
              onChange={(e) => setSearchPlate(e.target.value)}
              onBlur={searchTruck}
              className="border px-4 py-2 text-lg rounded w-64"
              autoFocus
            />
          </div>

          {foundTruck ? (
            <div className="p-4 border rounded mt-2">
              <p>Найдено: {foundTruck.plate_number}</p>
              <Button onClick={addVisitor} className="mt-2 bg-green-600 text-white px-4 py-1">
                Добавить в список
              </Button>
            </div>
          ) : searchPlate.length >= 3 && (
            <div className="flex items-center gap-4 mt-2">
              <div className="text-red-600">ТС не найдено</div>
              <Button
                className="bg-black text-white px-3 py-1"
                onClick={() => {
                  setNewCarNumber(searchPlate);
                  setShowAddModal(true);
                }}
              >
                Добавить ТС
              </Button>
            </div>
          )}

          {showAddModal && (
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Добавить новую машину</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Номер машины</Label>
                    <Input
                      value={newCarNumber}
                      onChange={(e) => setNewCarNumber(e.target.value)}
                      placeholder="Например: 111AAA01"
                    />
                  </div>
                  <div>
                    <Label>Модель</Label>
                    <Input
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      placeholder="Например: Toyota Camry"
                    />
                  </div>
                  <Button onClick={addVisitorManually} className="w-full">
                    Добавить машину и зафиксировать прибытие
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

<div className="mt-6">
  <div className="flex justify-between items-center mb-4">
    <h3 className="font-semibold text-lg">ТС на территории ({filteredVisitors.length})</h3>
    <select
      value={filter}
      onChange={(e) => setFilter(e.target.value as any)}
      className="border rounded px-3 py-2 text-sm"
    >
      <option value="on_territory">На территории</option>
      <option value="left">Вне территории</option>
      <option value="all">Все</option>
    </select>
  </div>

  {loading && <p className="text-sm mt-2">Загрузка...</p>}

  <div className="space-y-3">
    {filteredVisitors.map(visitor => {
      // Определяем цвет фона и бордера в зависимости от VIP статуса (как на странице грузовиков)
      const getCardClass = () => {
        if (visitor.truck_vip_level === 1 || visitor.truck_vip_level === '1') 
          return 'border-2 border-amber-500 bg-amber-50/50';
        if (visitor.truck_vip_level === 2 || visitor.truck_vip_level === '2') 
          return 'border-2 border-slate-500 bg-slate-50/50';
        if (visitor.truck_vip_level === 3 || visitor.truck_vip_level === '3') 
          return 'border-2 border-green-500 bg-green-50/50';
        return 'border border-gray-200';
      };

      const getVipBadge = () => {
        if (visitor.truck_vip_level === 1 || visitor.truck_vip_level === '1') 
          return <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-500 text-white">⭐ VIP</span>;
        if (visitor.truck_vip_level === 2 || visitor.truck_vip_level === '2') 
          return <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-500 text-white">👤 Руководство</span>;
        if (visitor.truck_vip_level === 3 || visitor.truck_vip_level === '3') 
          return <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-600 text-white">🚒 Зд обход</span>;
        return null;
      };

      return (
        <div
          key={visitor.id}
          className={`${getCardClass()} rounded-lg shadow-sm hover:shadow-md transition-shadow p-4`}
        >
          {/* Заголовок карточки */}
          <div className="flex items-center justify-between mb-3 pb-3 border-b">
            <div className="flex items-center gap-3">
              <Car className="h-6 w-6 text-gray-600" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {visitor.plate_number}
                  </span>
                  {getVipBadge()}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {visitor.truck_brand_name ? `${visitor.truck_brand_name} ${visitor.truck_model_name || ''}`.trim() : (visitor.truck_model_name || '-')}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  visitor.exit_date 
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                }`}
              >
                {visitor.status_name}
              </span>
              {!visitor.exit_date && (
                <Button
                  onClick={() => exitVisitor(visitor.id)}
                  variant="destructive"
                  size="sm"
                  className="gap-1"
                >
                  <LogOut className="h-4 w-4" />
                  Покинул
                </Button>
              )}
            </div>
          </div>

          {/* Основная информация в 3 колонки */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Колонка 1: Информация о персоне */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-gray-500 mt-1 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">ФИО</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {visitor.vip_full_name || visitor.user_name || '-'}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Briefcase className="h-4 w-4 text-blue-500 mt-1 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Должность</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {visitor.vip_position || visitor.user_company || '-'}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 text-gray-500 mt-1 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Телефон</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {visitor.user_phone || '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Колонка 2: Задание и владелец */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Briefcase className="h-4 w-4 text-gray-500 mt-1 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Владелец</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {visitor.truck_own || "Не указано"}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-gray-500 mt-1 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Задание</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {visitor.name || '-'}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Package className="h-4 w-4 text-gray-500 mt-1 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Пояснение</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {visitor.description || '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Колонка 3: Время въезда/выезда */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-green-600 mt-1 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Въезд</div>
                  <div className="text-xs text-gray-500 mb-0.5">
                    {visitor.entrance_device_name || '-'}
                  </div>
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {visitor.entry_date ? new Date(visitor.entry_date).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : '-'}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-red-600 mt-1 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Выезд</div>
                  <div className="text-xs text-gray-500 mb-0.5">
                    {visitor.exit_device_name || '-'}
                  </div>
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {visitor.exit_date ? new Date(visitor.exit_date).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : '-'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    })}
  </div>

  {filteredVisitors.length === 0 && !loading && (
    <div className="text-center py-12 text-gray-500">
      <Car className="h-12 w-12 mx-auto mb-3 opacity-50" />
      <p>Нет транспортных средств</p>
    </div>
  )}
</div>

        </>
      )}
    </div>
  );
};

export default SecurityCheck;
