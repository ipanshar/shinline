import React, { useState, useEffect } from "react";
import TaskModal from './TaskModal';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Truck, Calendar, Clock, User, Phone, MapPin, Package, 
  MoreVertical, Pencil, ChevronDown, ChevronUp, Building2,
  Timer, ArrowRight, Warehouse, Scale
} from "lucide-react";
import { cn } from "@/lib/utils";

type TaskWeighing = {
  statuse_weighing_name: string;
  weight: number;
  updated_at: string;
};

type TaskLoading = {
  warehouse_name: string;
  warehouse_gate_plan_name: string;
  warehouse_gate_fact_name: string;
  plane_date: string;
  arrival_at: string | null;
  departure_at: string | null;
};

type Task = {
  id: number;
  name: string;
  status_name: string;
  plan_date: string;
  begin_date: string;
  end_date: string;
  description: string;
  yard_name: string;
  avtor: string;
  phone?: string;
  company?: string;
  truck_plate_number: string;
  trailer_plate_number?: string;
  truck_model?: string;
  truck_category_name?: string;
  trailer_type_name?: string;
  truck_model_name?: string;
  color?: string;
  user_name: string;
  user_login: string;
  user_phone: string;
  created_at?: string;
  task_weighings: TaskWeighing[];
  task_loadings: TaskLoading[];
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

// Форматирование времени без даты (только часы:минуты)
const formatTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

// Вычисление длительности между двумя датами
const calculateDuration = (arrivalAt: string | null, departureAt: string | null): string => {
  if (!arrivalAt || !departureAt) return "—";
  
  const arrival = new Date(arrivalAt);
  const departure = new Date(departureAt);
  const diffMs = departure.getTime() - arrival.getTime();
  
  if (diffMs < 0) return "—";
  
  const diffMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  
  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }
  return `${minutes}м`;
};

// Получение цвета статуса
const getStatusColor = (status: string): string => {
  const lower = status.toLowerCase();
  if (lower.includes('выполн') || lower.includes('завер') || lower.includes('готов')) 
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  if (lower.includes('ожида') || lower.includes('план') || lower.includes('новая') || lower.includes('новый')) 
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  if (lower.includes('отмен') || lower.includes('проблем') || lower.includes('ошибка')) 
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  if (lower.includes('процесс') || lower.includes('работ') || lower.includes('загруз') || lower.includes('выгруз')) 
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  if (lower.includes('прибы') || lower.includes('террит')) 
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  return 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400';
};

interface TaskTableProps {
  tasks: Task[];
  fetchTasks: () => void;
}

