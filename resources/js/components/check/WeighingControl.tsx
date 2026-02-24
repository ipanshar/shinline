import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { DataGrid, GridColDef, GridActionsCellItem } from "@mui/x-data-grid";
import { Box, CircularProgress, Chip, Tooltip, IconButton } from "@mui/material";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

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

interface WeighFormData {
  plate_number: string;
  weight: string;
  weighing_type: "entry" | "exit" | "intermediate";
  notes: string;
  requirement_id: number | null;
  visitor_id: number | null;
}

const WeighingControl: React.FC = () => {
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<number | null>(null);
  const [pendingRequirements, setPendingRequirements] = useState<WeighingRequirement[]>([]);
  const [todayWeighings, setTodayWeighings] = useState<Weighing[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "today" | "stats">("pending");

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

  // Загрузка сегодняшних взвешиваний
  const fetchToday = useCallback(() => {
    if (!selectedYardId) return;
    setLoading(true);
    axios
      .post("/weighing/today", { yard_id: selectedYardId }, { headers })
      .then((res) => {
        if (res.data.status) {
          setTodayWeighings(res.data.data);
        }
      })
      .catch((err) => {
        console.error("Ошибка загрузки взвешиваний:", err);
        toast.error("Ошибка загрузки взвешиваний за сегодня");
      })
      .finally(() => setLoading(false));
  }, [selectedYardId]);

  useEffect(() => {
    fetchYards();
  }, [fetchYards]);

  useEffect(() => {
    if (selectedYardId) {
      fetchPending();
      fetchToday();
    }
  }, [selectedYardId, fetchPending, fetchToday]);

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

        if (req.needs_exit) {
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
      <div className="bg-white dark:bg-gray-800 border-b p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold">Весовой контроль</h1>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Select
              value={selectedYardId?.toString() || ""}
              onValueChange={(val) => setSelectedYardId(parseInt(val))}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
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
                fetchToday();
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
            className={`flex-1 sm:flex-none px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              activeTab === "pending"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Ожидают ({pendingRequirements.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("today")}
            className={`flex-1 sm:flex-none px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              activeTab === "today"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <History className="w-4 h-4" />
            <span>Сегодня ({todayWeighings.length})</span>
          </button>
        </div>
      </div>

      {/* Кнопка ручного взвешивания */}
      <div className="p-4 bg-white dark:bg-gray-800 border-b">
        <Button onClick={handleManualWeigh} className="gap-2">
          <Plus className="w-4 h-4" />
          Ручное взвешивание
        </Button>
      </div>

      {/* Контент */}
      <div className="flex-1 p-4 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <CircularProgress />
          </div>
        ) : activeTab === "pending" ? (
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
        ) : (
          <Box sx={{ height: "100%", width: "100%", minHeight: 400 }}>
            <DataGrid
              rows={todayWeighings}
              columns={todayColumns}
              pageSizeOptions={[10, 25, 50, 100]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } },
                sorting: { sortModel: [{ field: "weighed_at", sort: "desc" }] },
              }}
              disableRowSelectionOnClick
              localeText={{
                noRowsLabel: "Нет взвешиваний за сегодня",
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
