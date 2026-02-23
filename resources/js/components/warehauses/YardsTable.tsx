import React, { useEffect, useState } from "react";
import axios from "axios";
import { DataGrid, GridColDef, GridActionsCellItem } from "@mui/x-data-grid";
import { Box, useMediaQuery, CircularProgress, Chip } from "@mui/material";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Shield, ShieldOff } from "lucide-react";

interface Yard {
  id: number;
  name: string;
  strict_mode: boolean;
  created_at?: string;
  updated_at?: string;
}

const YardsTable: React.FC = () => {
  const [yards, setYards] = useState<Yard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingYard, setEditingYard] = useState<Yard | null>(null);
  const [deletingYard, setDeletingYard] = useState<Yard | null>(null);
  const [formData, setFormData] = useState({ name: "", strict_mode: false });
  const [saving, setSaving] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");

  const token = localStorage.getItem("auth_token");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchYards = () => {
    setLoading(true);
    axios
      .post("/yard/getyards", {}, { headers })
      .then((response) => {
        if (response.data.status) {
          setYards(response.data.data);
        }
      })
      .catch((error) => console.error("Ошибка загрузки дворов:", error))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchYards();
  }, []);

  const openAddDialog = () => {
    setEditingYard(null);
    setFormData({ name: "", strict_mode: false });
    setDialogOpen(true);
  };

  const openEditDialog = (yard: Yard) => {
    setEditingYard(yard);
    setFormData({ name: yard.name, strict_mode: yard.strict_mode });
    setDialogOpen(true);
  };

  const openDeleteDialog = (yard: Yard) => {
    setDeletingYard(yard);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Введите название двора");
      return;
    }

    setSaving(true);
    try {
      if (editingYard) {
        // Редактирование
        await axios.post(
          "/yard/updateyard",
          {
            id: editingYard.id,
            name: formData.name,
            strict_mode: formData.strict_mode,
          },
          { headers }
        );
        toast.success("Двор обновлён");
      } else {
        // Добавление
        await axios.post(
          "/yard/addyard",
          { name: formData.name },
          { headers }
        );
        toast.success("Двор добавлен");
      }
      setDialogOpen(false);
      fetchYards();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingYard) return;

    setSaving(true);
    try {
      await axios.post("/yard/deleteyard", { id: deletingYard.id }, { headers });
      toast.success("Двор удалён");
      setDeleteDialogOpen(false);
      fetchYards();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Ошибка удаления");
    } finally {
      setSaving(false);
    }
  };

  const toggleStrictMode = async (yard: Yard) => {
    try {
      await axios.post(
        "/yard/updateyard",
        {
          id: yard.id,
          name: yard.name,
          strict_mode: !yard.strict_mode,
        },
        { headers }
      );
      toast.success(
        yard.strict_mode
          ? "Строгий режим выключен"
          : "Строгий режим включён"
      );
      fetchYards();
    } catch (error: any) {
      toast.error("Ошибка изменения режима");
    }
  };

  const columns: GridColDef[] = [
    { field: "id", headerName: "ID", width: isMobile ? 50 : 70 },
    { field: "name", headerName: "Название", flex: 1, minWidth: 150 },
    {
      field: "strict_mode",
      headerName: "Строгий режим",
      width: 150,
      renderCell: (params) => (
        <Chip
          icon={params.value ? <Shield size={16} /> : <ShieldOff size={16} />}
          label={params.value ? "Включён" : "Выключен"}
          color={params.value ? "error" : "default"}
          size="small"
          onClick={() => toggleStrictMode(params.row)}
          sx={{ cursor: "pointer" }}
        />
      ),
    },
    {
      field: "actions",
      type: "actions",
      headerName: "Действия",
      width: 120,
      getActions: (params) => [
        <GridActionsCellItem
          key="edit"
          icon={<Pencil size={18} />}
          label="Редактировать"
          onClick={() => openEditDialog(params.row)}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<Trash2 size={18} />}
          label="Удалить"
          onClick={() => openDeleteDialog(params.row)}
        />,
      ],
    },
  ];

  return (
    <Box>
      {/* Кнопка добавления */}
      <Box sx={{ mb: 2 }}>
        <Button onClick={openAddDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить двор
        </Button>
      </Box>

      {/* Таблица */}
      <Box sx={{ width: "100%", maxWidth: "1200px", margin: "auto" }}>
        <h2 style={{ textAlign: "center", marginBottom: "16px" }}>Дворы</h2>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", padding: 5 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ height: 400, width: "100%" }}>
            <DataGrid
              rows={yards}
              columns={columns}
              loading={loading}
              getRowId={(row) => row.id}
              pageSizeOptions={isMobile ? [5] : [5, 10, 20]}
              initialState={{
                pagination: { paginationModel: { pageSize: 10 } },
              }}
            />
          </Box>
        )}
      </Box>

      {/* Диалог добавления/редактирования */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editingYard ? "Редактировать двор" : "Добавить двор"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Введите название двора"
              />
            </div>

            {editingYard && (
              <div className="flex items-center space-x-3 p-3 border rounded-lg">
                <Checkbox
                  id="strict_mode"
                  checked={formData.strict_mode}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, strict_mode: checked === true })
                  }
                />
                <div className="space-y-0.5">
                  <Label htmlFor="strict_mode" className="flex items-center gap-2 cursor-pointer">
                    <Shield className="w-4 h-4" />
                    Строгий режим
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Запрет въезда без разрешения
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог удаления */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Удалить двор?</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Вы уверены, что хотите удалить двор{" "}
              <strong>{deletingYard?.name}</strong>?
            </p>
            <p className="text-sm text-red-500 mt-2">
              Это действие нельзя отменить. Все связанные склады и ворота
              потеряют привязку к этому двору.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? "Удаление..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default YardsTable;
