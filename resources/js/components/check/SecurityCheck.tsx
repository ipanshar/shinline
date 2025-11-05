import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Car, Plus } from 'lucide-react';
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
  <div className="flex justify-between items-center mb-2">
    <h3 className="font-semibold text-lg">ТС на территории</h3>
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

  {filteredVisitors.map(visitor => (
    <div
      key={visitor.id}
      className="grid grid-cols-11 gap-2 items-center px-2 py-2 border-b text-sm hover:bg-gray-50"
    >
      <div className="font-bold">{visitor.plate_number}</div>
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
        {visitor.status_name}
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
  ))}
</div>

        </>
      )}
    </div>
  );
};

export default SecurityCheck;