// Компонент карточки задания
const TaskCard: React.FC<{ task: Task; onEdit: (id: number) => void }> = ({ task, onEdit }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="p-4 transition-all duration-200 hover:shadow-md">
      {/* Верхняя часть - основная информация */}
      <div className="flex items-start justify-between gap-3">
        {/* Левая часть */}
        <div className="flex-1 min-w-0">
          {/* Рейс и статус */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-bold text-lg">{task.name}</span>
            <Badge className={cn(getStatusColor(task.status_name))}>
              {task.status_name}
            </Badge>
          </div>

          {/* Номер ТС */}
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono font-bold text-base">{task.truck_plate_number}</span>
            {task.trailer_plate_number && (
              <span className="text-sm text-muted-foreground">
                + {task.trailer_plate_number}
              </span>
            )}
          </div>

          {/* Площадка */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{task.yard_name}</span>
          </div>
        </div>

        {/* Правая часть - время и меню */}
        <div className="flex flex-col items-end gap-2">
          {/* Плановая дата */}
          <div className="text-right">
            <div className="text-xs text-muted-foreground">План</div>
            <div className="text-sm font-medium">{formatDate(task.plan_date)}</div>
          </div>

          {/* Меню действий */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(task.id)}>
                <Pencil className="w-4 h-4 mr-2" /> Редактировать
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Временные метки */}
      <div className="flex flex-wrap gap-4 mt-3 text-sm">
        {task.begin_date && (
          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <ArrowRight className="w-3 h-3" />
            <span>Прибытие: {formatDate(task.begin_date)}</span>
          </div>
        )}
        {task.end_date && (
          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
            <ArrowRight className="w-3 h-3 rotate-180" />
            <span>Убытие: {formatDate(task.end_date)}</span>
          </div>
        )}
      </div>

      {/* Погрузки - краткая информация */}
      {task.task_loadings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {task.task_loadings.map((loading, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              <Warehouse className="w-3 h-3 mr-1" />
              {loading.warehouse_name}
              {loading.arrival_at && loading.departure_at && (
                <span className="ml-1 text-purple-600">
                  ({calculateDuration(loading.arrival_at, loading.departure_at)})
                </span>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* Водитель - всегда показываем */}
      <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <div className="flex items-center gap-1">
          <User className="w-3 h-3 text-muted-foreground" />
          <span>{task.user_name}</span>
        </div>
        {task.user_phone && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Phone className="w-3 h-3" />
            <span>{task.user_phone}</span>
          </div>
        )}
      </div>

      {/* Раскрывающаяся секция */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-primary mt-2 hover:underline"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Скрыть детали" : "Показать детали"}
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-4 animate-in slide-in-from-top-2">
          {/* Детали ТС */}
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground uppercase">Транспорт</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {task.truck_model_name && (
                <div><span className="text-muted-foreground">Модель:</span> {task.truck_model_name}</div>
              )}
              {task.truck_category_name && (
                <div><span className="text-muted-foreground">Категория:</span> {task.truck_category_name}</div>
              )}
              {task.color && (
                <div><span className="text-muted-foreground">Цвет:</span> {task.color}</div>
              )}
              {task.trailer_type_name && (
                <div><span className="text-muted-foreground">Тип прицепа:</span> {task.trailer_type_name}</div>
              )}
            </div>
          </div>

          {/* Автор задания */}
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground uppercase">Автор</div>
            <div className="text-sm">
              {task.avtor}
              {task.phone && <span className="text-muted-foreground ml-2">({task.phone})</span>}
              {task.company && <span className="text-muted-foreground ml-2">• {task.company}</span>}
            </div>
          </div>

          {/* Описание */}
          {task.description && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase">Описание</div>
              <div className="text-sm">{task.description}</div>
            </div>
          )}

          {/* Детальная информация о погрузках */}
          {task.task_loadings.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase">Погрузки</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {task.task_loadings.map((loading, i) => (
                  <div key={i} className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                    <div className="font-medium flex items-center gap-1">
                      <Warehouse className="w-4 h-4" />
                      {loading.warehouse_name}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span className="text-muted-foreground">План:</span>{" "}
                        <span>{formatTime(loading.plane_date)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Ворота план:</span>{" "}
                        <span>{loading.warehouse_gate_plan_name || "—"}</span>
                      </div>
                      <div className={loading.arrival_at ? "text-green-600" : ""}>
                        <span className="text-muted-foreground">Прибытие:</span>{" "}
                        <span>{formatTime(loading.arrival_at)}</span>
                      </div>
                      <div className={loading.departure_at ? "text-blue-600" : ""}>
                        <span className="text-muted-foreground">Убытие:</span>{" "}
                        <span>{formatTime(loading.departure_at)}</span>
                      </div>
                    </div>
                    {loading.arrival_at && loading.departure_at && (
                      <div className="pt-1 mt-1 border-t border-muted text-purple-600 font-medium flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        Время на складе: {calculateDuration(loading.arrival_at, loading.departure_at)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Взвешивания */}
          {task.task_weighings.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase">Взвешивания</div>
              <div className="flex flex-wrap gap-2">
                {task.task_weighings.map((weighing, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    <Scale className="w-3 h-3 mr-1" />
                    {weighing.weight} кг — {weighing.statuse_weighing_name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

// Скелетон загрузки
const TaskCardSkeleton: React.FC = () => (
  <Card className="p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-8" />
      </div>
    </div>
    <div className="flex gap-4 mt-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-32" />
    </div>
  </Card>
);

const TaskTable: React.FC<TaskTableProps> = ({ tasks, fetchTasks }) => {
  const [modalTaskId, setModalTaskId] = useState<number | null>(null);
  const isModalOpen = modalTaskId !== null;

  useEffect(() => {
    console.log('🔄 TaskTable получил новые tasks:', tasks.length, 'шт.');
  }, [tasks]);

  const handleModalSaved = () => {
    console.log('💾 Задача сохранена, обновляем список...');
    setModalTaskId(null);
    fetchTasks();
  };

  return (
    <>
      <TaskModal
        taskId={modalTaskId}
        isOpen={isModalOpen}
        onClose={() => setModalTaskId(null)}
        onSaved={handleModalSaved}
      />

      {/* Карточки заданий */}
      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} onEdit={setModalTaskId} />
        ))}
      </div>
    </>
  );
};

export default TaskTable;
