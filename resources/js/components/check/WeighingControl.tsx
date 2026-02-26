import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { DataGrid, GridColDef, GridActionsCellItem } from "@mui/x-data-grid";
import { Box, CircularProgress, Chip, Tooltip, IconButton } from "@mui/material";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Scale,
  Plus,
  RefreshCw,
  Truck as TruckIcon,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  SkipForward,
  History,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MoreVertical,
  User,
  FileText,
  Weight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Yard {
  id: number;
  name: string;
}

interface WeighingRequirement {
  id: number;
  visitor_id: number | null;
  truck_id: number | null;
  task_id: number | null;
  plate_number: string;
  required_type: "entry" | "exit" | "both";
  reason: string;
  reason_text: string;
  status: "pending" | "entry_done" | "completed" | "skipped";
  needs_entry: boolean;
  needs_exit: boolean;
  entry_weight: number | null;
  entry_weighed_at: string | null;
  visitor_entry_date: string | null;
  task_name: string | null;
  created_at: string;
}

interface Weighing {
  id: number;
  plate_number: string;
  weighing_type: "entry" | "exit" | "intermediate";
  weight: number;
  weighed_at: string;
  weight_diff: number | null;
  visitor_id: number | null;
  truck_id: number | null;
  operator_name: string | null;
  notes: string | null;
}

// Группированное взвешивание (въезд + выезд в одной записи)
interface GroupedWeighing {
  plate_number: string;
  entry_weight: number | null;
  entry_time: string | null;
  exit_weight: number | null;
  exit_time: string | null;
  weight_diff: number | null;
  operator_name: string | null;
  notes: string | null;
  hasEntry: boolean;
  hasExit: boolean;
}

interface WeighFormData {
  plate_number: string;
  weight: string;
  weighing_type: "entry" | "exit" | "intermediate";
  notes: string;
  requirement_id: number | null;
  visitor_id: number | null;
}

// Функция группировки взвешиваний по номеру ТС
const groupWeighings = (weighings: Weighing[]): GroupedWeighing[] => {
  const grouped: Record<string, GroupedWeighing> = {};
  
  weighings.forEach(w => {
    const key = w.plate_number;
    
    if (!grouped[key]) {
      grouped[key] = {
        plate_number: w.plate_number,
        entry_weight: null,
        entry_time: null,
        exit_weight: null,
        exit_time: null,
        weight_diff: null,
        operator_name: null,
        notes: null,
        hasEntry: false,
        hasExit: false,
      };
    }
    
    if (w.weighing_type === "entry") {
      grouped[key].entry_weight = w.weight;
      grouped[key].entry_time = w.weighed_at;
      grouped[key].hasEntry = true;
      if (!grouped[key].operator_name) grouped[key].operator_name = w.operator_name;
      if (!grouped[key].notes && w.notes) grouped[key].notes = w.notes;
    } else if (w.weighing_type === "exit") {
      grouped[key].exit_weight = w.weight;
      grouped[key].exit_time = w.weighed_at;
      grouped[key].weight_diff = w.weight_diff;
      grouped[key].hasExit = true;
      if (w.operator_name) grouped[key].operator_name = w.operator_name;
      if (w.notes) grouped[key].notes = w.notes;
    }
  });
  
  // Сортируем по времени последнего взвешивания (выезд или въезд)
  return Object.values(grouped).sort((a, b) => {
    const timeA = a.exit_time || a.entry_time || '';
    const timeB = b.exit_time || b.entry_time || '';
    return new Date(timeB).getTime() - new Date(timeA).getTime();
  });
};

