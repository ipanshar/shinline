import React, { useEffect, useState, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import { TextField, Autocomplete } from "@mui/material";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Truck, User, Calendar, MapPin, Building2, Package, 
  Plus, X, Search, Check, ChevronsUpDown, Loader2,
  Save, Phone, FileText, Scale, ChevronDown, ChevronUp,
  Warehouse as WarehouseIcon, DoorOpen
} from "lucide-react";
import { cn } from "@/lib/utils";

// Типы
interface Yard {
  id: number;
  name: string;
}

interface Warehouse {
  id: number;
  name: string;
}

interface Gate {
  id: number;
  name: string;
}

interface UserOption {
  id: number;
  user_name: string;
  login: string;
  user_phone: string;
}

interface TruckSearchResult {
  id: number;
  plate_number: string;
  truck_model_name?: string;
  truck_category_name?: string;
  trailer_type_name?: string;
  trailer_model_name?: string;
  trailer_number?: string;
  color?: string;
  vin?: string;
}

interface WarehouseItem {
  name: string;
  sorting_order: number;
  gates: string[];
  plan_gate: string | null;
  description: string | null;
}

interface TaskFormData {
  task_id: number | null;
  name: string;
  login: string;
  user_name: string;
  user_phone: string;
  company: string;
  plate_number: string;
  trailer_plate_number: string;
  truck_model: string;
  truck_category: string;
  trailer_type: string;
  trailer_model: string;
  color: string;
  vin: string;
  avtor: string;
  phone: string;
  Yard: string;
  description: string;
  plan_date: string;
  end_date: string;
  weighing: boolean;
  create_user_id: string;
  one_permission: boolean;
  warehouse: WarehouseItem[];
}

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId?: number | null; // null = создание, число = редактирование
  onSaved?: () => void;
}

const initialWarehouseItem: WarehouseItem = {
  name: '',
  sorting_order: 1,
  gates: [],
  plan_gate: null,
  description: null,
};

