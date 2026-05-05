import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Car, Plus, Search, X } from 'lucide-react';
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

interface ExitPermitSummary {
  id: number;
  valid_until?: string | null;
  comment?: string | null;
}

interface Visitor {
  id: number;
  plate_number: string;
  truck_model_name?: string;
  status_name: string;
  entry_date: string;
  exit_date?: string;
  truck: Truck;
  user_name?: string;
  user_phone?: string;
  description?: string;
  name?: string;
  truck_own: any;
  truck_vip_level?: number;
  entrance_device_name?: string;
  exit_device_name?: string;
  exit_permit_required?: boolean;
  has_active_exit_permit?: boolean;
  exit_permit?: ExitPermitSummary | null;
}

const SecurityCheck = () => {
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<number | null>(null);
  const [searchPlate, setSearchPlate] = useState('');
  const [foundTruck, setFoundTruck] = useState<Truck | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [territorySearch, setTerritorySearch] = useState('');
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

  const exitVisitor = async (visitorId: number) => {
    if (!confirm('Подтвердите выход ТС?')) return;
    try {
      await axios.post('/security/exitvisitor', { id: visitorId });
      loadVisitors();
    } catch (error: any) {
      if (error.response?.data?.code === 'exit_permit_required') {
        const reason = window.prompt('У этого визита нет разрешения на выезд. Укажите причину ручного выпуска:')?.trim() ?? '';
        if (reason.length < 3) {
          toast.error('Для ручного выпуска без разрешения нужна причина');
          return;
        }

        await axios.post('/security/exitvisitor', {
          id: visitorId,
          override_exit_permit: true,
          override_reason: reason,
        });
        loadVisitors();
        return;
      }

      toast.error(error.response?.data?.message || 'Ошибка при выходе');
    }
  };

  const visitorsByFilter = visitors.filter(v => {
    if (filter === 'on_territory') return !v.exit_date;
    if (filter === 'left') return !!v.exit_date;
    return true;
  });

  const normalizedTerritorySearch = territorySearch.trim().toUpperCase().replace(/[\s-]/g, '');
  const filteredVisitors = visitorsByFilter.filter((visitor) => {
    if (!normalizedTerritorySearch) return true;

    const searchable = [
      visitor.plate_number,
      visitor.user_name,
      visitor.user_phone,
      visitor.truck_model_name,
      visitor.name,
      visitor.description,
      visitor.entrance_device_name,
      visitor.exit_device_name,
      visitor.exit_permit?.comment,
    ]
      .filter(Boolean)
      .join(' ')
      .toUpperCase()
      .replace(/[\s-]/g, '');

    return searchable.includes(normalizedTerritorySearch);
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
  <div className="flex justify-between items-center mb-2">
    <h3 className="font-semibold text-lg">ТС на территории</h3>
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={territorySearch}
          onChange={(e) => setTerritorySearch(e.target.value.toUpperCase())}
          placeholder="Найти ТС на территории"
          className="w-72 rounded border py-1 pl-8 pr-8 text-sm"
        />
        {territorySearch && (
          <button
            type="button"
            onClick={() => setTerritorySearch('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Очистить поиск"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value as any)}
        className="border rounded px-2 py-1 text-sm"
      >
        <option value="on_territory">На территории</option>
        <option value="left">Вне территории</option>
        <option value="all">Все</option>
      </select>
    </div>
  </div>

  {territorySearch && (
    <div className="mb-2 text-xs text-gray-500">
      Найдено: {filteredVisitors.length} из {visitorsByFilter.length}
    </div>
  )}

  {/* Заголовок "таблицы" */}
  <div className="grid grid-cols-11 gap-2 px-2 py-1 bg-gray-100 font-semibold text-sm rounded">
    <div>Номер</div>
    <div>Владелец</div>
    <div>Модель</div>
    <div>Задание</div>
    <div>Пояснение</div>
    <div>Водитель</div>
    <div>Телефон</div>
    <div>Статус</div>
    <div>Въезд</div>
    <div>Выезд</div>
    <div className="text-center">Действие</div>
  </div>

  {loading && <p className="text-sm mt-2">Загрузка...</p>}

  {filteredVisitors.map(visitor => {
    const vipLevel = visitor.truck_vip_level;
    const exitPermitComment = visitor.exit_permit?.comment?.trim();

    // Определяем цвет фона в зависимости от VIP статуса
    const getRowClass = () => {
      if (vipLevel === 1) return 'bg-amber-100 dark:bg-amber-900/30 border-amber-400'; // VIP - золотой
      if (vipLevel === 2) return 'bg-slate-200 dark:bg-slate-700/50 border-slate-400'; // Руководство - серебристый
      if (vipLevel === 3) return 'bg-green-100 dark:bg-green-900/30 border-green-400'; // Зд обход - зеленый
      return 'hover:bg-gray-50'; // Обычный
    };

    const getVipBadge = () => {
      if (vipLevel === 1) return <span className="ml-2 text-xs font-bold px-2 py-1 rounded-full bg-amber-500 text-white">⭐ VIP</span>;
      if (vipLevel === 2) return <span className="ml-2 text-xs font-bold px-2 py-1 rounded-full bg-slate-500 text-white">👤 Руководство</span>;
      if (vipLevel === 3) return <span className="ml-2 text-xs font-bold px-2 py-1 rounded-full bg-green-600 text-white">🚒 Зд обход</span>;
      return null;
    };

    return (
    <div
      key={visitor.id}
      className={`grid grid-cols-11 gap-2 items-center px-2 py-2 border-b text-sm ${getRowClass()}`}
    >
      <div className="font-bold flex items-center">
        {visitor.plate_number}
        {getVipBadge()}
      </div>
      <div>{visitor.truck_own || "Не указано"}</div>
      <div>{visitor.truck_model_name || '-'}</div>
      <div>{visitor.name || '-'}</div>
      <div>{visitor.description || '-'}</div>
      <div>{visitor.user_name || '-'}</div>
      <div>{visitor.user_phone || '-'}</div>
      <div
        className={`px-2 py-1 rounded text-center font-medium ${
          visitor.exit_date ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}
      >
        <div>{visitor.status_name}</div>
        {!visitor.exit_date && (
          <>
            <div className={`mt-1 text-[11px] ${visitor.exit_permit_required ? visitor.has_active_exit_permit ? 'text-emerald-700' : 'text-amber-700' : 'text-slate-600'}`}>
              {visitor.exit_permit_required
                ? visitor.has_active_exit_permit
                  ? 'Выезд разрешён'
                  : 'Нужно разрешение на выезд'
                : 'Выезд свободный'}
            </div>
            {exitPermitComment && (
              <div className="mt-1 rounded bg-emerald-50 px-2 py-1 text-left text-[11px] text-emerald-900 whitespace-pre-wrap">
                Комментарий: {exitPermitComment}
              </div>
            )}
          </>
        )}
      </div>
      <div><div>{visitor.entrance_device_name ? 'Камера входа: '+visitor.entrance_device_name : ''}</div><div>{visitor.entry_date ? visitor.entry_date.slice(0, 16) : '-'}</div></div>
      <div><div>{visitor.exit_device_name ? 'Камера выхода: '+visitor.exit_device_name : ''}</div><div>{visitor.exit_date ? visitor.exit_date.slice(0, 16) : '-'}</div></div>
      <div className="text-center">
        {!visitor.exit_date && (
          <button
            onClick={() => exitVisitor(visitor.id)}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded cursor-pointer"
          >
            Покинул
          </button>
        )}
      </div>
    </div>
    );
  })}
</div>

        </>
      )}
    </div>
  );
};

export default SecurityCheck;
