import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { TextField, Autocomplete, CircularProgress as MuiCircularProgress } from "@mui/material";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { 
  Plus, Pencil, Ban, Trash2, Search, RefreshCw, Shield, Clock, CalendarClock, Scale, 
  Truck as TruckIcon, UserRound, MoreVertical, MapPin, Phone, Building2, MessageSquare,
  Calendar, User, CheckCircle2, XCircle, ChevronDown, ChevronUp, AlertTriangle,
  Filter, ArrowUpDown, ArrowUp, ArrowDown, X, SlidersHorizontal
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Yard {
  id: number;
  name: string;
  strict_mode?: boolean;
}

interface Truck {
  id: number;
  plate_number: string;
  truck_brand_name?: string;
  truck_model_name?: string;
  color?: string;
}

interface User {
  id: number;
  name: string;
  phone?: string;
}

interface EntryPermit {
  id: number;
  truck_id: number;
  yard_id: number;
  user_id: number | null; // Водитель
  granted_by_user_id: number | null; // Кто выдал
  task_id: number | null;
  one_permission: boolean; // true = разовое, false = постоянное
  weighing_required: boolean | null; // Требуется ли взвешивание
  begin_date: string | null;
  end_date: string | null;
  status_id: number;
  comment: string | null;
  created_at: string;
  // Гостевые поля
  is_guest: boolean;
  guest_name: string | null;
  guest_company: string | null;
  guest_destination: string | null;
  guest_purpose: string | null;
  guest_phone: string | null;
  // Связанные данные
  plate_number: string;
  truck_color?: string;
  truck_model_name?: string;
  truck_brand_name?: string;
  yard_name: string;
  yard_strict_mode?: boolean;
  driver_name?: string;
  driver_phone?: string;
  granted_by_name?: string;
  task_name?: string;
  status_name: string;
  status_key: string;
}

interface FormData {
  truck_id: number | null;
  yard_id: number | null;
  user_id: number | null;
  one_permission: boolean;
  weighing_required: boolean | null;
  begin_date: string;
  end_date: string;
  comment: string;
  // Гостевые поля
  is_guest: boolean;
  guest_name: string;
  guest_company: string;
  guest_destination: string;
  guest_purpose: string;
  guest_phone: string;
}

interface Pagination {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

const EntryPermitsManager: React.FC = () => {
  const [permits, setPermits] = useState<EntryPermit[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [selectedPermit, setSelectedPermit] = useState<EntryPermit | null>(null);
  const [saving, setSaving] = useState(false);

  // Пагинация
  const [pagination, setPagination] = useState<Pagination>({
    current_page: 1,
    last_page: 1,
    per_page: 25,
    total: 0,
    from: null,
    to: null,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  // Фильтры
  const [filterYardId, setFilterYardId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPermitType, setFilterPermitType] = useState<string>("all");
  const [filterGuestType, setFilterGuestType] = useState<string>("all"); // all, guest, not_guest
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [searchPlate, setSearchPlate] = useState("");
  const [searchGuest, setSearchGuest] = useState(""); // Поиск по имени гостя
  
  // Сортировка
  const [sortField, setSortField] = useState<string>("created_at");
  const [sortDirection, setSortDirection] = useState<string>("desc");
  
  // Показать расширенные фильтры
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Форма добавления/редактирования
  const [formData, setFormData] = useState<FormData>({
    truck_id: null,
    yard_id: null,
    user_id: null,
    one_permission: false,
    weighing_required: null,
    begin_date: "",
    end_date: "",
    comment: "",
    is_guest: false,
    guest_name: "",
    guest_company: "",
    guest_destination: "",
    guest_purpose: "",
    guest_phone: "",
  });

  // Поиск ТС
  const [truckSearch, setTruckSearch] = useState("");
  const [truckOptions, setTruckOptions] = useState<Truck[]>([]);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [searchingTruck, setSearchingTruck] = useState(false);

  // Поиск водителя
  const [driverSearch, setDriverSearch] = useState("");
  const [driverOptions, setDriverOptions] = useState<User[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<User | null>(null);

  // Диалог добавления нового ТС
  const [addTruckDialogOpen, setAddTruckDialogOpen] = useState(false);
  const [newTruckPlate, setNewTruckPlate] = useState("");
  const [savingTruck, setSavingTruck] = useState(false);

  // Массовая деактивация
  const [deactivatingExpired, setDeactivatingExpired] = useState(false);

  // Ошибка формы
  const [formError, setFormError] = useState<string | null>(null);

  const token = localStorage.getItem("auth_token");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchPermits = useCallback((page = currentPage) => {
    setLoading(true);
    const params: any = {
      page,
      per_page: perPage,
      sort_field: sortField,
      sort_direction: sortDirection,
    };
    if (filterYardId) params.yard_id = filterYardId;
    if (filterStatus !== "all") params.status = filterStatus;
    if (filterPermitType !== "all") params.permit_type = filterPermitType;
    if (filterGuestType !== "all") params.guest_type = filterGuestType;
    if (searchPlate.trim()) params.plate_number = searchPlate.trim();
    if (searchGuest.trim()) params.guest_search = searchGuest.trim();
    if (filterDateFrom) params.date_from = filterDateFrom;
    if (filterDateTo) params.date_to = filterDateTo;

    axios
      .post("/security/getpermits", params, { headers })
      .then((response) => {
        if (response.data.status) {
          setPermits(response.data.data);
          if (response.data.pagination) {
            setPagination(response.data.pagination);
          }
        }
      })
      .catch((error) => {
        console.error("Ошибка загрузки разрешений:", error);
        toast.error("Ошибка загрузки разрешений");
      })
      .finally(() => setLoading(false));
  }, [filterYardId, filterStatus, filterPermitType, filterGuestType, searchPlate, searchGuest, filterDateFrom, filterDateTo, currentPage, perPage, sortField, sortDirection]);

  const fetchYards = () => {
    axios
      .post("/yard/getyards", {}, { headers })
      .then((response) => {
        if (response.data.status) {
          setYards(response.data.data);
        }
      })
      .catch((error) => console.error("Ошибка загрузки дворов:", error));
  };

  useEffect(() => {
    fetchYards();
    fetchPermits(1);
  }, []);

  // При изменении фильтров сбрасываем на первую страницу
  useEffect(() => {
    setCurrentPage(1);
    fetchPermits(1);
  }, [filterYardId, filterStatus, filterPermitType, filterGuestType, sortField, sortDirection]);

  // При изменении страницы загружаем данные
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchPermits(page);
  };

  // При изменении количества на странице
  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setCurrentPage(1);
    fetchPermits(1);
  };

  // Поиск ТС
  const searchTrucks = async (query: string) => {
    if (query.length < 2) {
      setTruckOptions([]);
      return;
    }
    setSearchingTruck(true);
    try {
      const response = await axios.post("/security/searchtruck", { plate_number: query }, { headers });
      if (response.data.status || response.data.data) {
        setTruckOptions(response.data.data || []);
      }
    } catch (error) {
      console.error("Ошибка поиска ТС:", error);
    } finally {
      setSearchingTruck(false);
    }
  };

  // Поиск пользователей (водителей)
  const searchDrivers = async (query: string) => {
    if (query.length < 2) {
      setDriverOptions([]);
      return;
    }
    try {
      const response = await axios.post("/user/getusers", { search: query }, { headers });
      if (response.data.status) {
        setDriverOptions(response.data.data || []);
      }
    } catch (error) {
      console.error("Ошибка поиска пользователей:", error);
    }
  };

  // Добавление нового ТС
  const handleAddNewTruck = async () => {
    if (!newTruckPlate.trim()) {
      toast.error("Введите номер ТС");
      return;
    }
    
    setSavingTruck(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
      const response = await axios.post("/trucs/addtruck", {
        plate_number: newTruckPlate.trim().toUpperCase(),
        name: newTruckPlate.trim().toUpperCase(),
        user_id: currentUser?.id || 1,
      }, { headers });
      
      if (response.data.status || response.data.id) {
        const newTruck = response.data.data || response.data;
        toast.success("ТС успешно добавлено");
        
        // Устанавливаем новое ТС как выбранное
        setSelectedTruck({
          id: newTruck.id,
          plate_number: newTruck.plate_number,
        });
        setFormData((prev) => ({ ...prev, truck_id: newTruck.id }));
        
        setAddTruckDialogOpen(false);
        setNewTruckPlate("");
      }
    } catch (error: any) {
      console.error("Ошибка добавления ТС:", error);
      toast.error(error.response?.data?.message || "Ошибка добавления ТС");
    } finally {
      setSavingTruck(false);
    }
  };

  const openAddDialog = () => {
    setSelectedPermit(null);
    setFormData({
      truck_id: null,
      yard_id: null,
      user_id: null,
      one_permission: false,
      weighing_required: null,
      begin_date: format(new Date(), "yyyy-MM-dd"),
      end_date: "",
      comment: "",
      is_guest: false,
      guest_name: "",
      guest_company: "",
      guest_destination: "",
      guest_purpose: "",
      guest_phone: "",
    });
    setSelectedTruck(null);
    setSelectedDriver(null);
    setTruckSearch("");
    setDriverSearch("");
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (permit: EntryPermit) => {
    setSelectedPermit(permit);
    setFormData({
      truck_id: permit.truck_id,
      yard_id: permit.yard_id,
      user_id: permit.user_id,
      one_permission: permit.one_permission,
      weighing_required: permit.weighing_required,
      begin_date: permit.begin_date ? format(new Date(permit.begin_date), "yyyy-MM-dd") : "",
      end_date: permit.end_date ? format(new Date(permit.end_date), "yyyy-MM-dd") : "",
      comment: permit.comment || "",
      is_guest: permit.is_guest || false,
      guest_name: permit.guest_name || "",
      guest_company: permit.guest_company || "",
      guest_destination: permit.guest_destination || "",
      guest_purpose: permit.guest_purpose || "",
      guest_phone: permit.guest_phone || "",
    });
    setSelectedTruck({
      id: permit.truck_id,
      plate_number: permit.plate_number,
      truck_brand_name: permit.truck_brand_name,
      truck_model_name: permit.truck_model_name,
      color: permit.truck_color,
    });
    if (permit.user_id && permit.driver_name) {
      setSelectedDriver({
        id: permit.user_id,
        name: permit.driver_name,
        phone: permit.driver_phone,
      });
    } else {
      setSelectedDriver(null);
    }
    setFormError(null);
    setDialogOpen(true);
  };

  const openDeactivateDialog = (permit: EntryPermit) => {
    setSelectedPermit(permit);
    setDeactivateDialogOpen(true);
  };

  const openDeleteDialog = (permit: EntryPermit) => {
    setSelectedPermit(permit);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    setFormError(null);
    
    if (!formData.truck_id) {
      setFormError("Выберите транспортное средство");
      return;
    }
    if (!formData.yard_id) {
      setFormError("Выберите двор");
      return;
    }

    // Валидация гостевых полей
    if (formData.is_guest && !formData.guest_name.trim()) {
      setFormError("Укажите ФИО гостя");
      return;
    }

    setSaving(true);
    try {
      // Получаем текущего пользователя как того, кто выдаёт разрешение
      const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

      if (selectedPermit) {
        // Редактирование
        await axios.post(
          "/security/updatepermit",
          {
            id: selectedPermit.id,
            user_id: formData.user_id,
            one_permission: formData.one_permission,
            weighing_required: formData.weighing_required,
            begin_date: formData.begin_date || null,
            end_date: formData.end_date || null,
            comment: formData.comment || null,
            // Гостевые поля
            is_guest: formData.is_guest,
            guest_name: formData.guest_name || null,
            guest_company: formData.guest_company || null,
            guest_destination: formData.guest_destination || null,
            guest_purpose: formData.guest_purpose || null,
            guest_phone: formData.guest_phone || null,
          },
          { headers }
        );
        toast.success("Разрешение обновлено");
      } else {
        // Добавление
        await axios.post(
          "/security/addpermit",
          {
            truck_id: formData.truck_id,
            yard_id: formData.yard_id,
            user_id: formData.user_id,
            granted_by_user_id: currentUser?.id || null,
            one_permission: formData.one_permission,
            weighing_required: formData.weighing_required,
            begin_date: formData.begin_date || null,
            end_date: formData.end_date || null,
            comment: formData.comment || null,
            // Гостевые поля
            is_guest: formData.is_guest,
            guest_name: formData.guest_name || null,
            guest_company: formData.guest_company || null,
            guest_destination: formData.guest_destination || null,
            guest_purpose: formData.guest_purpose || null,
            guest_phone: formData.guest_phone || null,
          },
          { headers }
        );
        toast.success("Разрешение создано");
      }
      setDialogOpen(false);
      fetchPermits(currentPage);
    } catch (error: any) {
      const message = error.response?.data?.message || "Ошибка сохранения";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!selectedPermit) return;

    setSaving(true);
    try {
      await axios.post("/security/deactivatepermit", { id: selectedPermit.id }, { headers });
      toast.success("Разрешение деактивировано");
      setDeactivateDialogOpen(false);
      fetchPermits(currentPage);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Ошибка деактивации");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPermit) return;

    setSaving(true);
    try {
      await axios.post("/security/deletepermit", { id: selectedPermit.id }, { headers });
      toast.success("Разрешение удалено");
      setDeleteDialogOpen(false);
      fetchPermits(currentPage);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Ошибка удаления");
    } finally {
      setSaving(false);
    }
  };

  // Массовая деактивация просроченных разовых разрешений
  const handleDeactivateExpired = async () => {
    setDeactivatingExpired(true);
    try {
      const params: any = {};
      if (filterYardId) params.yard_id = filterYardId;
      
      const response = await axios.post("/security/deactivateexpired", params, { headers });
      if (response.data.status) {
        toast.success(response.data.message);
        fetchPermits(currentPage);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Ошибка деактивации");
    } finally {
      setDeactivatingExpired(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "dd.MM.yyyy", { locale: ru });
    } catch {
      return dateStr;
    }
  };

  // Компонент карточки разрешения
  const PermitCard: React.FC<{ permit: EntryPermit }> = ({ permit }) => {
    const [expanded, setExpanded] = useState(false);
    const isActive = permit.status_key === "active";

    return (
      <Card className={cn(
        "p-4 transition-all duration-200 hover:shadow-md",
        !isActive && "opacity-70 bg-gray-50 dark:bg-gray-900/50"
      )}>
        {/* Верхняя часть - основная информация */}
        <div className="flex items-start justify-between gap-3">
          {/* Левая часть - номер и основные данные */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Номер ТС */}
              <span className="font-mono font-bold text-lg">{permit.plate_number}</span>
              
              {/* Статус */}
              <Badge variant={isActive ? "default" : "secondary"} className={cn(
                isActive ? "bg-green-500 hover:bg-green-600" : "bg-gray-400"
              )}>
                {isActive ? "Активно" : "Неактивно"}
              </Badge>
              
              {/* Тип разрешения */}
              <Badge variant="outline" className={cn(
                permit.one_permission 
                  ? "border-orange-300 text-orange-600 dark:text-orange-400" 
                  : "border-green-300 text-green-600 dark:text-green-400"
              )}>
                {permit.one_permission ? (
                  <><Clock className="w-3 h-3 mr-1" /> Разовое</>
                ) : (
                  <><CalendarClock className="w-3 h-3 mr-1" /> Постоянное</>
                )}
              </Badge>
              
              {/* Взвешивание */}
              {permit.weighing_required === true && (
                <Badge variant="outline" className="border-blue-300 text-blue-600 dark:text-blue-400">
                  <Scale className="w-3 h-3 mr-1" /> Взвешивание
                </Badge>
              )}
            </div>

            {/* Модель ТС */}
            {permit.truck_brand_name && (
              <p className="text-sm text-muted-foreground mt-1">
                {permit.truck_brand_name} {permit.truck_model_name}
              </p>
            )}

            {/* Двор */}
            <div className="flex items-center gap-2 mt-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                {permit.yard_name}
                {permit.yard_strict_mode && (
                  <span title="Строгий режим">
                    <Shield className="w-3 h-3 inline ml-1 text-red-500" />
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Правая часть - гость или водитель */}
          <div className="flex flex-col items-end gap-2">
            {permit.is_guest ? (
              <div className="text-right">
                <Badge className="bg-purple-500 hover:bg-purple-600 mb-1">
                  <UserRound className="w-3 h-3 mr-1" /> Гость
                </Badge>
                {permit.guest_name && (
                  <p className="text-sm font-medium">{permit.guest_name}</p>
                )}
                {permit.guest_company && (
                  <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                    <Building2 className="w-3 h-3" /> {permit.guest_company}
                  </p>
                )}
              </div>
            ) : permit.driver_name ? (
              <div className="text-right">
                <p className="text-sm font-medium flex items-center justify-end gap-1">
                  <User className="w-3 h-3" /> {permit.driver_name}
                </p>
                {permit.driver_phone && (
                  <p className="text-xs text-muted-foreground">{permit.driver_phone}</p>
                )}
              </div>
            ) : null}

            {/* Меню действий */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openEditDialog(permit)}>
                  <Pencil className="w-4 h-4 mr-2" /> Редактировать
                </DropdownMenuItem>
                {isActive ? (
                  <DropdownMenuItem 
                    onClick={() => openDeactivateDialog(permit)}
                    className="text-orange-600"
                  >
                    <Ban className="w-4 h-4 mr-2" /> Деактивировать
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem 
                    onClick={() => openDeleteDialog(permit)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Удалить
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Даты и дополнительная информация */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground">
          {/* Даты */}
          {(permit.begin_date || permit.end_date) && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(permit.begin_date)} — {formatDate(permit.end_date)}
            </span>
          )}

          {/* Гостевая информация */}
          {permit.is_guest && permit.guest_destination && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> → {permit.guest_destination}
            </span>
          )}
          {permit.is_guest && permit.guest_phone && (
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" /> {permit.guest_phone}
            </span>
          )}

          {/* Выдал */}
          {permit.granted_by_name && (
            <span className="flex items-center gap-1 text-xs">
              Выдал: {permit.granted_by_name}
            </span>
          )}
        </div>

        {/* Раскрывающаяся секция с дополнительными данными */}
        {(permit.comment || permit.guest_purpose || permit.task_name) && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-primary mt-2 hover:underline"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Скрыть детали" : "Показать детали"}
            </button>
            
            {expanded && (
              <div className="mt-2 pt-2 border-t text-sm space-y-1 animate-in slide-in-from-top-2">
                {permit.guest_purpose && (
                  <p className="text-muted-foreground">
                    <span className="font-medium">Цель визита:</span> {permit.guest_purpose}
                  </p>
                )}
                {permit.task_name && (
                  <p className="text-muted-foreground">
                    <span className="font-medium">Задание:</span> {permit.task_name}
                  </p>
                )}
                {permit.comment && (
                  <p className="text-muted-foreground flex items-start gap-1">
                    <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {permit.comment}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </Card>
    );
  };

  // Скелетон загрузки
  const PermitCardSkeleton: React.FC = () => (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-8 w-8 rounded" />
      </div>
      <div className="flex gap-4 mt-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
    </Card>
  );

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Фильтры */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4 space-y-4">
        {/* Основные фильтры */}
        <div className="flex flex-wrap gap-4 items-end">
          {/* Поиск по номеру */}
          <div className="flex-1 min-w-[200px]">
            <Label className="text-sm mb-1 block">Поиск по номеру ТС</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Введите номер..."
                value={searchPlate}
                onChange={(e) => setSearchPlate(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchPermits(1)}
              />
              <Button variant="outline" size="icon" onClick={() => fetchPermits(1)}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Фильтр по двору */}
          <div className="min-w-[180px]">
            <Label className="text-sm mb-1 block">Двор</Label>
            <Select
              value={filterYardId?.toString() || "all"}
              onValueChange={(v) => setFilterYardId(v === "all" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Все дворы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все дворы</SelectItem>
                {yards.map((yard) => (
                  <SelectItem key={yard.id} value={yard.id.toString()}>
                    {yard.name} {yard.strict_mode ? "🔒" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Фильтр по статусу */}
          <div className="min-w-[140px]">
            <Label className="text-sm mb-1 block">Статус</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="active">Активные</SelectItem>
                <SelectItem value="inactive">Неактивные</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Фильтр по типу */}
          <div className="min-w-[140px]">
            <Label className="text-sm mb-1 block">Тип</Label>
            <Select value={filterPermitType} onValueChange={setFilterPermitType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="one_time">Разовые</SelectItem>
                <SelectItem value="permanent">Постоянные</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Фильтр гость/не гость */}
          <div className="min-w-[140px]">
            <Label className="text-sm mb-1 block">Категория</Label>
            <Select value={filterGuestType} onValueChange={setFilterGuestType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="guest">Гости</SelectItem>
                <SelectItem value="not_guest">Не гости</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Сортировка */}
          <div className="min-w-[180px]">
            <Label className="text-sm mb-1 block">Сортировка</Label>
            <div className="flex gap-1">
              <Select value={sortField} onValueChange={setSortField}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Дата создания</SelectItem>
                  <SelectItem value="begin_date">Дата начала</SelectItem>
                  <SelectItem value="end_date">Дата окончания</SelectItem>
                  <SelectItem value="plate_number">Номер ТС</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
                title={sortDirection === "asc" ? "По возрастанию" : "По убыванию"}
              >
                {sortDirection === "asc" ? (
                  <ArrowUp className="w-4 h-4" />
                ) : (
                  <ArrowDown className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Кнопка расширенных фильтров */}
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={cn(showAdvancedFilters && "bg-primary/10")}
            title="Расширенные фильтры"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        </div>

        {/* Расширенные фильтры */}
        {showAdvancedFilters && (
          <div className="flex flex-wrap gap-4 items-end pt-3 border-t animate-in slide-in-from-top-2">
            {/* Поиск по имени гостя */}
            <div className="min-w-[200px]">
              <Label className="text-sm mb-1 block">Поиск по гостю</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Имя или компания..."
                  value={searchGuest}
                  onChange={(e) => setSearchGuest(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchPermits(1)}
                />
              </div>
            </div>

            {/* Дата с */}
            <div className="min-w-[150px]">
              <Label className="text-sm mb-1 block">Дата с</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>

            {/* Дата по */}
            <div className="min-w-[150px]">
              <Label className="text-sm mb-1 block">Дата по</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>

            {/* Применить даты */}
            <Button variant="outline" onClick={() => fetchPermits(1)}>
              <Filter className="w-4 h-4 mr-2" />
              Применить
            </Button>

            {/* Сбросить все фильтры */}
            <Button 
              variant="ghost" 
              onClick={() => {
                setFilterYardId(null);
                setFilterStatus("all");
                setFilterPermitType("all");
                setFilterGuestType("all");
                setSearchPlate("");
                setSearchGuest("");
                setFilterDateFrom("");
                setFilterDateTo("");
                setSortField("created_at");
                setSortDirection("desc");
                fetchPermits(1);
              }}
              className="text-muted-foreground"
            >
              <X className="w-4 h-4 mr-2" />
              Сбросить всё
            </Button>
          </div>
        )}

        {/* Кнопки действий */}
        <div className="flex flex-wrap gap-2 pt-3 border-t">
          <Button 
            variant="outline" 
            onClick={handleDeactivateExpired}
            disabled={deactivatingExpired}
            className="text-orange-600 border-orange-300 hover:bg-orange-50 hover:text-orange-700"
          >
            {deactivatingExpired ? (
              <MuiCircularProgress size={16} className="mr-2" />
            ) : (
              <AlertTriangle className="w-4 h-4 mr-2" />
            )}
            Деактивировать просроченные
          </Button>
          <Button variant="outline" onClick={() => fetchPermits(currentPage)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Обновить
          </Button>
          <div className="flex-1" />
          <Button onClick={openAddDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Добавить
          </Button>
        </div>
      </div>

      {/* Список разрешений */}
      <div className="flex-1 overflow-hidden bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col">
        {loading ? (
          <div className="p-4 space-y-3 overflow-y-auto flex-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <PermitCardSkeleton key={i} />
            ))}
          </div>
        ) : permits.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <TruckIcon className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Нет разрешений</p>
            <p className="text-sm">Добавьте первое разрешение на въезд</p>
            <Button onClick={openAddDialog} className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Добавить разрешение
            </Button>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {/* Счётчик результатов */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground mb-2">
                <span>
                  Показано <strong className="text-foreground">{pagination.from || 0}</strong>–<strong className="text-foreground">{pagination.to || 0}</strong> из <strong className="text-foreground">{pagination.total}</strong> разрешений
                </span>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-green-600">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Активных: {permits.filter(p => p.status_key === 'active').length}
                  </Badge>
                  <Badge variant="outline" className="text-gray-500">
                    <XCircle className="w-3 h-3 mr-1" />
                    Неактивных: {permits.filter(p => p.status_key !== 'active').length}
                  </Badge>
                </div>
              </div>
              
              {/* Карточки разрешений */}
              <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {permits.map((permit) => (
                  <PermitCard key={permit.id} permit={permit} />
                ))}
              </div>
            </div>

            {/* Пагинация */}
            {pagination.last_page > 1 && (
              <div className="border-t bg-gray-50 dark:bg-gray-900 p-3 flex flex-wrap items-center justify-between gap-3">
                {/* Выбор количества на странице */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Показать:</span>
                  <Select value={perPage.toString()} onValueChange={(v) => handlePerPageChange(Number(v))}>
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Навигация по страницам */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => handlePageChange(1)}
                    disabled={pagination.current_page === 1}
                  >
                    «
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => handlePageChange(pagination.current_page - 1)}
                    disabled={pagination.current_page === 1}
                  >
                    ‹
                  </Button>
                  
                  {/* Номера страниц */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, pagination.last_page) }, (_, i) => {
                      let pageNum: number;
                      if (pagination.last_page <= 5) {
                        pageNum = i + 1;
                      } else if (pagination.current_page <= 3) {
                        pageNum = i + 1;
                      } else if (pagination.current_page >= pagination.last_page - 2) {
                        pageNum = pagination.last_page - 4 + i;
                      } else {
                        pageNum = pagination.current_page - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === pagination.current_page ? "default" : "outline"}
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handlePageChange(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => handlePageChange(pagination.current_page + 1)}
                    disabled={pagination.current_page === pagination.last_page}
                  >
                    ›
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => handlePageChange(pagination.last_page)}
                    disabled={pagination.current_page === pagination.last_page}
                  >
                    »
                  </Button>
                </div>

                {/* Информация о странице */}
                <span className="text-sm text-muted-foreground">
                  Страница {pagination.current_page} из {pagination.last_page}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Диалог добавления/редактирования */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) setFormError(null);
      }}>
        <DialogContent 
          className="sm:max-w-[550px] max-h-[90vh] flex flex-col"
          onPointerDownOutside={(e) => {
            // Предотвращаем закрытие диалога при клике на выпадающий список Autocomplete
            const target = e.target as HTMLElement;
            if (target.closest('.MuiAutocomplete-popper') || target.closest('.MuiAutocomplete-listbox') || target.closest('.MuiAutocomplete-option')) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            // Предотвращаем любое взаимодействие вне диалога при клике на Autocomplete
            const target = e.target as HTMLElement;
            if (target.closest('.MuiAutocomplete-popper') || target.closest('.MuiAutocomplete-listbox') || target.closest('.MuiAutocomplete-option')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {selectedPermit ? "Редактировать разрешение" : "Добавить разрешение"}
            </DialogTitle>
          </DialogHeader>
          
          {/* Блок ошибки */}
          {formError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg flex items-start gap-2 flex-shrink-0">
              <Ban className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">{formError}</div>
            </div>
          )}
          
          <div className="grid gap-4 py-4 overflow-y-auto flex-1 pr-2">
            {/* Поиск ТС */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Транспортное средство *</Label>
                {!selectedPermit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setAddTruckDialogOpen(true)}
                  >
                    <TruckIcon className="w-3 h-3 mr-1" />
                    Добавить новое ТС
                  </Button>
                )}
              </div>
              <Autocomplete
                options={truckOptions}
                getOptionLabel={(option) =>
                  `${option.plate_number}${option.truck_brand_name ? ` (${option.truck_brand_name} ${option.truck_model_name || ""})` : ""}`
                }
                isOptionEqualToValue={(option, value) => option.id === value.id}
                filterOptions={(x) => x}
                value={selectedTruck}
                onChange={(_, newValue) => {
                  setSelectedTruck(newValue);
                  setFormData((prev) => ({ ...prev, truck_id: newValue?.id || null }));
                }}
                onInputChange={(_, newInputValue, reason) => {
                  setTruckSearch(newInputValue);
                  if (reason === 'input') {
                    searchTrucks(newInputValue);
                  }
                }}
                loading={searchingTruck}
                disabled={!!selectedPermit}
                disablePortal
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <div className="flex flex-col">
                      <span className="font-mono font-bold">{option.plate_number}</span>
                      {option.truck_brand_name && (
                        <span className="text-xs text-gray-500">
                          {option.truck_brand_name} {option.truck_model_name || ""}
                        </span>
                      )}
                    </div>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Введите номер ТС для поиска..."
                    size="small"
                    variant="outlined"
                  />
                )}
                noOptionsText={
                  truckSearch.length >= 2 
                    ? "ТС не найдено. Нажмите 'Добавить новое ТС'" 
                    : "Введите номер для поиска"
                }
              />
            </div>

            {/* Двор */}
            <div className="grid gap-2">
              <Label>Двор *</Label>
              <Select
                value={formData.yard_id?.toString() || ""}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, yard_id: Number(v) }))}
                disabled={!!selectedPermit} // Нельзя менять двор при редактировании
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите двор" />
                </SelectTrigger>
                <SelectContent>
                  {yards.map((yard) => (
                    <SelectItem key={yard.id} value={yard.id.toString()}>
                      {yard.name} {yard.strict_mode ? "🔒" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Водитель */}
            <div className="grid gap-2">
              <Label>Водитель (необязательно)</Label>
              <Autocomplete
                options={driverOptions}
                getOptionLabel={(option) => `${option.name}${option.phone ? ` (${option.phone})` : ""}`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                filterOptions={(x) => x}
                value={selectedDriver}
                onChange={(_, newValue) => {
                  setSelectedDriver(newValue);
                  setFormData((prev) => ({ ...prev, user_id: newValue?.id || null }));
                }}
                onInputChange={(_, newInputValue, reason) => {
                  setDriverSearch(newInputValue);
                  if (reason === 'input') {
                    searchDrivers(newInputValue);
                  }
                }}
                disablePortal
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{option.name}</span>
                      {option.phone && (
                        <span className="text-xs text-gray-500">{option.phone}</span>
                      )}
                    </div>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Поиск водителя..."
                    size="small"
                    variant="outlined"
                  />
                )}
                noOptionsText="Введите имя для поиска"
              />
            </div>

            {/* Тип разрешения */}
            <div className="grid gap-2">
              <Label>Тип разрешения</Label>
              <Select
                value={formData.one_permission ? "one_time" : "permanent"}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, one_permission: v === "one_time" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permanent">🔄 Постоянное</SelectItem>
                  <SelectItem value="one_time">⏱️ Разовое (на один въезд)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Весовой контроль */}
            <div className="grid gap-2">
              <Label>Весовой контроль</Label>
              <Select
                value={formData.weighing_required === true ? "required" : formData.weighing_required === false ? "not_required" : "default"}
                onValueChange={(v) =>
                  setFormData((prev) => ({ 
                    ...prev, 
                    weighing_required: v === "required" ? true : v === "not_required" ? false : null 
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">📊 По умолчанию (категория ТС)</SelectItem>
                  <SelectItem value="required">⚖️ Требуется взвешивание</SelectItem>
                  <SelectItem value="not_required">❌ Не требуется взвешивание</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                При въезде ТС автоматически создастся задача на взвешивание
              </p>
            </div>

            {/* Даты */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Дата начала</Label>
                <Input
                  type="date"
                  value={formData.begin_date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, begin_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Дата окончания</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, end_date: e.target.value }))}
                />
              </div>
            </div>

            {/* Гостевой пропуск */}
            <div className="border rounded-lg p-4 space-y-4 bg-purple-50 dark:bg-purple-900/20">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_guest"
                  checked={formData.is_guest}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_guest: e.target.checked }))}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <Label htmlFor="is_guest" className="flex items-center gap-2 cursor-pointer text-purple-700 dark:text-purple-300 font-medium">
                  <UserRound className="w-4 h-4" />
                  Гостевой пропуск
                </Label>
              </div>
              
              {formData.is_guest && (
                <div className="space-y-3 pl-7 animate-in slide-in-from-top-2">
                  <div className="grid gap-2">
                    <Label>ФИО гостя *</Label>
                    <Input
                      placeholder="Иванов Иван Иванович"
                      value={formData.guest_name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, guest_name: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Компания</Label>
                      <Input
                        placeholder="ООО Компания"
                        value={formData.guest_company}
                        onChange={(e) => setFormData((prev) => ({ ...prev, guest_company: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Телефон гостя</Label>
                      <Input
                        placeholder="+7 (999) 999-99-99"
                        value={formData.guest_phone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, guest_phone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>К кому / куда направляется</Label>
                    <Input
                      placeholder="К Петрову П.П., отдел закупок, каб. 215"
                      value={formData.guest_destination}
                      onChange={(e) => setFormData((prev) => ({ ...prev, guest_destination: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Цель визита</Label>
                    <Input
                      placeholder="Подписание договора, встреча, собеседование..."
                      value={formData.guest_purpose}
                      onChange={(e) => setFormData((prev) => ({ ...prev, guest_purpose: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Комментарий */}
            <div className="grid gap-2">
              <Label>Комментарий</Label>
              <Input
                placeholder="Заметки к разрешению..."
                value={formData.comment}
                onChange={(e) => setFormData((prev) => ({ ...prev, comment: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Сохранение..." : selectedPermit ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог деактивации */}
      <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Деактивировать разрешение</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            Вы уверены, что хотите деактивировать разрешение для ТС{" "}
            <strong>{selectedPermit?.plate_number}</strong> на двор{" "}
            <strong>{selectedPermit?.yard_name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateDialogOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={saving}>
              {saving ? "Деактивация..." : "Деактивировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог удаления */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить разрешение</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            Вы уверены, что хотите удалить неактивное разрешение для ТС{" "}
            <strong>{selectedPermit?.plate_number}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? "Удаление..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог добавления нового ТС */}
      <Dialog open={addTruckDialogOpen} onOpenChange={setAddTruckDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Добавить новое ТС</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Номер ТС *</Label>
              <Input
                placeholder="Например: А123БВ77"
                value={newTruckPlate}
                onChange={(e) => setNewTruckPlate(e.target.value.toUpperCase())}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                ТС будет добавлено в базу с указанным номером
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddTruckDialogOpen(false);
              setNewTruckPlate("");
            }}>
              Отмена
            </Button>
            <Button onClick={handleAddNewTruck} disabled={savingTruck || !newTruckPlate.trim()}>
              {savingTruck ? "Добавление..." : "Добавить ТС"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EntryPermitsManager;