const WeighingControl: React.FC = () => {
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<number | null>(null);
  const [pendingRequirements, setPendingRequirements] = useState<WeighingRequirement[]>([]);
  const [historyWeighings, setHistoryWeighings] = useState<Weighing[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [isMobile, setIsMobile] = useState(false);
  
  // Фильтр по периоду
  const [dateFrom, setDateFrom] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  // Определяем мобильное устройство
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Диалоги
  const [weighDialogOpen, setWeighDialogOpen] = useState(false);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<WeighingRequirement | null>(null);
  const [skipReason, setSkipReason] = useState("");

  // Форма взвешивания
  const [weighFormData, setWeighFormData] = useState<WeighFormData>({
    plate_number: "",
    weight: "",
    weighing_type: "entry",
    notes: "",
    requirement_id: null,
    visitor_id: null,
  });

  const [saving, setSaving] = useState(false);

  const token = localStorage.getItem("auth_token");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // Загрузка дворов
  const fetchYards = useCallback(() => {
    axios
      .post("/yard/getyards", {}, { headers })
      .then((res) => {
        setYards(res.data.data);
        if (res.data.data.length > 0 && !selectedYardId) {
          setSelectedYardId(res.data.data[0].id);
        }
      })
      .catch((err) => console.error("Ошибка загрузки дворов:", err));
  }, []);

  // Загрузка ожидающих
  const fetchPending = useCallback(() => {
    if (!selectedYardId) return;
    setLoading(true);
    axios
      .post("/weighing/pending", { yard_id: selectedYardId }, { headers })
      .then((res) => {
        if (res.data.status) {
          setPendingRequirements(res.data.data);
        }
      })
      .catch((err) => {
        console.error("Ошибка загрузки требований:", err);
        toast.error("Ошибка загрузки ожидающих взвешивания");
      })
      .finally(() => setLoading(false));
  }, [selectedYardId]);

  // Загрузка истории взвешиваний
  const fetchHistory = useCallback(() => {
    if (!selectedYardId) return;
    setLoading(true);
    axios
      .post("/weighing/history", { 
        yard_id: selectedYardId,
        date_from: dateFrom,
        date_to: dateTo
      }, { headers })
      .then((res) => {
        if (res.data.status) {
          setHistoryWeighings(res.data.data);
        }
      })
      .catch((err) => {
        console.error("Ошибка загрузки взвешиваний:", err);
        toast.error("Ошибка загрузки истории взвешиваний");
      })
      .finally(() => setLoading(false));
  }, [selectedYardId, dateFrom, dateTo]);

  useEffect(() => {
    fetchYards();
  }, [fetchYards]);

  useEffect(() => {
    if (selectedYardId) {
      fetchPending();
      fetchHistory();
    }
  }, [selectedYardId, fetchPending, fetchHistory]);

  // Обработчики
  const handleWeigh = (req: WeighingRequirement, type: "entry" | "exit") => {
    setSelectedRequirement(req);
    setWeighFormData({
      plate_number: req.plate_number,
      weight: "",
      weighing_type: type,
      notes: "",
      requirement_id: req.id,
      visitor_id: req.visitor_id,
    });
    setWeighDialogOpen(true);
  };

  const handleManualWeigh = () => {
    setSelectedRequirement(null);
    setWeighFormData({
      plate_number: "",
      weight: "",
      weighing_type: "entry",
      notes: "",
      requirement_id: null,
      visitor_id: null,
    });
    setWeighDialogOpen(true);
  };

  const handleSkipOpen = (req: WeighingRequirement) => {
    setSelectedRequirement(req);
    setSkipReason("");
    setSkipDialogOpen(true);
  };

  const submitWeighing = async () => {
    if (!weighFormData.weight || parseFloat(weighFormData.weight) <= 0) {
      toast.error("Введите корректный вес");
      return;
    }

    if (!weighFormData.plate_number.trim()) {
      toast.error("Введите номер ТС");
      return;
    }

    // Получаем user_id текущего пользователя
    const userData = sessionStorage.getItem("user");
    const operatorUserId = userData ? JSON.parse(userData).id : null;

    setSaving(true);
    try {
      const response = await axios.post(
        "/weighing/record",
        {
          yard_id: selectedYardId,
          plate_number: weighFormData.plate_number,
          weighing_type: weighFormData.weighing_type,
          weight: parseFloat(weighFormData.weight),
          visitor_id: weighFormData.visitor_id,
          requirement_id: weighFormData.requirement_id,
          operator_user_id: operatorUserId,
          notes: weighFormData.notes || null,
        },
        { headers }
      );

      if (response.data.status) {
        toast.success(`Взвешивание записано: ${response.data.data.weight} кг`);
        if (response.data.data.weight_diff !== null) {
          const diff = response.data.data.weight_diff;
          toast.info(`Разница: ${diff > 0 ? "+" : ""}${diff.toFixed(2)} кг`);
        }
        setWeighDialogOpen(false);
        fetchPending();
        fetchToday();
      } else {
        toast.error(response.data.message || "Ошибка записи");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Ошибка записи взвешивания");
    } finally {
      setSaving(false);
    }
  };

  const submitSkip = async () => {
    if (!skipReason.trim()) {
      toast.error("Укажите причину пропуска");
      return;
    }

    if (!selectedRequirement) return;

    // Получаем user_id из localStorage или другого источника
    const userData = localStorage.getItem("user");
    const userId = userData ? JSON.parse(userData).id : null;

    if (!userId) {
      toast.error("Не удалось определить пользователя");
      return;
    }

    setSaving(true);
    try {
      const response = await axios.post(
        "/weighing/skip",
        {
          requirement_id: selectedRequirement.id,
          user_id: userId,
          reason: skipReason,
        },
        { headers }
      );

      if (response.data.status) {
        toast.success("Взвешивание пропущено");
        setSkipDialogOpen(false);
        fetchPending();
      } else {
        toast.error(response.data.message || "Ошибка");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Ошибка пропуска");
    } finally {
      setSaving(false);
    }
  };

  const getStatusChip = (req: WeighingRequirement) => {
    if (req.status === "pending" && req.needs_entry) {
      return <Chip label="Ожидает въезд" color="warning" size="small" icon={<ArrowDownToLine className="w-3 h-3" />} />;
    }
    if (req.status === "entry_done" && req.needs_exit) {
      return <Chip label="Ожидает выезд" color="info" size="small" icon={<ArrowUpFromLine className="w-3 h-3" />} />;
    }
    if (req.status === "completed") {
      return <Chip label="Завершено" color="success" size="small" icon={<CheckCircle2 className="w-3 h-3" />} />;
    }
    if (req.status === "skipped") {
      return <Chip label="Пропущено" color="default" size="small" icon={<XCircle className="w-3 h-3" />} />;
    }
    return <Chip label={req.status} size="small" />;
  };

  const getWeighingTypeLabel = (type: string) => {
    switch (type) {
      case "entry":
        return "Въезд";
      case "exit":
        return "Выезд";
      case "intermediate":
        return "Промежуточное";
      default:
        return type;
    }
  };

  const getWeighingTypeColor = (type: string): "success" | "warning" | "info" | "default" => {
    switch (type) {
      case "entry":
        return "success";
      case "exit":
        return "warning";
      case "intermediate":
        return "info";
      default:
        return "default";
    }
  };

  // Колонки для ожидающих
  const pendingColumns: GridColDef[] = [
    {
      field: "plate_number",
      headerName: "Номер ТС",
      flex: 1,
      minWidth: 120,
      renderCell: (params) => (
        <div className="flex items-center gap-2">
          <TruckIcon className="w-4 h-4 text-gray-400" />
          <span className="font-mono font-medium">{params.value}</span>
        </div>
      ),
    },
    {
      field: "status",
      headerName: "Статус",
      width: 160,
      renderCell: (params) => getStatusChip(params.row),
    },
    {
      field: "reason_text",
      headerName: "Причина",
      flex: 1,
      minWidth: 150,
    },
    {
      field: "entry_weight",
      headerName: "Вес въезда",
      width: 120,
      renderCell: (params) => {
        if (!params.value) {
          return <span className="text-gray-400">—</span>;
        }
        const weight = parseFloat(params.value);
        return isNaN(weight) ? (
          <span className="text-gray-400">—</span>
        ) : (
          <span className="font-medium">{weight.toFixed(2)} кг</span>
        );
      },
    },
    {
      field: "task_name",
      headerName: "Задание",
      flex: 1,
      minWidth: 120,
      renderCell: (params) =>
        params.value ? (
          <span className="text-blue-600">{params.value}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      field: "visitor_entry_date",
      headerName: "Въехал",
      width: 150,
      renderCell: (params) =>
        params.value ? (
          <Tooltip title={format(new Date(params.value), "dd.MM.yyyy HH:mm")}>
            <span>{formatDistanceToNow(new Date(params.value), { locale: ru, addSuffix: true })}</span>
          </Tooltip>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      field: "actions",
      type: "actions",
      headerName: "Действия",
      width: 150,
      getActions: (params) => {
        const req = params.row as WeighingRequirement;
        const actions = [];

        if (req.needs_entry) {
          actions.push(
            <GridActionsCellItem
              key="weigh-entry"
              icon={
                <Tooltip title="Взвесить (въезд)">
                  <ArrowDownToLine className="w-5 h-5 text-green-600" />
                </Tooltip>
              }
              label="Взвесить въезд"
              onClick={() => handleWeigh(req, "entry")}
            />
          );
        }

        if (req.needs_exit && !req.needs_entry) {
          actions.push(
            <GridActionsCellItem
              key="weigh-exit"
              icon={
                <Tooltip title="Взвесить (выезд)">
                  <ArrowUpFromLine className="w-5 h-5 text-orange-600" />
                </Tooltip>
              }
              label="Взвесить выезд"
              onClick={() => handleWeigh(req, "exit")}
            />
          );
        }

        if (req.status !== "completed" && req.status !== "skipped") {
          actions.push(
            <GridActionsCellItem
              key="skip"
              icon={
                <Tooltip title="Пропустить">
                  <SkipForward className="w-5 h-5 text-gray-500" />
                </Tooltip>
              }
              label="Пропустить"
              onClick={() => handleSkipOpen(req)}
            />
          );
        }

        return actions;
      },
    },
  ];

  // Колонки для сегодняшних
  const todayColumns: GridColDef[] = [
    {
      field: "weighed_at",
      headerName: "Время",
      width: 100,
      renderCell: (params) =>
        params.value ? format(new Date(params.value), "HH:mm") : "—",
    },
    {
      field: "plate_number",
      headerName: "Номер ТС",
      flex: 1,
      minWidth: 120,
      renderCell: (params) => (
        <span className="font-mono font-medium">{params.value}</span>
      ),
    },
    {
      field: "weighing_type",
      headerName: "Тип",
      width: 130,
      renderCell: (params) => (
        <Chip
          label={getWeighingTypeLabel(params.value)}
          color={getWeighingTypeColor(params.value)}
          size="small"
        />
      ),
    },
    {
      field: "weight",
      headerName: "Вес",
      width: 120,
      renderCell: (params) => {
        const weight = params.value ? parseFloat(params.value) : null;
        return (
          <span className="font-medium">
            {weight !== null && !isNaN(weight) ? `${weight.toFixed(2)} кг` : "—"}
          </span>
        );
      },
    },
    {
      field: "weight_diff",
      headerName: "Разница",
      width: 120,
      renderCell: (params) => {
        if (params.value === null || params.value === undefined) {
          return <span className="text-gray-400">—</span>;
        }
        const diff = parseFloat(params.value);
        if (isNaN(diff)) {
          return <span className="text-gray-400">—</span>;
        }
        return (
          <span className={`font-medium ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-gray-600"}`}>
            {diff > 0 ? "+" : ""}
            {diff.toFixed(2)} кг
          </span>
        );
      },
    },
    {
      field: "operator_name",
      headerName: "Оператор",
      flex: 1,
      minWidth: 120,
      renderCell: (params) =>
        params.value || <span className="text-gray-400">—</span>,
    },
    {
      field: "notes",
      headerName: "Примечание",
      flex: 1,
      minWidth: 150,
      renderCell: (params) =>
        params.value ? (
          <Tooltip title={params.value}>
            <span className="truncate">{params.value}</span>
          </Tooltip>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Заголовок и выбор двора */}
      <div className="bg-white dark:bg-gray-800 border-b p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Scale className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            <h1 className="text-lg sm:text-xl font-semibold">Весовой контроль</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Select
              value={selectedYardId?.toString() || ""}
              onValueChange={(val) => setSelectedYardId(parseInt(val))}
            >
              <SelectTrigger className="flex-1 sm:flex-none sm:w-[200px]">
                <SelectValue placeholder="Выберите двор" />
              </SelectTrigger>
              <SelectContent>
                {yards.map((yard) => (
                  <SelectItem key={yard.id} value={yard.id.toString()}>
                    {yard.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                fetchPending();
                fetchHistory();
              }}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Подвкладки */}
      <div className="bg-white dark:bg-gray-800 border-b">
        <div className="flex">
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex-1 px-3 sm:px-4 py-2.5 flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === "pending"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Ожидают ({pendingRequirements.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 px-3 sm:px-4 py-2.5 flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === "history"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <History className="w-4 h-4" />
            <span>История ({new Set(historyWeighings.map(w => w.plate_number)).size})</span>
          </button>
        </div>
      </div>

      {/* Фильтр по периоду для истории */}
      {activeTab === "history" && (
        <div className="p-3 sm:p-4 bg-white dark:bg-gray-800 border-b">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 sm:items-center">
            <div className="flex items-center gap-2 flex-1">
              <Label className="whitespace-nowrap text-sm">С:</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 sm:w-[150px]"
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Label className="whitespace-nowrap text-sm">По:</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 sm:w-[150px]"
              />
            </div>
            <Button onClick={fetchHistory} disabled={loading} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Показать
            </Button>
          </div>
        </div>
      )}

      {/* Кнопка ручного взвешивания */}
      <div className="p-3 sm:p-4 bg-white dark:bg-gray-800 border-b">
        <Button onClick={handleManualWeigh} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          Ручное взвешивание
        </Button>
      </div>

      {/* Контент */}
      <div className="flex-1 p-2 sm:p-4 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <CircularProgress />
          </div>
        ) : activeTab === "pending" ? (
          isMobile ? (
            // Мобильный вид - карточки ожидающих
            <div className="space-y-3">
              {pendingRequirements.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Scale className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Нет ожидающих взвешивания</p>
                </div>
              ) : (
                pendingRequirements.map((req) => (
                  <Card key={req.id} className="p-3">
                    {/* Верхняя часть - номер и статус */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <TruckIcon className="w-5 h-5 text-gray-400" />
                        <span className="font-mono font-bold text-lg">{req.plate_number}</span>
                      </div>
                      <Badge 
                        variant={req.status === "pending" && req.needs_entry ? "default" : "secondary"}
                        className={cn(
                          req.status === "pending" && req.needs_entry && "bg-orange-500",
                          req.status === "entry_done" && req.needs_exit && "bg-blue-500"
                        )}
                      >
                        {req.status === "pending" && req.needs_entry && "Ожидает въезд"}
                        {req.status === "entry_done" && req.needs_exit && "Ожидает выезд"}
                        {req.status === "completed" && "Завершено"}
                        {req.status === "skipped" && "Пропущено"}
                      </Badge>
                    </div>

                    {/* Информация */}
                    <div className="space-y-1 text-sm text-gray-600 mb-3">
                      <p className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5" />
                        {req.reason_text || "Не указано"}
                      </p>
                      {req.entry_weight && (
                        <p className="flex items-center gap-2">
                          <Scale className="w-3.5 h-3.5" />
                          Вес въезда: <span className="font-medium">{parseFloat(String(req.entry_weight)).toFixed(2)} кг</span>
                        </p>
                      )}
                      {req.task_name && (
                        <p className="flex items-center gap-2 text-blue-600">
                          <FileText className="w-3.5 h-3.5" />
                          {req.task_name}
                        </p>
                      )}
                      {req.visitor_entry_date && (
                        <p className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5" />
                          Въехал {formatDistanceToNow(new Date(req.visitor_entry_date), { locale: ru, addSuffix: true })}
                        </p>
                      )}
                    </div>

                    {/* Кнопки действий */}
                    <div className="flex gap-2">
                      {req.needs_entry && (
                        <Button
                          size="sm"
                          className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700"
                          onClick={() => handleWeigh(req, "entry")}
                        >
                          <ArrowDownToLine className="w-4 h-4" />
                          Взвесить (въезд)
                        </Button>
                      )}
                      {req.needs_exit && !req.needs_entry && (
                        <Button
                          size="sm"
                          className="flex-1 gap-1.5 bg-orange-600 hover:bg-orange-700"
                          onClick={() => handleWeigh(req, "exit")}
                        >
                          <ArrowUpFromLine className="w-4 h-4" />
                          Взвесить (выезд)
                        </Button>
                      )}
                      {req.status !== "completed" && req.status !== "skipped" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleSkipOpen(req)}
                        >
                          <SkipForward className="w-4 h-4" />
                          <span className="hidden sm:inline">Пропустить</span>
                        </Button>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          ) : (
            // Десктоп вид - таблица
            <Box sx={{ height: "100%", width: "100%", minHeight: 400 }}>
              <DataGrid
                rows={pendingRequirements}
                columns={pendingColumns}
                pageSizeOptions={[10, 25, 50]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 10 } },
                }}
                disableRowSelectionOnClick
                localeText={{
                  noRowsLabel: "Нет ожидающих взвешивания",
                  MuiTablePagination: {
                    labelRowsPerPage: "Строк:",
                  },
                }}
                sx={{
                  bgcolor: "white",
                  "& .MuiDataGrid-cell": {
                    borderColor: "#e5e7eb",
                  },
                }}
              />
            </Box>
          )
        ) : isMobile ? (
          // Мобильный вид - группированные карточки истории взвешиваний
          <div className="space-y-3">
            {historyWeighings.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Нет взвешиваний за выбранный период</p>
              </div>
            ) : (
              groupWeighings(historyWeighings).map((g, idx) => (
                <Card key={`${g.plate_number}-${idx}`} className="p-3">
                  {/* Верхняя часть - номер и статус */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TruckIcon className="w-5 h-5 text-gray-400" />
                      <span className="font-mono font-bold text-lg">{g.plate_number}</span>
                    </div>
                    <div className="flex gap-1">
                      {g.hasEntry && (
                        <Badge variant="outline" className="border-green-300 text-green-600 bg-green-50">
                          <ArrowDownToLine className="w-3 h-3 mr-1" />
                          Въезд
                        </Badge>
                      )}
                      {g.hasExit && (
                        <Badge variant="outline" className="border-orange-300 text-orange-600 bg-orange-50">
                          <ArrowUpFromLine className="w-3 h-3 mr-1" />
                          Выезд
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Веса в таблице */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-t border-b mb-2">
                    {/* Въезд */}
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">Въезд</p>
                      {g.entry_weight ? (
                        <>
                          <p className="font-bold text-green-600">{parseFloat(String(g.entry_weight)).toFixed(0)} кг</p>
                          <p className="text-xs text-gray-400">
                            {g.entry_time && format(new Date(g.entry_time), "HH:mm")}
                          </p>
                        </>
                      ) : (
                        <p className="text-gray-300">—</p>
                      )}
                    </div>
                    
                    {/* Выезд */}
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">Выезд</p>
                      {g.exit_weight ? (
                        <>
                          <p className="font-bold text-orange-600">{parseFloat(String(g.exit_weight)).toFixed(0)} кг</p>
                          <p className="text-xs text-gray-400">
                            {g.exit_time && format(new Date(g.exit_time), "HH:mm")}
                          </p>
                        </>
                      ) : (
                        <p className="text-gray-300">—</p>
                      )}
                    </div>
                    
                    {/* Разница */}
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">Разница</p>
                      {g.weight_diff !== null && g.weight_diff !== undefined ? (
                        <p className={cn(
                          "font-bold",
                          parseFloat(String(g.weight_diff)) > 0 ? "text-green-600" : 
                          parseFloat(String(g.weight_diff)) < 0 ? "text-red-600" : "text-gray-600"
                        )}>
                          {parseFloat(String(g.weight_diff)) > 0 ? "+" : ""}
                          {parseFloat(String(g.weight_diff)).toFixed(0)} кг
                        </p>
                      ) : g.hasEntry && g.hasExit ? (
                        <p className="text-gray-300">—</p>
                      ) : (
                        <p className="text-xs text-gray-400">ожидание</p>
                      )}
                    </div>
                  </div>

                  {/* Дополнительная информация */}
                  {(g.operator_name || g.notes) && (
                    <div className="space-y-1 text-sm text-gray-600">
                      {g.operator_name && (
                        <p className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5" />
                          {g.operator_name}
                        </p>
                      )}
                      {g.notes && (
                        <p className="flex items-start gap-2">
                          <FileText className="w-3.5 h-3.5 mt-0.5" />
                          <span className="line-clamp-2">{g.notes}</span>
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        ) : (
          // Десктоп вид - группированная таблица
          <div className="bg-white rounded-lg border">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Номер ТС</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Въезд</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Выезд</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Разница</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Оператор</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Примечание</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {historyWeighings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                      <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Нет взвешиваний за выбранный период</p>
                    </td>
                  </tr>
                ) : (
                  groupWeighings(historyWeighings).map((g, idx) => (
                    <tr key={`${g.plate_number}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TruckIcon className="w-4 h-4 text-gray-400" />
                          <span className="font-mono font-bold">{g.plate_number}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {g.entry_weight ? (
                          <div>
                            <span className="font-medium text-green-600">
                              {parseFloat(String(g.entry_weight)).toFixed(2)} кг
                            </span>
                            <p className="text-xs text-gray-400">
                              {g.entry_time && format(new Date(g.entry_time), "HH:mm")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {g.exit_weight ? (
                          <div>
                            <span className="font-medium text-orange-600">
                              {parseFloat(String(g.exit_weight)).toFixed(2)} кг
                            </span>
                            <p className="text-xs text-gray-400">
                              {g.exit_time && format(new Date(g.exit_time), "HH:mm")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {g.weight_diff !== null && g.weight_diff !== undefined ? (
                          <span className={cn(
                            "font-semibold",
                            parseFloat(String(g.weight_diff)) > 0 ? "text-green-600" : 
                            parseFloat(String(g.weight_diff)) < 0 ? "text-red-600" : "text-gray-600"
                          )}>
                            {parseFloat(String(g.weight_diff)) > 0 ? "+" : ""}
                            {parseFloat(String(g.weight_diff)).toFixed(2)} кг
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {g.operator_name || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                        {g.notes ? (
                          <Tooltip title={g.notes}>
                            <span>{g.notes}</span>
                          </Tooltip>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Диалог взвешивания */}
      <Dialog open={weighDialogOpen} onOpenChange={setWeighDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5" />
              {selectedRequirement ? "Записать вес" : "Ручное взвешивание"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Номер ТС</Label>
              <Input
                value={weighFormData.plate_number}
                onChange={(e) =>
                  setWeighFormData({ ...weighFormData, plate_number: e.target.value.toUpperCase() })
                }
                placeholder="А123БВ777"
                disabled={!!selectedRequirement}
              />
            </div>
            <div>
              <Label>Тип взвешивания</Label>
              <Select
                value={weighFormData.weighing_type}
                onValueChange={(val: "entry" | "exit" | "intermediate") =>
                  setWeighFormData({ ...weighFormData, weighing_type: val })
                }
                disabled={!!selectedRequirement}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">Въезд</SelectItem>
                  <SelectItem value="exit">Выезд</SelectItem>
                  <SelectItem value="intermediate">Промежуточное</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Вес (кг)</Label>
              <Input
                type="number"
                value={weighFormData.weight}
                onChange={(e) =>
                  setWeighFormData({ ...weighFormData, weight: e.target.value })
                }
                placeholder="0.00"
                step="0.01"
                min="0"
                autoFocus
              />
            </div>
            {selectedRequirement?.entry_weight && weighFormData.weighing_type === "exit" && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>Вес при въезде:</strong> {parseFloat(String(selectedRequirement.entry_weight)).toFixed(2)} кг
                </p>
                {weighFormData.weight && (
                  <p className="text-sm text-blue-700 mt-1">
                    <strong>Разница:</strong>{" "}
                    {(parseFloat(weighFormData.weight) - parseFloat(String(selectedRequirement.entry_weight))).toFixed(2)} кг
                  </p>
                )}
              </div>
            )}
            <div>
              <Label>Примечание</Label>
              <Textarea
                value={weighFormData.notes}
                onChange={(e) =>
                  setWeighFormData({ ...weighFormData, notes: e.target.value })
                }
                placeholder="Дополнительная информация..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWeighDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={submitWeighing} disabled={saving}>
              {saving ? (
                <>
                  <CircularProgress size={16} className="mr-2" />
                  Сохранение...
                </>
              ) : (
                "Записать"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог пропуска */}
      <Dialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SkipForward className="w-5 h-5" />
              Пропустить взвешивание
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {selectedRequirement && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{selectedRequirement.plate_number}</p>
                <p className="text-sm text-gray-600">{selectedRequirement.reason_text}</p>
              </div>
            )}
            <Label>Причина пропуска *</Label>
            <Textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder="Укажите причину..."
              rows={3}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={submitSkip} disabled={saving} variant="destructive">
              {saving ? "Сохранение..." : "Пропустить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WeighingControl;
