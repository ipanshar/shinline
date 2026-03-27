import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { 
  Car, 
  Plus, 
  LogOut, 
  RefreshCw, 
  MapPin, 
  Clock, 
  User, 
  Phone,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  Truck as TruckIcon,
  FileText,
  UserRound,
  Building2,
  Target,
  CheckCircle,
  Camera,
  X,
  Loader2
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import ShiftHandoverReport from './ShiftHandoverReport';
import { createWorker } from 'tesseract.js';

interface Yard {
  id: number;
  name: string;
  strict_mode?: boolean; // Строгий режим: запрет въезда без разрешения
}

interface Truck {
  id: number;
  plate_number: string;
  driver_name?: string;
  driver_phone?: string;
  phone?: string;
  vip_level?: number;
  // Информация о разрешении
  has_permit?: boolean;
  permit_id?: number;
  permit_type?: 'one_time' | 'permanent';
  task_id?: number;
  task_name?: string;
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
  entrance_checkpoint_name?: string;
  exit_device_name?: string;
  exit_checkpoint_name?: string;
}

interface Task {
  truck_own: any;
  truck_plate_number?: string;
  truck_model_name?: string;
  truck_category_name?: string;
  user_name?: string;
  user_phone?: string;
  status_name?: string;
  plan_date?: string;
  yard_name?: string;
  description?: string;
  name?: string;
}

interface GuestPermit {
  id: number;
  truck_id: number;
  yard_id: number;
  plate_number: string;
  truck_model_name?: string;
  yard_name: string;
  is_guest: boolean;
  guest_name: string;
  guest_company: string | null;
  guest_destination: string | null;
  guest_purpose: string | null;
  guest_phone: string | null;
  begin_date: string | null;
  end_date: string | null;
  status_key: string;
  granted_by_name?: string;
  comment?: string;
}

const SecurityCheckMobile = () => {
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<number | null>(null);
  const [searchPlate, setSearchPlate] = useState('');
  const [foundTruck, setFoundTruck] = useState<Truck | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [expectedTasks, setExpectedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'on_territory' | 'left' | 'all' | 'with_task'>('on_territory');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCarNumber, setNewCarNumber] = useState('');
  const [newModel, setNewModel] = useState('');
  const [showExpectedTasks, setShowExpectedTasks] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [isVisitorsCollapsed, setIsVisitorsCollapsed] = useState(false);
  const [showShiftReport, setShowShiftReport] = useState(false);
  // Гостевые пропуска
  const [expectedGuests, setExpectedGuests] = useState<GuestPermit[]>([]);
  const [showExpectedGuests, setShowExpectedGuests] = useState(false);
  const [processingGuestId, setProcessingGuestId] = useState<number | null>(null);
  // Сканирование номера камерой
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('auth_token');

  // Загрузка дворов
  useEffect(() => {
    axios.post('/yard/getyards', {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => {
        setYards(res.data.data);
        // Автовыбор первого двора
        if (res.data.data.length > 0 && !selectedYardId) {
          setSelectedYardId(res.data.data[0].id);
        }
      })
      .catch(err => console.error('Ошибка при загрузке дворов:', err));
  }, []);

  // Загрузка посетителей
  const loadVisitors = useCallback(() => {
    if (!selectedYardId) return;
    setLoading(true);

    axios.post('/security/getvisitors', { yard_id: selectedYardId }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => setVisitors(res.data.data))
      .catch(err => console.error('Ошибка при загрузке посетителей:', err))
      .finally(() => setLoading(false));
  }, [selectedYardId, token]);

  // Загрузка ожидаемых ТС
  const loadExpectedTasks = useCallback(() => {
    axios.post('/task/actual-tasks', {}, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (res.data.status) {
          const filtered = res.data.data.filter(
            (task: Task) => task.truck_plate_number && task.status_name === 'Новый'
          );
          setExpectedTasks(filtered);
        }
      })
      .catch(err => console.error('Ошибка при загрузке задач:', err));
  }, [token]);

  // Загрузка ожидаемых гостей
  const loadExpectedGuests = useCallback(() => {
    if (!selectedYardId) return;
    
    axios.post('/security/getpermits', { 
      yard_id: selectedYardId, 
      status: 'active',
      is_guest: true  // Только гостевые пропуска
    }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => {
        if (res.data.status) {
          // Фильтруем только гостевые пропуска
          const guests = res.data.data.filter((p: GuestPermit) => p.is_guest === true);
          setExpectedGuests(guests);
        }
      })
      .catch(err => console.error('Ошибка при загрузке гостей:', err));
  }, [selectedYardId, token]);

  useEffect(() => {
    if (selectedYardId !== null) {
      setVisitors([]);
      loadVisitors();
      loadExpectedTasks();
      loadExpectedGuests();
    }
  }, [selectedYardId, loadVisitors, loadExpectedTasks, loadExpectedGuests]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadVisitors();
      loadExpectedTasks();
      loadExpectedGuests();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadVisitors, loadExpectedTasks, loadExpectedGuests]);

  // Быстрый пропуск гостя
  const quickAdmitGuest = async (guest: GuestPermit) => {
    if (!selectedYardId) return;
    
    setProcessingGuestId(guest.id);
    try {
      // Добавляем посетителя по номеру ТС из разрешения
      await axios.post('/security/addvisitor', {
        plate_number: guest.plate_number,
        truck_model_name: guest.truck_model_name || 'Unknown',
        yard_id: selectedYardId,
        permit_id: guest.id  // Передаём ID разрешения для связи
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      toast.success(`✅ Гость ${guest.guest_name} пропущен`);
      loadVisitors();
      loadExpectedGuests();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Ошибка при пропуске гостя');
    } finally {
      setProcessingGuestId(null);
    }
  };

  const searchTruck = () => {
    if (searchPlate.length < 3 || !selectedYardId) return;
    axios.post('/security/searchtruck', { plate_number: searchPlate, yard_id: selectedYardId }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
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

  // Получить текущий двор
  const getCurrentYard = () => yards.find(y => y.id === selectedYardId);

  // Проверка, находится ли ТС уже на территории
  const isTruckOnTerritory = (plateNumber: string) => {
    return visitors.some(v => 
      v.plate_number.toUpperCase() === plateNumber.toUpperCase() && 
      !v.exit_date
    );
  };

  // Получить посетителя по номеру ТС (для выезда)
  const getVisitorByPlate = (plateNumber: string) => {
    return visitors.find(v => 
      v.plate_number.toUpperCase() === plateNumber.toUpperCase() && 
      !v.exit_date
    );
  };

  const addVisitor = () => {
    if (!foundTruck || !selectedYardId) return;

    // Проверка, что ТС уже на территории
    if (isTruckOnTerritory(foundTruck.plate_number)) {
      toast.error('🚫 ТС уже находится на территории');
      return;
    }

    // Проверка строгого режима на фронте
    const currentYard = getCurrentYard();
    if (currentYard?.strict_mode && !foundTruck.has_permit) {
      toast.error('🚫 Въезд запрещён: строгий режим активен, требуется разрешение на въезд');
      return;
    }

    axios.post('/security/addvisitor', {
      plate_number: foundTruck.plate_number,
      truck_model_name: 'Unknown',
      yard_id: selectedYardId
    }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }).then(() => {
      toast.success('ТС добавлен в список');
      setFoundTruck(null);
      setSearchPlate('');
      inputRef.current?.focus();
      loadVisitors();
    }).catch((err) => {
      if (err.response?.data?.error_code === 'STRICT_MODE_NO_PERMIT') {
        toast.error('🚫 Въезд запрещён: строгий режим активен, требуется разрешение');
      } else {
        toast.error('Ошибка при добавлении ТС');
      }
    });
  };

  const addVisitorManually = () => {
    if (!newCarNumber || !newModel || !selectedYardId) return;
    
    // В строгом режиме запрещаем ручное добавление (нет информации о разрешении)
    const currentYard = getCurrentYard();
    if (currentYard?.strict_mode) {
      toast.error('🚫 Ручной въезд запрещён: строгий режим активен, требуется разрешение на въезд');
      return;
    }
    
    axios.post('/security/addvisitor', {
      plate_number: newCarNumber,
      truck_model_name: newModel,
      yard_id: selectedYardId
    }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }).then(() => {
      toast.success('ТС добавлен вручную');
      setShowAddModal(false);
      setSearchPlate('');
      setNewModel('');
      setNewCarNumber('');
      setFoundTruck(null);
      inputRef.current?.focus();
      loadVisitors();
    }).catch((err) => {
      if (err.response?.data?.error_code === 'STRICT_MODE_NO_PERMIT') {
        toast.error('🚫 Въезд запрещён: строгий режим активен');
      } else {
        toast.error('Ошибка при ручном добавлении ТС');
      }
    });
  };

  const exitVisitor = (visitorId: number) => {
    axios.post('/security/exitvisitor', { id: visitorId }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(() => {
        toast.success('Выезд зафиксирован');
        loadVisitors();
      })
      .catch(() => toast.error('Ошибка при выходе'));
  };

  // Функции для сканирования номера камерой
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      streamRef.current = stream;
      setShowCameraScanner(true);
      // Привязываем поток к видео после открытия модального окна
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(console.error);
        }
      }, 100);
    } catch (err) {
      console.error('Ошибка доступа к камере:', err);
      toast.error('Не удалось получить доступ к камере');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setShowCameraScanner(false);
    setIsScanning(false);
    setScanProgress(0);
  };

  const captureAndRecognize = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Проверяем, что видео готово
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      toast.error('Камера не готова. Подождите немного.');
      return;
    }

    // Установить размер canvas равным видео
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Захватить кадр
    ctx.drawImage(video, 0, 0);
    
    setIsScanning(true);
    setScanProgress(0);

    try {
      // Создаём воркер для распознавания
      const worker = await createWorker('rus+eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setScanProgress(Math.round(m.progress * 100));
          }
        }
      });
      
      // Распознавание текста
      const { data } = await worker.recognize(canvas);
      await worker.terminate();

      // Извлечь текст и найти номер
      const text = data.text;
      const plateNumber = extractPlateNumber(text);

      if (plateNumber) {
        setSearchPlate(plateNumber);
        toast.success(`Распознан номер: ${plateNumber}`);
        stopCamera();
        // Автоматический поиск
        setTimeout(() => {
          axios.post('/security/searchtruck', { plate_number: plateNumber, yard_id: selectedYardId }, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          })
            .then(res => {
              if (res.data.data.length > 0) {
                setFoundTruck(res.data.data[0]);
              } else {
                setFoundTruck(null);
                setNewCarNumber(plateNumber);
                setShowAddModal(true);
              }
            })
            .catch(() => {
              setFoundTruck(null);
              setNewCarNumber(plateNumber);
              setShowAddModal(true);
            });
        }, 100);
      } else {
        toast.error('Номер не распознан. Попробуйте навести камеру ближе.');
      }
    } catch (err) {
      console.error('Ошибка распознавания:', err);
      toast.error('Ошибка при распознавании номера');
    } finally {
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  // Функция извлечения номера из распознанного текста
  const extractPlateNumber = (text: string): string | null => {
    // Очистка текста
    const cleanText = text.toUpperCase().replace(/[^A-ZА-Я0-9]/g, '');
    
    // Паттерны для российских номеров
    // Стандартный: А123ВС77, А123ВС777
    const russianPattern = /([АВЕКМНОРСТУХ])(\d{3})([АВЕКМНОРСТУХ]{2})(\d{2,3})/;
    // Также проверяем латиницу, которую может распознать OCR
    const latinPattern = /([ABEKMHOPCTYX])(\d{3})([ABEKMHOPCTYX]{2})(\d{2,3})/;
    
    let match = cleanText.match(russianPattern);
    if (match) {
      return match[0];
    }
    
    match = cleanText.match(latinPattern);
    if (match) {
      // Конвертируем латиницу в кириллицу
      const latinToCyrillic: { [key: string]: string } = {
        'A': 'А', 'B': 'В', 'E': 'Е', 'K': 'К', 'M': 'М', 
        'H': 'Н', 'O': 'О', 'P': 'Р', 'C': 'С', 'T': 'Т', 
        'Y': 'У', 'X': 'Х'
      };
      return match[0].split('').map(c => latinToCyrillic[c] || c).join('');
    }

    // Если стандартный паттерн не найден, пробуем найти любую последовательность
    // букв и цифр длиной 8-9 символов
    const anyPattern = /[A-ZА-Я0-9]{6,9}/g;
    const matches = cleanText.match(anyPattern);
    if (matches && matches.length > 0) {
      // Возвращаем самый длинный результат
      return matches.sort((a, b) => b.length - a.length)[0];
    }

    return null;
  };

  const filteredVisitors = visitors.filter(v => {
    if (filter === 'on_territory') return !v.exit_date;
    if (filter === 'left') return !!v.exit_date;
    if (filter === 'with_task') return !v.exit_date && v.name; // На территории + есть задание
    return true;
  });

  // Название текущего фильтра
  const getFilterName = () => {
    switch (filter) {
      case 'on_territory': return 'На территории';
      case 'left': return 'Покинули';
      case 'with_task': return 'С заданиями';
      default: return 'Все';
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const getVipStyle = (vipLevel?: number | string) => {
    const level = typeof vipLevel === 'string' ? parseInt(vipLevel) : vipLevel;
    switch (level) {
      case 1: return { bg: 'bg-amber-100 dark:bg-amber-900/30', border: 'border-amber-400', badge: '⭐ VIP', badgeBg: 'bg-amber-500' };
      case 2: return { bg: 'bg-slate-200 dark:bg-slate-700/50', border: 'border-slate-400', badge: '👤 Рук.', badgeBg: 'bg-slate-500' };
      case 3: return { bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-400', badge: '🚒 Обход', badgeBg: 'bg-green-600' };
      default: return { bg: 'bg-white dark:bg-gray-900', border: 'border-gray-200', badge: null, badgeBg: '' };
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Шапка */}
      <header className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b shadow-sm">
        <div className="px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <TruckIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="hidden xs:inline">КПП</span>
              {/* Индикатор строгого режима */}
              {getCurrentYard()?.strict_mode && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                  🔒 Строгий
                </span>
              )}
            </h1>
            
            {/* Выбор двора */}
            <select
              value={selectedYardId || ''}
              onChange={(e) => setSelectedYardId(Number(e.target.value))}
              className="flex-1 max-w-[200px] sm:max-w-[300px] border rounded-lg px-2 py-1.5 sm:px-3 sm:py-2 text-sm sm:text-base bg-white dark:bg-gray-700"
            >
              <option value="">Выбрать двор</option>
              {yards.map(yard => (
                <option key={yard.id} value={yard.id}>
                  {yard.name} {yard.strict_mode ? '🔒' : ''}
                </option>
              ))}
            </select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowShiftReport(true)}
              title="Передача смены"
            >
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                loadVisitors();
                loadExpectedTasks();
              }}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      {selectedYardId && (
        <main className="px-3 py-3 sm:px-4 sm:py-4 space-y-4">
          {/* Поиск и добавление ТС */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 sm:p-4 shadow-sm">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  ref={inputRef}
                  type="text"
                  value={searchPlate}
                  onChange={(e) => setSearchPlate(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && searchTruck()}
                  placeholder="Номер ТС..."
                  className="pl-9 text-base sm:text-lg font-mono"
                />
              </div>
              <Button 
                onClick={startCamera}
                variant="outline"
                className="px-3"
                title="Сканировать номер камерой"
              >
                <Camera className="w-5 h-5" />
              </Button>
              <Button onClick={searchTruck} disabled={searchPlate.length < 3}>
                <Search className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Найти</span>
              </Button>
            </div>

            {/* Результат поиска */}
            {foundTruck && (
              <div className={`mt-3 p-3 border rounded-lg ${
                isTruckOnTerritory(foundTruck.plate_number)
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300'
                  : foundTruck.has_permit 
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200' 
                    : getCurrentYard()?.strict_mode 
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-300'
                      : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-lg">{foundTruck.plate_number}</span>
                      {isTruckOnTerritory(foundTruck.plate_number) ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500 text-white">
                          📍 На территории
                        </span>
                      ) : foundTruck.has_permit ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          foundTruck.permit_type === 'one_time' 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {foundTruck.permit_type === 'one_time' ? '🎫 Разовый' : '♾️ Постоянный'}
                        </span>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          getCurrentYard()?.strict_mode 
                            ? 'bg-red-500 text-white' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {getCurrentYard()?.strict_mode ? '🚫 Въезд запрещён' : '⚠️ Нет разрешения'}
                        </span>
                      )}
                    </div>
                    {foundTruck.driver_name && (
                      <div className="text-sm text-gray-600 mt-1">
                        👤 {foundTruck.driver_name}
                        {foundTruck.driver_phone && (
                          <a href={`tel:${foundTruck.driver_phone}`} className="ml-2 text-blue-600">
                            📞 {foundTruck.driver_phone}
                          </a>
                        )}
                      </div>
                    )}
                    {foundTruck.task_name && (
                      <div className="text-sm text-gray-500 truncate">📦 {foundTruck.task_name}</div>
                    )}
                    {/* Предупреждение о нахождении на территории */}
                    {isTruckOnTerritory(foundTruck.plate_number) && (
                      <div className="text-xs text-blue-600 mt-1 font-medium">
                        🚛 ТС уже находится на территории
                      </div>
                    )}
                    {/* Предупреждение о строгом режиме */}
                    {!isTruckOnTerritory(foundTruck.plate_number) && getCurrentYard()?.strict_mode && !foundTruck.has_permit && (
                      <div className="text-xs text-red-600 mt-1 font-medium">
                        🔒 Строгий режим: въезд только с разрешением
                      </div>
                    )}
                  </div>
                  {isTruckOnTerritory(foundTruck.plate_number) ? (
                    <Button 
                      onClick={() => {
                        const visitor = getVisitorByPlate(foundTruck.plate_number);
                        if (visitor) {
                          exitVisitor(visitor.id);
                          setFoundTruck(null);
                          setSearchPlate('');
                        }
                      }}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      <LogOut className="w-4 h-4 mr-1" />
                      Выезд
                    </Button>
                  ) : (
                    <Button 
                      onClick={addVisitor} 
                      disabled={getCurrentYard()?.strict_mode && !foundTruck.has_permit}
                      className={
                        getCurrentYard()?.strict_mode && !foundTruck.has_permit
                          ? 'bg-gray-400 cursor-not-allowed'
                          : foundTruck.has_permit 
                            ? 'bg-green-600 hover:bg-green-700' 
                            : 'bg-amber-600 hover:bg-amber-700'
                      }
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Въезд
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Ожидаемые ТС (сворачиваемый блок) */}
          {expectedTasks.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              <button
                className="w-full px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between text-left"
                onClick={() => setShowExpectedTasks(!showExpectedTasks)}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                  <span className="font-semibold text-sm sm:text-base">Ожидаемые ТС</span>
                  <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {expectedTasks.length}
                  </span>
                </div>
                {showExpectedTasks ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </button>

              {showExpectedTasks && (
                <div className="border-t max-h-60 overflow-y-auto">
                  {expectedTasks.map((task, i) => (
                    <div key={i} className="px-3 py-2 sm:px-4 sm:py-3 border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <div className="flex items-center justify-between">
                        <div className="font-mono font-bold">{task.truck_plate_number}</div>
                        {task.plan_date && (
                          <span className="text-xs text-gray-500">
                            {new Date(task.plan_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-600 mt-0.5">
                        {task.name && <span>📦 {task.name}</span>}
                        {task.user_name && <span className="ml-2">👤 {task.user_name}</span>}
                      </div>
                      {(task.truck_category_name || task.truck_model_name) && (
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          🚛 {[task.truck_category_name, task.truck_model_name].filter(Boolean).join(' • ')}
                        </div>
                      )}
                      {task.description && (
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words">
                          📝 {task.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 🎫 Ожидаемые ГОСТИ (сворачиваемый блок) */}
          {expectedGuests.length > 0 && (
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl shadow-sm overflow-hidden border border-purple-200 dark:border-purple-700">
              <button
                className="w-full px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between text-left"
                onClick={() => setShowExpectedGuests(!showExpectedGuests)}
              >
                <div className="flex items-center gap-2">
                  <UserRound className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                  <span className="font-semibold text-sm sm:text-base text-purple-700 dark:text-purple-300">
                    Ожидаемые гости
                  </span>
                  <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {expectedGuests.length}
                  </span>
                </div>
                {showExpectedGuests ? <ChevronDown className="w-5 h-5 text-purple-600" /> : <ChevronRight className="w-5 h-5 text-purple-600" />}
              </button>

              {showExpectedGuests && (
                <div className="border-t border-purple-200 dark:border-purple-700 max-h-80 overflow-y-auto">
                  {expectedGuests.map((guest) => (
                    <div 
                      key={guest.id} 
                      className="px-3 py-3 sm:px-4 sm:py-4 border-b border-purple-100 dark:border-purple-800 last:border-b-0 hover:bg-purple-100/50 dark:hover:bg-purple-900/50"
                    >
                      {/* Верхняя строка: ТС и кнопка пропуска */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <TruckIcon className="w-4 h-4 text-gray-500" />
                          <span className="font-mono font-bold text-sm">{guest.plate_number}</span>
                        </div>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => quickAdmitGuest(guest)}
                          disabled={processingGuestId === guest.id}
                        >
                          {processingGuestId === guest.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Пропустить
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Информация о госте */}
                      <div className="space-y-1 pl-6">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-purple-500" />
                          <span className="font-medium text-sm">{guest.guest_name}</span>
                        </div>
                        
                        {guest.guest_company && (
                          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <Building2 className="w-3.5 h-3.5" />
                            <span className="text-xs">{guest.guest_company}</span>
                          </div>
                        )}
                        
                        {guest.guest_destination && (
                          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <Target className="w-3.5 h-3.5" />
                            <span className="text-xs">К кому: {guest.guest_destination}</span>
                          </div>
                        )}
                        
                        {guest.guest_purpose && (
                          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <FileText className="w-3.5 h-3.5" />
                            <span className="text-xs">Цель: {guest.guest_purpose}</span>
                          </div>
                        )}
                        
                        {guest.guest_phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-green-500" />
                            <a href={`tel:${guest.guest_phone}`} className="text-xs text-blue-600 underline">
                              {guest.guest_phone}
                            </a>
                          </div>
                        )}

                        {guest.comment && (
                          <div className="text-xs text-gray-500 italic mt-1">
                            💬 {guest.comment}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Блок посетителей - сворачиваемый */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            {/* Заголовок - кликабельный для сворачивания */}
            <div
              className="w-full px-3 py-2 sm:py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
            >
              <div 
                className="flex items-center gap-2 flex-1"
                onClick={() => setIsVisitorsCollapsed(!isVisitorsCollapsed)}
              >
                <Car className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
                <span className="font-semibold text-sm sm:text-base">
                  {getFilterName()}
                </span>
                <span className="bg-gray-200 dark:bg-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {filteredVisitors.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Фильтр */}
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setShowFilterMenu(!showFilterMenu); }}
                  >
                    <Filter className="w-4 h-4 mr-1" />
                    <span className="hidden sm:inline">Фильтр</span>
                  </Button>

                  {showFilterMenu && (
                    <div className="absolute right-0 mt-1 bg-white dark:bg-gray-800 border rounded-lg shadow-lg z-10 min-w-[180px]">
                      {[
                        { key: 'on_territory', label: '🟢 На территории' },
                        { key: 'with_task', label: '📦 С заданиями' },
                        { key: 'left', label: '🔴 Покинули' },
                        { key: 'all', label: '📋 Все' },
                      ].map((f) => (
                        <button
                          key={f.key}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                            filter === f.key ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFilter(f.key as any);
                            setShowFilterMenu(false);
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                <div onClick={() => setIsVisitorsCollapsed(!isVisitorsCollapsed)} className="cursor-pointer">
                  {isVisitorsCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </div>
            </div>

            {/* Содержимое - скрывается при сворачивании */}
            {!isVisitorsCollapsed && (
              <div className="border-t">
          {/* Список посетителей (карточки) */}
          <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
            {loading && visitors.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-2" />
                Загрузка...
              </div>
            )}

            {!loading && filteredVisitors.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Car className="w-12 h-12 mx-auto mb-2 opacity-50" />
                {filter === 'on_territory' ? 'Нет ТС на территории' : 'Нет записей'}
              </div>
            )}

            {filteredVisitors.map((visitor) => {
              const vipStyle = getVipStyle(visitor.truck_vip_level);
              const entryTime = formatDateTime(visitor.entry_date);
              const exitTime = visitor.exit_date ? formatDateTime(visitor.exit_date) : null;

              return (
                <div
                  key={visitor.id}
                  className={`${vipStyle.bg} border ${vipStyle.border} rounded-xl overflow-hidden shadow-sm`}
                >
                  {/* Основная строка */}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* Номер и VIP */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-lg sm:text-xl tracking-wider">
                            {visitor.plate_number}
                          </span>
                          {vipStyle.badge && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${vipStyle.badgeBg}`}>
                              {vipStyle.badge}
                            </span>
                          )}
                        </div>

                        {/* Задание */}
                        {visitor.name && (
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                            📦 {visitor.name}
                          </div>
                        )}

                        {/* Время въезда */}
                        <div className="mt-2 flex flex-wrap items-start gap-2 text-xs">
                          <span className="inline-flex items-start gap-1 rounded-md bg-gray-100 px-2 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="leading-tight">
                              <span className="block text-[11px] text-gray-500 dark:text-gray-400">Въезд</span>
                              <span className="block">{entryTime.date}</span>
                              <span className="block font-medium">{entryTime.time}</span>
                            </span>
                          </span>
                          {exitTime && (
                            <span className="inline-flex items-start gap-1 rounded-md bg-red-50 px-2 py-1 text-red-600 dark:bg-red-950/30 dark:text-red-400">
                              <LogOut className="mt-0.5 h-3 w-3 shrink-0" />
                              <span className="leading-tight">
                                <span className="block text-[11px] text-red-400 dark:text-red-500">Выезд</span>
                                <span className="block">{exitTime.date}</span>
                                <span className="block font-medium">{exitTime.time}</span>
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Статус и действие */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`text-xs font-medium px-2 py-1 rounded ${
                          visitor.exit_date
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }`}>
                          {visitor.status_name}
                        </span>

                        {!visitor.exit_date && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Подтвердить выезд ТС?')) {
                                exitVisitor(visitor.id);
                              }
                            }}
                          >
                            <LogOut className="w-4 h-4 mr-1" />
                            Выезд
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="px-3 pb-3 pt-0 border-t border-gray-200 dark:border-gray-700 space-y-2 text-sm">
                    {visitor.truck_model_name && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Car className="w-4 h-4" />
                        {visitor.truck_model_name}
                      </div>
                    )}
                    {visitor.truck_own && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPin className="w-4 h-4" />
                        Владелец: {visitor.truck_own}
                      </div>
                    )}
                    {visitor.user_name && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <User className="w-4 h-4" />
                        {visitor.user_name}
                      </div>
                    )}
                    {visitor.user_phone && (
                      <a
                        href={`tel:${visitor.user_phone}`}
                        className="flex items-center gap-2 text-blue-600"
                      >
                        <Phone className="w-4 h-4" />
                        {visitor.user_phone}
                      </a>
                    )}
                    {visitor.description && (
                      <div className="text-gray-500 text-xs mt-1">
                        {visitor.description}
                      </div>
                    )}
                    <div className="text-xs text-gray-400">
                      {visitor.entrance_device_name ? (
                        <>📷 Въезд: {visitor.entrance_device_name}{visitor.entrance_checkpoint_name ? ` • КПП ${visitor.entrance_checkpoint_name}` : ''}</>
                      ) : (
                        <>✍️ Въезд: ручное подтверждение{visitor.entrance_checkpoint_name ? ` • КПП ${visitor.entrance_checkpoint_name}` : ''}</>
                      )}
                    </div>
                    {(visitor.exit_date || visitor.exit_device_name || visitor.exit_checkpoint_name) && (
                      <div className="text-xs text-gray-400">
                        {visitor.exit_device_name ? (
                          <>📷 Выезд: {visitor.exit_device_name}{visitor.exit_checkpoint_name ? ` • КПП ${visitor.exit_checkpoint_name}` : ''}</>
                        ) : (
                          <>✍️ Выезд: ручное подтверждение{visitor.exit_checkpoint_name ? ` • КПП ${visitor.exit_checkpoint_name}` : ''}</>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* Экран выбора двора */}
      {!selectedYardId && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <MapPin className="w-16 h-16 text-gray-300 mb-4" />
          <h2 className="text-xl font-semibold text-gray-600 mb-2">Выберите двор</h2>
          <p className="text-gray-400 text-center mb-6">
            Для начала работы выберите двор в шапке страницы
          </p>
          <div className="w-full max-w-xs space-y-2">
            {yards.map((yard) => (
              <button
                key={yard.id}
                className="w-full p-4 bg-white dark:bg-gray-800 border rounded-xl text-left hover:border-blue-500 transition-colors"
                onClick={() => setSelectedYardId(yard.id)}
              >
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-blue-500" />
                  <span className="font-medium">{yard.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Модальное окно добавления ТС */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle>Добавить новое ТС</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Номер машины</Label>
              <Input
                value={newCarNumber}
                onChange={(e) => setNewCarNumber(e.target.value.toUpperCase())}
                placeholder="Например: 111AAA01"
                className="font-mono text-lg"
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
              <Plus className="w-4 h-4 mr-2" />
              Добавить и зафиксировать въезд
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Отчёт о передаче смены */}
      <ShiftHandoverReport
        open={showShiftReport}
        onOpenChange={setShowShiftReport}
        yardId={selectedYardId}
        yardName={getCurrentYard()?.name}
      />

      {/* Модальное окно сканера номера */}
      <Dialog open={showCameraScanner} onOpenChange={(open) => !open && stopCamera()}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              Сканирование номера
            </DialogTitle>
          </DialogHeader>
          <div className="relative bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-video object-cover"
            />
            {/* Рамка для наведения */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-white/70 rounded-lg w-4/5 h-16 flex items-center justify-center">
                <span className="text-white/70 text-sm bg-black/50 px-2 py-1 rounded">
                  Наведите на номер
                </span>
              </div>
            </div>
            {/* Индикатор сканирования */}
            {isScanning && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                <Loader2 className="w-10 h-10 text-white animate-spin mb-2" />
                <span className="text-white text-sm">Распознавание... {scanProgress}%</span>
              </div>
            )}
            {/* Скрытый canvas для захвата кадра */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <div className="p-4 flex gap-2">
            <Button
              onClick={stopCamera}
              variant="outline"
              className="flex-1"
            >
              <X className="w-4 h-4 mr-2" />
              Отмена
            </Button>
            <Button
              onClick={captureAndRecognize}
              disabled={isScanning}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              <Camera className="w-4 h-4 mr-2" />
              {isScanning ? 'Распознаю...' : 'Сфотографировать'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SecurityCheckMobile;
