import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Calendar, 
  Download, 
  Search, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownLeft,
  Clock,
  Truck,
  MapPin,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Yard {
  id: number;
  name: string;
}

interface VisitorRecord {
  id: number;
  plate_number: string;
  truck_model_name?: string;
  truck_own?: string;
  truck_vip_level?: number;
  status_name: string;
  entry_date: string;
  exit_date?: string;
  task_name?: string; // Название задания
  description?: string;
  user_name?: string;
  user_phone?: string;
  yard_name?: string;
  entrance_device_name?: string;
  exit_device_name?: string;
  duration_minutes?: number;
  // Информация о водителе и ТС
  driver_name?: string;
  driver_phone?: string;
  vehicle_color?: string;
  truck_color?: string;
  truck_brand_name?: string;
  // Информация о разрешении
  permit_id?: number;
  permit_one_time?: boolean;
}

const VisitorHistory: React.FC = () => {
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<number | null>(null);
  const [records, setRecords] = useState<VisitorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [searchPlate, setSearchPlate] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'on_territory' | 'left'>('all');
  const [sortField, setSortField] = useState<'entry_date' | 'exit_date' | 'plate_number'>('entry_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(true);

  const token = localStorage.getItem('auth_token');

  // Загрузка дворов
  useEffect(() => {
    axios.post('/yard/getyards', {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => {
        setYards(res.data.data);
        if (res.data.data.length > 0) {
          setSelectedYardId(res.data.data[0].id);
        }
      })
      .catch(err => console.error('Ошибка загрузки дворов:', err));
  }, [token]);

  // Загрузка истории
  const loadHistory = useCallback(async () => {
    if (!selectedYardId) return;
    
    setLoading(true);
    try {
      const response = await axios.post('/security/getvisitorhistory', {
        yard_id: selectedYardId,
        date_from: dateFrom,
        date_to: dateTo,
        plate_number: searchPlate || undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      if (response.data.status) {
        let data = response.data.data || [];
        
        // Сортировка
        data.sort((a: VisitorRecord, b: VisitorRecord) => {
          let valA = a[sortField] || '';
          let valB = b[sortField] || '';
          if (sortDir === 'asc') {
            return valA > valB ? 1 : -1;
          }
          return valA < valB ? 1 : -1;
        });
        
        setRecords(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки истории:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedYardId, dateFrom, dateTo, searchPlate, filterStatus, sortField, sortDir, token]);

  useEffect(() => {
    if (selectedYardId) {
      loadHistory();
    }
  }, [selectedYardId, loadHistory]);

  // Форматирование даты/времени
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Расчёт времени на территории
  const calculateDuration = (entry: string, exit?: string) => {
    const entryDate = new Date(entry);
    const exitDate = exit ? new Date(exit) : new Date();
    const diffMs = exitDate.getTime() - entryDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins} мин`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours < 24) return `${hours}ч ${mins}м`;
    const days = Math.floor(hours / 24);
    return `${days}д ${hours % 24}ч`;
  };

  // VIP стиль
  const getVipBadge = (level?: number) => {
    switch (level) {
      case 1: return <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">⭐ VIP</span>;
      case 2: return <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-slate-500 text-white">👤 Рук.</span>;
      case 3: return <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-green-600 text-white">🚒 Обход</span>;
      default: return null;
    }
  };

  // Экспорт в CSV
  const exportToCSV = () => {
    const headers = ['Номер ТС', 'Модель', 'Цвет', 'Водитель', 'Телефон', 'Разрешение', 'Задание', 'Въезд', 'Выезд', 'Длительность', 'Статус'];
    const rows = records.map(r => [
      r.plate_number,
      [r.truck_brand_name, r.truck_model_name].filter(Boolean).join(' ') || '',
      r.vehicle_color || r.truck_color || '',
      r.driver_name || '',
      r.driver_phone || '',
      r.permit_id ? (r.permit_one_time ? 'Разовый' : 'Постоянный') : 'Нет',
      r.task_name || '',
      formatDateTime(r.entry_date),
      formatDateTime(r.exit_date),
      calculateDuration(r.entry_date, r.exit_date),
      r.status_name
    ]);
    
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `history_${selectedYardId}_${dateFrom}_${dateTo}.csv`;
    link.click();
  };

  // Статистика
  const stats = {
    total: records.length,
    onTerritory: records.filter(r => !r.exit_date).length,
    left: records.filter(r => r.exit_date).length,
    withPermit: records.filter(r => r.permit_id).length,
    withoutPermit: records.filter(r => !r.permit_id).length,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      {/* Заголовок */}
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Calendar className="w-6 h-6" />
          История въездов/выездов
        </h1>
        <p className="text-sm text-gray-500 mt-1">Детализированный отчёт по движению ТС</p>
      </div>

      {/* Фильтры */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4 overflow-hidden">
        <button
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
          onClick={() => setShowFilters(!showFilters)}
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <span className="font-semibold">Фильтры</span>
          </div>
          {showFilters ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {showFilters && (
          <div className="px-4 pb-4 border-t space-y-4">
            {/* Двор */}
            <div className="pt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Двор
              </label>
              <select
                value={selectedYardId || ''}
                onChange={(e) => setSelectedYardId(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
              >
                {yards.map(yard => (
                  <option key={yard.id} value={yard.id}>{yard.name}</option>
                ))}
              </select>
            </div>

            {/* Период */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Дата с
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Дата по
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {/* Поиск по номеру */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Номер ТС
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Поиск по номеру..."
                  value={searchPlate}
                  onChange={(e) => setSearchPlate(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            {/* Статус */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Статус
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="all">Все</option>
                <option value="on_territory">На территории</option>
                <option value="left">Покинули</option>
              </select>
            </div>

            {/* Кнопки */}
            <div className="flex gap-2 pt-2">
              <Button onClick={loadHistory} disabled={loading} className="flex-1">
                <Search className="w-4 h-4 mr-2" />
                Найти
              </Button>
              <Button variant="outline" onClick={exportToCSV} disabled={records.length === 0}>
                <Download className="w-4 h-4 mr-2" />
                Excel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
          <div className="text-xs text-gray-500">Всего записей</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.onTerritory}</div>
          <div className="text-xs text-gray-500">На территории</div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{stats.left}</div>
          <div className="text-xs text-gray-500">Покинули</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.withPermit}</div>
          <div className="text-xs text-gray-500">С разрешением</div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{stats.withoutPermit}</div>
          <div className="text-xs text-gray-500">Без разрешения</div>
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        {/* Заголовок таблицы */}
        <div className="hidden md:grid md:grid-cols-9 gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <div 
            className="cursor-pointer hover:text-blue-600 flex items-center gap-1"
            onClick={() => { setSortField('plate_number'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}
          >
            Номер ТС
            {sortField === 'plate_number' && (sortDir === 'asc' ? '↑' : '↓')}
          </div>
          <div>Модель/Цвет</div>
          <div>Водитель</div>
          <div>Разрешение</div>
          <div>Задание</div>
          <div 
            className="cursor-pointer hover:text-blue-600 flex items-center gap-1"
            onClick={() => { setSortField('entry_date'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}
          >
            Въезд
            {sortField === 'entry_date' && (sortDir === 'asc' ? '↑' : '↓')}
          </div>
          <div 
            className="cursor-pointer hover:text-blue-600 flex items-center gap-1"
            onClick={() => { setSortField('exit_date'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}
          >
            Выезд
            {sortField === 'exit_date' && (sortDir === 'asc' ? '↑' : '↓')}
          </div>
          <div>Время</div>
          <div>Статус</div>
        </div>

        {/* Загрузка */}
        {loading && (
          <div className="text-center py-8 text-gray-500">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-2" />
            Загрузка...
          </div>
        )}

        {/* Пустой список */}
        {!loading && records.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Нет записей за выбранный период</p>
            <p className="text-sm mt-1">Измените фильтры и нажмите "Найти"</p>
          </div>
        )}

        {/* Записи */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {records.map((record) => (
            <div
              key={record.id}
              className={`p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                !record.exit_date ? 'bg-green-50/50 dark:bg-green-900/10' : ''
              }`}
            >
              {/* Мобильный вид */}
              <div className="md:hidden space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-lg">{record.plate_number}</span>
                    {getVipBadge(record.truck_vip_level)}
                    {record.permit_id ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        record.permit_one_time 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {record.permit_one_time ? '🎫' : '♾️'}
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        ⚠️
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    record.exit_date 
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}>
                    {record.status_name}
                  </span>
                </div>

                {/* Модель и цвет ТС */}
                {(record.truck_model_name || record.truck_brand_name || record.vehicle_color || record.truck_color) && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    🚛 {[record.truck_brand_name, record.truck_model_name].filter(Boolean).join(' ')}
                    {(record.vehicle_color || record.truck_color) && (
                      <span className="ml-2 text-gray-500">({record.vehicle_color || record.truck_color})</span>
                    )}
                  </div>
                )}

                {/* Водитель */}
                {(record.driver_name || record.driver_phone) && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    👤 {record.driver_name || 'Без имени'}
                    {record.driver_phone && (
                      <a href={`tel:${record.driver_phone}`} className="ml-2 text-blue-600 hover:underline">
                        📞 {record.driver_phone}
                      </a>
                    )}
                  </div>
                )}
                
                {record.truck_own && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    🏢 Владелец: {record.truck_own}
                  </div>
                )}
                
                {record.task_name && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    📦 {record.task_name}
                  </div>
                )}
                
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <ArrowDownLeft className="w-3 h-3 text-green-500" />
                    {formatDateTime(record.entry_date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3 text-red-500" />
                    {formatDateTime(record.exit_date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {calculateDuration(record.entry_date, record.exit_date)}
                  </span>
                </div>
              </div>

              {/* Десктопный вид */}
              <div className="hidden md:grid md:grid-cols-9 gap-2 items-center text-sm">
                <div className="font-mono font-bold flex items-center gap-1">
                  {record.plate_number}
                  {getVipBadge(record.truck_vip_level)}
                </div>
                <div className="text-gray-600 dark:text-gray-400 truncate" title={[record.truck_brand_name, record.truck_model_name].filter(Boolean).join(' ') + (record.vehicle_color || record.truck_color ? ` (${record.vehicle_color || record.truck_color})` : '')}>
                  <div className="truncate text-xs">{[record.truck_brand_name, record.truck_model_name].filter(Boolean).join(' ') || '-'}</div>
                  {(record.vehicle_color || record.truck_color) && (
                    <div className="text-xs text-gray-400 truncate">{record.vehicle_color || record.truck_color}</div>
                  )}
                </div>
                <div className="text-gray-600 dark:text-gray-400" title={record.driver_phone || ''}>
                  <div className="truncate text-xs">{record.driver_name || '-'}</div>
                  {record.driver_phone && (
                    <a href={`tel:${record.driver_phone}`} className="text-xs text-blue-600 hover:underline truncate block">
                      {record.driver_phone}
                    </a>
                  )}
                </div>
                <div>
                  {record.permit_id ? (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      record.permit_one_time 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {record.permit_one_time ? '🎫 Разовый' : '♾️ Постоянный'}
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      ⚠️ Нет
                    </span>
                  )}
                </div>
                <div className="text-gray-600 dark:text-gray-400 truncate">
                  {record.task_name || '-'}
                </div>
                <div className="flex items-center gap-1 text-green-600 text-xs">
                  <ArrowDownLeft className="w-3 h-3" />
                  {formatDateTime(record.entry_date)}
                </div>
                <div className="flex items-center gap-1 text-red-600 text-xs">
                  <ArrowUpRight className="w-3 h-3" />
                  {formatDateTime(record.exit_date)}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <Clock className="w-3 h-3 text-gray-400" />
                  {calculateDuration(record.entry_date, record.exit_date)}
                </div>
                <div className={`text-xs font-medium px-2 py-0.5 rounded text-center ${
                  record.exit_date 
                    ? 'bg-gray-100 text-gray-600' 
                    : 'bg-green-100 text-green-700'
                }`}>
                  {record.exit_date ? 'Выехал' : 'На терр.'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VisitorHistory;
