import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { DataGrid, GridColDef, GridActionsCellItem } from "@mui/x-data-grid";
import { Box, CircularProgress, Chip, TextField, Autocomplete } from "@mui/material";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { Plus, Pencil, Ban, Trash2, Search, RefreshCw, Shield, Clock, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

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
  begin_date: string | null;
  end_date: string | null;
  status_id: number;
  comment: string | null;
  created_at: string;
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
  begin_date: string;
  end_date: string;
  comment: string;
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

  // Фильтры
  const [filterYardId, setFilterYardId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPermitType, setFilterPermitType] = useState<string>("all");
  const [searchPlate, setSearchPlate] = useState("");

  // Форма добавления/редактирования
  const [formData, setFormData] = useState<FormData>({
    truck_id: null,
    yard_id: null,
    user_id: null,
    one_permission: false,
    begin_date: "",
    end_date: "",
    comment: "",
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

  const token = localStorage.getItem("auth_token");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchPermits = useCallback(() => {
    setLoading(true);
    const params: any = {};
    if (filterYardId) params.yard_id = filterYardId;
    if (filterStatus !== "all") params.status = filterStatus;
    if (filterPermitType !== "all") params.permit_type = filterPermitType;
    if (searchPlate.trim()) params.plate_number = searchPlate.trim();

    axios
      .post("/security/getpermits", params, { headers })
      .then((response) => {
        if (response.data.status) {
          setPermits(response.data.data);
        }
      })
      .catch((error) => {
        console.error("Ошибка загрузки разрешений:", error);
        toast.error("Ошибка загрузки разрешений");
      })
      .finally(() => setLoading(false));
  }, [filterYardId, filterStatus, filterPermitType, searchPlate]);

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
    fetchPermits();
  }, []);

  useEffect(() => {
    fetchPermits();
  }, [filterYardId, filterStatus, filterPermitType, fetchPermits]);

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

  const openAddDialog = () => {
    setSelectedPermit(null);
    setFormData({
      truck_id: null,
      yard_id: null,
      user_id: null,
      one_permission: false,
      begin_date: format(new Date(), "yyyy-MM-dd"),
      end_date: "",
      comment: "",
    });
    setSelectedTruck(null);
    setSelectedDriver(null);
    setTruckSearch("");
    setDriverSearch("");
    setDialogOpen(true);
  };

  const openEditDialog = (permit: EntryPermit) => {
    setSelectedPermit(permit);
    setFormData({
      truck_id: permit.truck_id,
      yard_id: permit.yard_id,
      user_id: permit.user_id,
      one_permission: permit.one_permission,
      begin_date: permit.begin_date ? format(new Date(permit.begin_date), "yyyy-MM-dd") : "",
      end_date: permit.end_date ? format(new Date(permit.end_date), "yyyy-MM-dd") : "",
      comment: permit.comment || "",
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
    if (!formData.truck_id) {
      toast.error("Выберите транспортное средство");
      return;
    }
    if (!formData.yard_id) {
      toast.error("Выберите двор");
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
            begin_date: formData.begin_date || null,
            end_date: formData.end_date || null,
            comment: formData.comment || null,
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
            begin_date: formData.begin_date || null,
            end_date: formData.end_date || null,
            comment: formData.comment || null,
          },
          { headers }
        );
        toast.success("Разрешение создано");
      }
      setDialogOpen(false);
      fetchPermits();
    } catch (error: any) {
      const message = error.response?.data?.message || "Ошибка сохранения";
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
      fetchPermits();
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
      fetchPermits();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Ошибка удаления");
    } finally {
      setSaving(false);
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

  const columns: GridColDef[] = [
    {
      field: "plate_number",
      headerName: "Номер ТС",
      flex: 1,
      minWidth: 130,
      renderCell: (params) => (
        <div className="flex flex-col">
          <span className="font-mono font-bold">{params.value}</span>
          {params.row.truck_brand_name && (
            <span className="text-xs text-gray-500">
              {params.row.truck_brand_name} {params.row.truck_model_name}
            </span>
          )}
        </div>
      ),
    },
    {
      field: "yard_name",
      headerName: "Двор",
      flex: 1,
      minWidth: 120,
      renderCell: (params) => (
        <div className="flex items-center gap-1">
          {params.row.yard_strict_mode && (
            <Shield className="w-4 h-4 text-red-500" />
          )}
          <span>{params.value}</span>
        </div>
      ),
    },
    {
      field: "one_permission",
      headerName: "Тип",
      width: 120,
      renderCell: (params) =>
        params.value ? (
          <Chip icon={<Clock className="w-3 h-3" />} label="Разовое" size="small" color="warning" />
        ) : (
          <Chip icon={<CalendarClock className="w-3 h-3" />} label="Постоянное" size="small" color="success" />
        ),
    },
    {
      field: "status_key",
      headerName: "Статус",
      width: 110,
      renderCell: (params) =>
        params.value === "active" ? (
          <Chip label="Активно" size="small" color="success" />
        ) : (
          <Chip label="Неактивно" size="small" color="default" />
        ),
    },
    {
      field: "driver_name",
      headerName: "Водитель",
      flex: 1,
      minWidth: 130,
      renderCell: (params) => params.value || "—",
    },
    {
      field: "begin_date",
      headerName: "Начало",
      width: 100,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "end_date",
      headerName: "Окончание",
      width: 100,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "granted_by_name",
      headerName: "Выдал",
      flex: 1,
      minWidth: 120,
      renderCell: (params) => params.value || <span className="text-gray-400 italic">1С/Система</span>,
    },
    {
      field: "task_name",
      headerName: "Задание",
      flex: 1,
      minWidth: 100,
      renderCell: (params) => params.value || "—",
    },
    {
      field: "comment",
      headerName: "Комментарий",
      flex: 1,
      minWidth: 120,
      renderCell: (params) => params.value || "—",
    },
    {
      field: "actions",
      type: "actions",
      headerName: "Действия",
      width: 120,
      getActions: (params) => {
        const actions = [
          <GridActionsCellItem
            icon={<Pencil className="w-4 h-4" />}
            label="Редактировать"
            onClick={() => openEditDialog(params.row)}
          />,
        ];
        if (params.row.status_key === "active") {
          actions.push(
            <GridActionsCellItem
              icon={<Ban className="w-4 h-4 text-orange-500" />}
              label="Деактивировать"
              onClick={() => openDeactivateDialog(params.row)}
            />
          );
        } else {
          actions.push(
            <GridActionsCellItem
              icon={<Trash2 className="w-4 h-4 text-red-500" />}
              label="Удалить"
              onClick={() => openDeleteDialog(params.row)}
            />
          );
        }
        return actions;
      },
    },
  ];

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Фильтры */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Поиск по номеру */}
          <div className="flex-1 min-w-[200px]">
            <Label className="text-sm mb-1 block">Поиск по номеру ТС</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Введите номер..."
                value={searchPlate}
                onChange={(e) => setSearchPlate(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchPermits()}
              />
              <Button variant="outline" size="icon" onClick={fetchPermits}>
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
          <div className="min-w-[150px]">
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
          <div className="min-w-[150px]">
            <Label className="text-sm mb-1 block">Тип разрешения</Label>
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

          {/* Кнопки */}
          <Button variant="outline" onClick={fetchPermits}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Обновить
          </Button>
          <Button onClick={openAddDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Добавить
          </Button>
        </div>
      </div>

      {/* Таблица */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow">
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={permits}
            columns={columns}
            pageSizeOptions={[10, 25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
            }}
            disableRowSelectionOnClick
            sx={{
              border: "none",
              "& .MuiDataGrid-cell": {
                borderBottom: "1px solid rgba(224, 224, 224, 0.5)",
              },
            }}
            localeText={{
              noRowsLabel: "Нет разрешений",
            }}
          />
        )}
      </div>

      {/* Диалог добавления/редактирования */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>
              {selectedPermit ? "Редактировать разрешение" : "Добавить разрешение"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Поиск ТС */}
            <div className="grid gap-2">
              <Label>Транспортное средство *</Label>
              <Autocomplete
                options={truckOptions}
                getOptionLabel={(option) =>
                  `${option.plate_number}${option.truck_brand_name ? ` (${option.truck_brand_name} ${option.truck_model_name || ""})` : ""}`
                }
                value={selectedTruck}
                onChange={(_, newValue) => {
                  setSelectedTruck(newValue);
                  setFormData((prev) => ({ ...prev, truck_id: newValue?.id || null }));
                }}
                onInputChange={(_, newInputValue) => {
                  setTruckSearch(newInputValue);
                  searchTrucks(newInputValue);
                }}
                loading={searchingTruck}
                disabled={!!selectedPermit} // Нельзя менять ТС при редактировании
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Введите номер ТС для поиска..."
                    size="small"
                    variant="outlined"
                  />
                )}
                noOptionsText="Введите номер для поиска"
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
                value={selectedDriver}
                onChange={(_, newValue) => {
                  setSelectedDriver(newValue);
                  setFormData((prev) => ({ ...prev, user_id: newValue?.id || null }));
                }}
                onInputChange={(_, newInputValue) => {
                  setDriverSearch(newInputValue);
                  searchDrivers(newInputValue);
                }}
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
          <DialogFooter>
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
    </div>
  );
};

export default EntryPermitsManager;
