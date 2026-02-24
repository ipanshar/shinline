import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  AlertTriangle, 
  Check, 
  X, 
  Clock, 
  Truck, 
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Camera,
  MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

// Получаем токен авторизации
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface SimilarPlate {
  truck_id: number;
  plate_number: string;
  truck_model_name?: string;
  has_permit: boolean;
  task_id?: number;
  task_name?: string;
  similarity_percent: number;
}

interface ExpectedTask {
  id: number;
  name: string;
  description?: string;
  truck_id: number;
  plate_number: string;
  driver_name?: string;
  driver_phone?: string;
  plan_date?: string;
}

interface PendingVisitor {
  id: number;
  plate_number: string;
  original_plate_number?: string;
  entry_date: string;
  recognition_confidence?: number;
  yard_id: number;
  yard_name?: string;
  yard_strict_mode?: boolean;
  device_name?: string;
  matched_truck_id?: number;
  matched_plate_number?: string;
  task_id?: number;
  task_name?: string;
  has_permit?: boolean;
  pending_reason?: string;
  pending_reason_text?: string;
  similar_plates: SimilarPlate[];
  expected_tasks: ExpectedTask[];
}

interface Yard {
  id: number;
  name: string;
  strict_mode?: boolean;
}

interface PendingVisitorsProps {
  selectedYardId: number | null;
  strictMode?: boolean; // Строгий режим двора
  onConfirmed?: () => void;
}