const initialFormState: TaskFormData = {
  task_id: null,
  name: '',
  login: '',
  user_name: '',
  user_phone: '',
  company: '',
  plate_number: '',
  trailer_plate_number: '',
  truck_model: '',
  truck_category: '',
  trailer_type: '',
  trailer_model: '',
  color: '',
  vin: '',
  avtor: '',
  phone: '',
  Yard: '',
  description: '',
  plan_date: '',
  end_date: '',
  weighing: false,
  create_user_id: '',
  one_permission: false,
  warehouse: [{ ...initialWarehouseItem }],
};

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, taskId, onSaved }) => {
  const isEditMode = taskId !== null && taskId !== undefined;
  
  // Состояния
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<TaskFormData>(initialFormState);
  
  // Справочники
  const [yards, setYards] = useState<Yard[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [gatesMap, setGatesMap] = useState<Record<number, Gate[]>>({});
  
  // Поиск ТС
  const [truckSearch, setTruckSearch] = useState('');
  const [truckSearchResults, setTruckSearchResults] = useState<TruckSearchResult[]>([]);
  const [searchingTruck, setSearchingTruck] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<TruckSearchResult | null>(null);
  
  // Поиск пользователя
  const [userSearch, setUserSearch] = useState('');
  
  // Секции
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    truck: true,
    warehouses: true,
    options: false,
  });

  const [userId, setUserId] = useState<number | null>(null);

  // Получаем текущего пользователя
  useEffect(() => {
    const userFromSession = sessionStorage.getItem('user');
    if (userFromSession) {
      const user = JSON.parse(userFromSession);
      setUserId(user.id);
      if (!isEditMode) {
        setFormData(prev => ({ ...prev, avtor: user.name || '' }));
      }
    }
  }, [isEditMode]);

  // Загрузка справочников
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        const [yardsRes, warehousesRes, usersRes] = await Promise.all([
          axios.post('/yard/getyards'),
          axios.post('/warehouse/getwarehouses'),
          axios.get('/users/without-roles'),
        ]);
        
        setYards(yardsRes.data.data || []);
        setWarehouses(warehousesRes.data.data || []);
        setUsers(usersRes.data || []);
      } catch (err) {
        console.error('Ошибка загрузки справочников:', err);
      }
    };

    loadData();
  }, [isOpen]);

  // Загрузка задачи для редактирования
  useEffect(() => {
    if (!isOpen || !isEditMode) {
      if (!isEditMode) {
        setFormData(initialFormState);
        setSelectedTruck(null);
        setTruckSearch('');
      }
      return;
    }

    setLoading(true);
    axios.post('/task/gettasks', { task_id: taskId })
      .then(res => {
        const t = res.data.data;
        setFormData({
          ...initialFormState,
          task_id: t.id,
          name: t.name || '',
          avtor: t.avtor || '',
          login: t.user_login || '',
          user_name: t.user_name || '',
          user_phone: t.user_phone || '',
          company: t.company || '',
          plate_number: t.truck_plate_number || '',
          trailer_plate_number: t.trailer_plate_number || '',
          truck_model: t.truck_model_name || '',
          truck_category: t.truck_category_name || '',
          trailer_type: t.trailer_type_name || '',
          color: t.color || '',
          vin: '',
          phone: t.phone || '',
          description: t.description || '',
          plan_date: formatDateForInput(t.plan_date),
          end_date: formatDateForInput(t.end_date),
          weighing: !!t.task_weighings?.length,
          one_permission: false,
          create_user_id: '',
          Yard: t.yard_name || '',
          warehouse: t.task_loadings?.length > 0 
            ? t.task_loadings.map((l: any, i: number) => ({
                name: l.warehouse_name,
                sorting_order: i + 1,
                gates: [],
                plan_gate: l.warehouse_gate_plan_name || null,
                description: null,
              }))
            : [{ ...initialWarehouseItem }],
        });

        if (t.truck_plate_number) {
          setSelectedTruck({
            id: t.truck_id,
            plate_number: t.truck_plate_number,
            truck_model_name: t.truck_model_name,
            truck_category_name: t.truck_category_name,
            trailer_type_name: t.trailer_type_name,
            trailer_model_name: t.trailer_model_name,
            trailer_number: t.trailer_plate_number,
            color: t.color,
          });
        }

        // Загрузить ворота для складов
        t.task_loadings?.forEach((l: any, idx: number) => {
          loadGatesForWarehouse(l.warehouse_name, idx);
        });
      })
      .catch(err => console.error('Ошибка загрузки задачи:', err))
      .finally(() => setLoading(false));
  }, [isOpen, taskId, isEditMode]);

  const formatDateForInput = (dateStr: string) => {
    if (!dateStr) return '';
    return dateStr.replace(' ', 'T').slice(0, 16);
  };

  const formatDateForAPI = (date: string | Date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // Поиск ТС с debounce
  useEffect(() => {
    if (!truckSearch.trim() || truckSearch.length < 2) {
      setTruckSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearchingTruck(true);
      try {
        const res = await axios.get('/trucs/search', { 
          params: { plate_number: truckSearch } 
        });
        if (res.data.found && res.data.data) {
          setTruckSearchResults([res.data.data]);
        } else {
          setTruckSearchResults([]);
        }
      } catch (e) {
        setTruckSearchResults([]);
      } finally {
        setSearchingTruck(false);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [truckSearch]);

  // Выбор ТС
  const handleSelectTruck = (truck: TruckSearchResult) => {
    setSelectedTruck(truck);
    setFormData(prev => ({
      ...prev,
      plate_number: truck.plate_number,
      trailer_plate_number: truck.trailer_number || '',
      truck_model: truck.truck_model_name || '',
      truck_category: truck.truck_category_name || '',
      trailer_type: truck.trailer_type_name || '',
      trailer_model: truck.trailer_model_name || '',
      color: truck.color || '',
      vin: truck.vin || '',
    }));
    setTruckSearch('');
  };

  // Очистка ТС
  const handleClearTruck = () => {
    setSelectedTruck(null);
    setFormData(prev => ({
      ...prev,
      plate_number: '',
      trailer_plate_number: '',
      truck_model: '',
      truck_category: '',
      trailer_type: '',
      trailer_model: '',
      color: '',
      vin: '',
    }));
  };

  // Выбор пользователя
  const handleSelectUser = (user: UserOption) => {
    setFormData(prev => ({
      ...prev,
      user_name: user.user_name,
      login: user.login,
      user_phone: user.user_phone,
    }));
    setUserSearch('');
  };

  // Загрузка ворот для склада
  const loadGatesForWarehouse = async (warehouseName: string, index: number) => {
    const warehouseObj = warehouses.find(w => w.name === warehouseName);
    if (!warehouseObj) {
      setGatesMap(prev => {
        const copy = { ...prev };
        delete copy[index];
        return copy;
      });
      return;
    }

    try {
      const res = await axios.post('/warehouse/getgates', { warehouse_id: warehouseObj.id });
      const data = res.data.data;
      if (Array.isArray(data)) {
        setGatesMap(prev => ({ ...prev, [index]: data }));
        setFormData(prev => {
          const arr = [...prev.warehouse];
          if (arr[index]) {
            arr[index].gates = data.map((g: Gate) => g.name);
          }
          return { ...prev, warehouse: arr };
        });
      }
    } catch (err) {
      console.error('Ошибка загрузки ворот:', err);
    }
  };

  // Обработка изменения склада
  const handleWarehouseChange = (index: number, value: string) => {
    setFormData(prev => {
      const arr = [...prev.warehouse];
      arr[index] = { ...arr[index], name: value, plan_gate: null };
      return { ...prev, warehouse: arr };
    });
    loadGatesForWarehouse(value, index);
  };

  // Обработка изменения ворот
  const handleGateChange = (index: number, value: string) => {
    setFormData(prev => {
      const arr = [...prev.warehouse];
      arr[index] = { ...arr[index], plan_gate: value || null };
      return { ...prev, warehouse: arr };
    });
  };

  // Добавить склад
  const addWarehouse = () => {
    setFormData(prev => ({
      ...prev,
      warehouse: [...prev.warehouse, { 
        ...initialWarehouseItem, 
        sorting_order: prev.warehouse.length + 1 
      }],
    }));
  };

  // Удалить склад
  const removeWarehouse = (index: number) => {
    setFormData(prev => {
      const arr = prev.warehouse.filter((_, i) => i !== index);
      arr.forEach((item, i) => (item.sorting_order = i + 1));
      return { ...prev, warehouse: arr };
    });
    setGatesMap(prev => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
  };

  // Сохранение
  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      alert('Введите название задачи');
      return;
    }
    if (!formData.Yard) {
      alert('Выберите площадку');
      return;
    }

    setSaving(true);
    try {
      const normalizedWarehouse = formData.warehouse
        .filter(w => w.name)
        .map(item => ({
          name: item.name,
          sorting_order: item.sorting_order,
          gates: item.gates,
          plan_gate: item.plan_gate,
          description: item.description,
          barcode: null,
          yard: null,
          document: null,
        }));

      const payload = {
        ...formData,
        task_id: formData.task_id ?? null,
        plan_date: formatDateForAPI(formData.plan_date),
        end_date: formatDateForAPI(formData.end_date),
        warehouse: normalizedWarehouse,
        create_user_id: userId,
      };

      await axios.post('/api/task/addapitask', payload);
      
      onClose();
      onSaved?.();
    } catch (err) {
      const error = err as AxiosError<any>;
      console.error('Ошибка сохранения:', err);
      alert('Ошибка: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  // Фильтрация пользователей
  const filteredUsers = users.filter(u => 
    !userSearch || 
    u.user_name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.login.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.user_phone?.includes(userSearch)
  );

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="max-w-3xl max-h-[90vh] p-0 gap-0"
        aria-describedby={undefined}
      >
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-xl flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {isEditMode ? 'Редактирование задачи' : 'Создание задачи'}
            {formData.name && (
              <Badge variant="outline" className="ml-2 font-normal">
                {formData.name}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-180px)]">
          {loading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Основная информация */}
              <Card className="p-4">
                <button
                  type="button"
                  onClick={() => toggleSection('basic')}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h3 className="font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Основная информация
                  </h3>
                  {expandedSections.basic ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {expandedSections.basic && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {/* Название */}
                    <div className="space-y-2">
                      <Label htmlFor="name">Название задачи *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Введите название"
                      />
                    </div>

                    {/* Автор */}
                    <div className="space-y-2">
                      <Label htmlFor="avtor">Автор</Label>
                      <Input
                        id="avtor"
                        value={formData.avtor}
                        onChange={(e) => setFormData(prev => ({ ...prev, avtor: e.target.value }))}
                        placeholder="Автор задачи"
                      />
                    </div>

                    {/* Водитель/Пользователь */}
                    <div className="space-y-2">
                      <Label>Водитель</Label>
                      <Autocomplete
                        options={filteredUsers}
                        getOptionLabel={(option) => `${option.user_name} (${option.login}) ${option.user_phone || ''}`}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        value={users.find(u => u.login === formData.login) || null}
                        onChange={(_, newValue) => {
                          if (newValue) {
                            handleSelectUser(newValue);
                          } else {
                            setFormData(prev => ({ ...prev, login: '', user_name: '', user_phone: '' }));
                          }
                        }}
                        onInputChange={(_, newInputValue) => {
                          setUserSearch(newInputValue);
                        }}
                        disablePortal
                        renderOption={(props, option) => (
                          <li {...props} key={option.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{option.user_name}</span>
                              <span className="text-xs text-gray-500">
                                {option.login} • {option.user_phone}
                              </span>
                            </div>
                          </li>
                        )}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Поиск по имени, логину или телефону..."
                            size="small"
                            variant="outlined"
                          />
                        )}
                        noOptionsText="Водитель не найден"
                      />
                      {formData.user_phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {formData.user_phone}
                        </p>
                      )}
                    </div>

                    {/* Компания */}
                    <div className="space-y-2">
                      <Label htmlFor="company">Компания</Label>
                      <Input
                        id="company"
                        value={formData.company}
                        onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                        placeholder="Название компании"
                      />
                    </div>

                    {/* Телефон */}
                    <div className="space-y-2">
                      <Label htmlFor="phone">Телефон контакта</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+7 (XXX) XXX-XX-XX"
                      />
                    </div>

                    {/* Площадка */}
                    <div className="space-y-2">
                      <Label>Площадка *</Label>
                      <Select
                        value={formData.Yard || "none"}
                        onValueChange={(val) => setFormData(prev => ({ ...prev, Yard: val === "none" ? "" : val }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите площадку" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Выберите площадку</SelectItem>
                          {yards.map(yard => (
                            <SelectItem key={yard.id} value={yard.name}>
                              {yard.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Даты */}
                    <div className="space-y-2">
                      <Label htmlFor="plan_date">Плановая дата</Label>
                      <Input
                        id="plan_date"
                        type="datetime-local"
                        value={formData.plan_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, plan_date: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="end_date">Крайний срок</Label>
                      <Input
                        id="end_date"
                        type="datetime-local"
                        value={formData.end_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                      />
                    </div>

                    {/* Описание */}
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="description">Описание</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Описание задачи..."
                        rows={3}
                      />
                    </div>
                  </div>
                )}
              </Card>

              {/* Транспортное средство */}
              <Card className="p-4">
                <button
                  type="button"
                  onClick={() => toggleSection('truck')}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h3 className="font-semibold flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Транспортное средство
                  </h3>
                  {expandedSections.truck ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {expandedSections.truck && (
                  <div className="mt-4 space-y-4">
                    {/* Выбранное ТС */}
                    {selectedTruck ? (
                      <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-green-600 text-white font-mono text-base">
                                {selectedTruck.plate_number}
                              </Badge>
                              {selectedTruck.trailer_number && (
                                <Badge variant="outline" className="font-mono">
                                  + {selectedTruck.trailer_number}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                              {selectedTruck.truck_model_name && (
                                <span>Модель: {selectedTruck.truck_model_name}</span>
                              )}
                              {selectedTruck.truck_category_name && (
                                <span>Категория: {selectedTruck.truck_category_name}</span>
                              )}
                              {selectedTruck.trailer_type_name && (
                                <span>Тип прицепа: {selectedTruck.trailer_type_name}</span>
                              )}
                              {selectedTruck.color && (
                                <span>Цвет: {selectedTruck.color}</span>
                              )}
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={handleClearTruck}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Отвязать
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Autocomplete
                          options={truckSearchResults}
                          getOptionLabel={(option) => 
                            `${option.plate_number}${option.truck_model_name ? ` (${option.truck_model_name})` : ''}`
                          }
                          isOptionEqualToValue={(option, value) => option.id === value.id}
                          filterOptions={(x) => x}
                          value={selectedTruck}
                          onChange={(_, newValue) => {
                            if (newValue) {
                              handleSelectTruck(newValue);
                            }
                          }}
                          onInputChange={(_, newInputValue, reason) => {
                            setTruckSearch(newInputValue);
                          }}
                          loading={searchingTruck}
                          disablePortal
                          renderOption={(props, option) => (
                            <li {...props} key={option.id}>
                              <div className="flex flex-col">
                                <span className="font-mono font-bold">{option.plate_number}</span>
                                <span className="text-xs text-gray-500">
                                  {option.truck_model_name} • {option.truck_category_name}
                                  {option.color && ` • ${option.color}`}
                                </span>
                              </div>
                            </li>
                          )}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              placeholder="Введите гос. номер для поиска..."
                              size="small"
                              variant="outlined"
                            />
                          )}
                          noOptionsText={
                            truckSearch.length >= 2 
                              ? "ТС не найдено" 
                              : "Введите номер для поиска"
                          }
                        />

                        {/* Или ручной ввод */}
                        <div className="text-center text-sm text-muted-foreground">или введите вручную</div>
                        
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Гос. номер ТС</Label>
                            <Input
                              value={formData.plate_number}
                              onChange={(e) => setFormData(prev => ({ ...prev, plate_number: e.target.value.toUpperCase() }))}
                              placeholder="А000АА000"
                              className="font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Номер прицепа</Label>
                            <Input
                              value={formData.trailer_plate_number}
                              onChange={(e) => setFormData(prev => ({ ...prev, trailer_plate_number: e.target.value.toUpperCase() }))}
                              placeholder="АА0000 00"
                              className="font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Склады и ворота */}
              <Card className="p-4">
                <button
                  type="button"
                  onClick={() => toggleSection('warehouses')}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h3 className="font-semibold flex items-center gap-2">
                    <WarehouseIcon className="w-4 h-4" />
                    Склады и ворота
                    <Badge variant="secondary" className="ml-1">{formData.warehouse.length}</Badge>
                  </h3>
                  {expandedSections.warehouses ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {expandedSections.warehouses && (
                  <div className="mt-4 space-y-4">
                    {formData.warehouse.map((wh, index) => (
                      <div key={index} className="p-4 bg-muted/30 rounded-lg border relative">
                        {formData.warehouse.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeWarehouse(index)}
                            className="absolute top-2 right-2 h-6 w-6 p-0 text-red-500 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="flex items-center gap-1">
                              <WarehouseIcon className="w-3 h-3" />
                              Склад {index + 1}
                            </Label>
                            <Select
                              value={wh.name || "none"}
                              onValueChange={(val) => handleWarehouseChange(index, val === "none" ? "" : val)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Выберите склад" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Выберите склад</SelectItem>
                                {warehouses.map(w => (
                                  <SelectItem key={w.id} value={w.name}>
                                    {w.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="flex items-center gap-1">
                              <DoorOpen className="w-3 h-3" />
                              Ворота
                            </Label>
                            <Select
                              value={wh.plan_gate || "none"}
                              onValueChange={(val) => handleGateChange(index, val === "none" ? "" : val)}
                              disabled={!gatesMap[index]?.length}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Выберите ворота" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Выберите ворота</SelectItem>
                                {gatesMap[index]?.map(gate => (
                                  <SelectItem key={gate.id} value={gate.name}>
                                    {gate.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}

                    <Button variant="outline" onClick={addWarehouse} className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Добавить склад
                    </Button>
                  </div>
                )}
              </Card>

              {/* Дополнительные опции */}
              <Card className="p-4">
                <button
                  type="button"
                  onClick={() => toggleSection('options')}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h3 className="font-semibold flex items-center gap-2">
                    <Scale className="w-4 h-4" />
                    Дополнительные опции
                  </h3>
                  {expandedSections.options ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {expandedSections.options && (
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="weighing"
                        checked={formData.weighing}
                        onCheckedChange={(checked) => 
                          setFormData(prev => ({ ...prev, weighing: checked === true }))
                        }
                      />
                      <Label htmlFor="weighing" className="cursor-pointer">
                        Весовой контроль
                      </Label>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="one_permission"
                        checked={formData.one_permission}
                        onCheckedChange={(checked) => 
                          setFormData(prev => ({ ...prev, one_permission: checked === true }))
                        }
                      />
                      <Label htmlFor="one_permission" className="cursor-pointer">
                        Одноразовый заезд
                      </Label>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </ScrollArea>

        {/* Футер с кнопками */}
        <div className="p-4 border-t bg-muted/30 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Сохранение...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {isEditMode ? 'Сохранить' : 'Создать'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskModal;