const PendingVisitors: React.FC<PendingVisitorsProps> = ({ selectedYardId, strictMode, onConfirmed }) => {
  const [pendingVisitors, setPendingVisitors] = useState<PendingVisitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    visitor: PendingVisitor | null;
    selectedTruckId: number | null;
    selectedTaskId: number | null;
    correctedPlate: string;
  }>({
    open: false,
    visitor: null,
    selectedTruckId: null,
    selectedTaskId: null,
    correctedPlate: '',
  });
  const [searchPlate, setSearchPlate] = useState('');
  const [searchResults, setSearchResults] = useState<SimilarPlate[]>([]);
  const [searching, setSearching] = useState(false);

  const loadPendingVisitors = useCallback(async () => {
    if (!selectedYardId) return;
    
    setLoading(true);
    try {
      console.log('Loading pending visitors for yard:', selectedYardId);
      const response = await axios.post('/security/getpendingvisitors', {
        yard_id: selectedYardId,
      }, { headers: getAuthHeaders() });
      console.log('Pending visitors response:', response.data);
      if (response.data.status) {
        setPendingVisitors(response.data.data || []);
      }
    } catch (error) {
      console.error('Ошибка загрузки ожидающих подтверждения:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedYardId]);

  useEffect(() => {
    loadPendingVisitors();
    const interval = setInterval(loadPendingVisitors, 10000);
    return () => clearInterval(interval);
  }, [loadPendingVisitors]);

  const searchSimilarPlates = async (plate: string) => {
    if (plate.length < 3) return;
    
    setSearching(true);
    try {
      const response = await axios.post('/security/searchsimilarplates', {
        plate_number: plate,
        yard_id: selectedYardId,
      }, { headers: getAuthHeaders() });
      if (response.data.status) {
        setSearchResults(response.data.data);
      }
    } catch (error) {
      console.error('Ошибка поиска:', error);
    } finally {
      setSearching(false);
    }
  };

  const openConfirmDialog = (visitor: PendingVisitor, truck?: SimilarPlate, task?: ExpectedTask) => {
    setConfirmDialog({
      open: true,
      visitor,
      selectedTruckId: truck?.truck_id || task?.truck_id || null,
      selectedTaskId: truck?.task_id || task?.id || null,
      correctedPlate: truck?.plate_number || task?.plate_number || visitor.plate_number,
    });
    setSearchPlate('');
    setSearchResults([]);
  };

  const confirmVisitor = async () => {
    if (!confirmDialog.visitor) return;

    // Проверка строгого режима
    const selectedTruck = [...confirmDialog.visitor.similar_plates, ...searchResults].find(
      t => t.truck_id === confirmDialog.selectedTruckId
    );
    const hasPermit = selectedTruck?.has_permit || confirmDialog.visitor.expected_tasks.some(
      t => t.id === confirmDialog.selectedTaskId
    );

    if (strictMode && !hasPermit) {
      toast.error('🚫 Въезд запрещён: строгий режим активен, требуется разрешение на въезд');
      return;
    }

    const userId = localStorage.getItem('user_id') || '1';
    
    try {
      const response = await axios.post('/security/confirmvisitor', {
        visitor_id: confirmDialog.visitor.id,
        operator_user_id: parseInt(userId),
        truck_id: confirmDialog.selectedTruckId,
        task_id: confirmDialog.selectedTaskId,
        corrected_plate_number: confirmDialog.correctedPlate,
      }, { headers: getAuthHeaders() });

      if (response.data.status) {
        toast.success('Въезд подтверждён');
        setConfirmDialog({ open: false, visitor: null, selectedTruckId: null, selectedTaskId: null, correctedPlate: '' });
        loadPendingVisitors();
        onConfirmed?.();
      }
    } catch (error: any) {
      if (error.response?.data?.error_code === 'STRICT_MODE_NO_PERMIT') {
        toast.error('🚫 Въезд запрещён: строгий режим активен');
      } else {
        toast.error('Ошибка подтверждения');
      }
    }
  };

  const rejectVisitor = async (visitor: PendingVisitor, reason?: string) => {
    const userId = localStorage.getItem('user_id') || '1';
    
    try {
      const response = await axios.post('/security/rejectvisitor', {
        visitor_id: visitor.id,
        operator_user_id: parseInt(userId),
        reason: reason || 'Ложное срабатывание камеры',
      }, { headers: getAuthHeaders() });

      if (response.data.status) {
        toast.success('Запись отклонена');
        loadPendingVisitors();
      }
    } catch (error) {
      toast.error('Ошибка отклонения');
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-gray-500';
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Не показываем если двор не выбран
  if (!selectedYardId) return null;

  // Всегда показываем секцию (даже если пусто - чтобы видеть что работает)
  return (
    <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
      {/* Заголовок - кликабельный для сворачивания */}
      <button
        className="w-full px-3 py-2 sm:py-3 flex items-center justify-between text-left hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-base sm:text-lg text-amber-700 dark:text-amber-400">
            Ожидают подтверждения
          </h3>
          <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {loading ? '...' : pendingVisitors.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={(e) => { e.stopPropagation(); loadPendingVisitors(); }}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {isCollapsed ? <ChevronDown className="w-5 h-5 text-amber-600" /> : <ChevronUp className="w-5 h-5 text-amber-600" />}
        </div>
      </button>

      {/* Содержимое - скрывается при сворачивании */}
      {!isCollapsed && (
        <div className="px-3 pb-3">
      {/* Список ожидающих */}
      {pendingVisitors.length === 0 ? (
        <div className="text-center text-amber-600 dark:text-amber-400 py-4 text-sm">
          {loading ? 'Загрузка...' : 'Нет записей, ожидающих подтверждения'}
        </div>
      ) : (
      <div className="space-y-2">
        {pendingVisitors.map((visitor) => (
          <div 
            key={visitor.id}
            className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-lg overflow-hidden"
          >
            {/* Основная информация - карточка */}
            <div 
              className="p-3 cursor-pointer"
              onClick={() => setExpandedId(expandedId === visitor.id ? null : visitor.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* Номер и время */}
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-bold text-lg sm:text-xl font-mono tracking-wider">
                      {visitor.plate_number}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(visitor.entry_date)}
                    </span>
                    {visitor.recognition_confidence != null && visitor.recognition_confidence > 0 && (
                      <span className={`text-xs font-medium ${getConfidenceColor(visitor.recognition_confidence)}`}>
                        {visitor.recognition_confidence}%
                      </span>
                    )}
                  </div>
                  
                  {/* Камера и двор */}
                  <div className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-2">
                    {visitor.device_name && (
                      <span className="flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        {visitor.device_name}
                      </span>
                    )}
                    {visitor.yard_name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {visitor.yard_name}
                      </span>
                    )}
                  </div>

                  {/* Причина ожидания подтверждения */}
                  {visitor.pending_reason_text && (
                    <div className={`mt-1 text-xs font-medium ${
                      visitor.pending_reason === 'truck_not_found' ? 'text-red-600 dark:text-red-400' :
                      visitor.pending_reason === 'no_permit' ? 'text-orange-600 dark:text-orange-400' :
                      visitor.pending_reason === 'low_confidence' ? 'text-amber-600 dark:text-amber-400' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {visitor.pending_reason_text}
                    </div>
                  )}

                  {/* Найденное совпадение */}
                  {visitor.matched_plate_number && (
                    <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                      ✓ Найдено: {visitor.matched_plate_number}
                      {visitor.task_name && ` • ${visitor.task_name}`}
                    </div>
                  )}
                </div>

                {/* Кнопки быстрых действий */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Если есть совпадение - быстрое подтверждение */}
                  {visitor.matched_truck_id && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white h-9 px-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDialog({
                          open: true,
                          visitor,
                          selectedTruckId: visitor.matched_truck_id!,
                          selectedTaskId: visitor.task_id || null,
                          correctedPlate: visitor.matched_plate_number || visitor.plate_number,
                        });
                      }}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  )}
                  
                  {/* Кнопка отклонения */}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-9 px-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Отклонить как ложное срабатывание?')) {
                        rejectVisitor(visitor);
                      }
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>

                  {/* Развернуть */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedId(expandedId === visitor.id ? null : visitor.id);
                    }}
                  >
                    {expandedId === visitor.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Развёрнутая информация */}
            {expandedId === visitor.id && (
              <div className="px-3 pb-3 pt-0 border-t border-amber-200 dark:border-amber-800">
                {/* Похожие номера */}
                {visitor.similar_plates.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wider">
                      Похожие номера в базе:
                    </h4>
                    <div className="space-y-1">
                      {visitor.similar_plates.slice(0, 5).map((plate) => (
                        <button
                          key={plate.truck_id}
                          className={`w-full text-left p-2 rounded border transition-colors ${
                            plate.has_permit
                              ? 'border-green-300 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30'
                              : 'border-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700'
                          }`}
                          onClick={() => openConfirmDialog(visitor, plate)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-mono font-bold">{plate.plate_number}</span>
                              {plate.truck_model_name && (
                                <span className="text-xs text-gray-500 ml-2">{plate.truck_model_name}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{plate.similarity_percent}%</span>
                              {plate.has_permit && (
                                <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded">
                                  Пропуск
                                </span>
                              )}
                            </div>
                          </div>
                          {plate.task_name && (
                            <div className="text-xs text-gray-600 mt-0.5">
                              📦 {plate.task_name}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ожидаемые задачи */}
                {visitor.expected_tasks.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wider">
                      Ожидаемые ТС на этом дворе:
                    </h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {visitor.expected_tasks.slice(0, 10).map((task) => (
                        <button
                          key={task.id}
                          className="w-full text-left p-2 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 transition-colors"
                          onClick={() => openConfirmDialog(visitor, undefined, task)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold">{task.plate_number}</span>
                            {task.plan_date && (
                              <span className="text-xs text-gray-500">
                                {new Date(task.plan_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            📦 {task.name}
                            {task.driver_name && ` • ${task.driver_name}`}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Кнопка ручного выбора */}
                <div className="mt-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => openConfirmDialog(visitor)}
                  >
                    <Truck className="w-4 h-4 mr-2" />
                    Указать ТС вручную
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      )}
        </div>
      )}

      {/* Диалог подтверждения */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ ...confirmDialog, open: false })}>
        <DialogContent className="max-w-md mx-4">
          <DialogHeader>
            <DialogTitle>Подтверждение въезда</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Распознанный номер */}
            <div className="bg-gray-100 dark:bg-gray-800 rounded p-3">
              <div className="text-xs text-gray-500 mb-1">Распознано камерой:</div>
              <div className="font-mono font-bold text-lg">{confirmDialog.visitor?.plate_number}</div>
            </div>

            {/* Корректировка номера */}
            <div>
              <label className="text-sm font-medium mb-1 block">Правильный номер:</label>
              <Input
                value={confirmDialog.correctedPlate}
                onChange={(e) => setConfirmDialog({ ...confirmDialog, correctedPlate: e.target.value.toUpperCase() })}
                className="font-mono text-lg"
                placeholder="Введите номер"
              />
            </div>

            {/* Поиск ТС */}
            <div>
              <label className="text-sm font-medium mb-1 block">Поиск ТС в базе:</label>
              <div className="flex gap-2">
                <Input
                  value={searchPlate}
                  onChange={(e) => setSearchPlate(e.target.value.toUpperCase())}
                  placeholder="Введите часть номера"
                  className="font-mono"
                />
                <Button 
                  variant="outline" 
                  onClick={() => searchSimilarPlates(searchPlate)}
                  disabled={searching || searchPlate.length < 3}
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Результаты поиска */}
            {searchResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {searchResults.map((result) => (
                  <button
                    key={result.truck_id}
                    className={`w-full text-left p-2 rounded border transition-colors ${
                      confirmDialog.selectedTruckId === result.truck_id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => setConfirmDialog({
                      ...confirmDialog,
                      selectedTruckId: result.truck_id,
                      selectedTaskId: result.task_id || null,
                      correctedPlate: result.plate_number,
                    })}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold">{result.plate_number}</span>
                      {result.has_permit && (
                        <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded">
                          Пропуск
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Выбранное ТС */}
            {confirmDialog.selectedTruckId && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded p-2">
                <div className="text-xs text-green-600 dark:text-green-400">
                  ✓ Выбрано ТС ID: {confirmDialog.selectedTruckId}
                  {confirmDialog.selectedTaskId && ` • Задание ID: ${confirmDialog.selectedTaskId}`}
                </div>
              </div>
            )}

            {/* Предупреждение о строгом режиме */}
            {strictMode && (() => {
              const selectedTruck = [...(confirmDialog.visitor?.similar_plates || []), ...searchResults].find(
                t => t.truck_id === confirmDialog.selectedTruckId
              );
              const hasPermit = selectedTruck?.has_permit || confirmDialog.visitor?.expected_tasks.some(
                t => t.id === confirmDialog.selectedTaskId
              );
              return !hasPermit;
            })() && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 rounded p-3">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertTriangle className="w-5 h-5" />
                  <div>
                    <div className="font-semibold">🔒 Строгий режим активен</div>
                    <div className="text-xs">Въезд без разрешения запрещён. Выберите ТС с пропуском или задание.</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 mt-4">{(() => {
              const selectedTruck = [...(confirmDialog.visitor?.similar_plates || []), ...searchResults].find(
                t => t.truck_id === confirmDialog.selectedTruckId
              );
              const hasPermit = selectedTruck?.has_permit || confirmDialog.visitor?.expected_tasks.some(
                t => t.id === confirmDialog.selectedTaskId
              );
              const isBlocked = strictMode && !hasPermit;
              
              return (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}
                  >
                    Отмена
                  </Button>
                  <Button
                    onClick={confirmVisitor}
                    className={isBlocked ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"}
                    disabled={!confirmDialog.correctedPlate || isBlocked}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    {isBlocked ? 'Въезд запрещён' : 'Подтвердить въезд'}
                  </Button>
                </>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PendingVisitors;
