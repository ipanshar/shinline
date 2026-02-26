import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import TaskTable from './TaskTable';
import { Task } from './types';
import TaskModal from './TaskModal';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  Search, Filter, X, ChevronDown, ChevronUp, Plus, 
  ArrowUpDown, Calendar, RefreshCw, SlidersHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";

// Типы для справочников
type Status = { id: number; name: string };
type Yard = { id: number; name: string };

// Типы для фильтров
interface Filters {
  search: string;
  status_id: string;
  yard_id: string;
  plan_date_from: string;
  plan_date_to: string;
}

// Типы сортировки
type SortField = 'plan_date' | 'name' | 'status_name' | 'created_at';
type SortOrder = 'asc' | 'desc';

const TasksMiddle: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTasks, setTotalTasks] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Справочники
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);

  // Фильтры
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status_id: '',
    yard_id: '',
    plan_date_from: '',
    plan_date_to: '',
  });

  // Сортировка (клиентская)
  const [sortField, setSortField] = useState<SortField>('plan_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const userStr = sessionStorage.getItem('user');
  let isSupplier = false;

  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      isSupplier = Array.isArray(user.roles) && user.roles.includes('Снабженец');
    } catch (err) {
      console.error('Ошибка парсинга user из sessionStorage:', err);
    }
  }

  // Загрузка справочников
  useEffect(() => {
    axios.post('/setings/getstatus').then(res => {
      if (res.data.status && res.data.data) {
        setStatuses(res.data.data);
      }
    }).catch(() => {});

    axios.post('/yard/getyards').then(res => {
      if (res.data.status && res.data.data) {
        setYards(res.data.data);
      }
    }).catch(() => {});
  }, []);

  const fetchTasks = (pageNum: number, currentFilters: Filters = filters) => {
    console.log('🔄 Обновление списка задач, страница:', pageNum);
    setLoading(true);
    setError(null);

    const params: Record<string, any> = { page: pageNum };
    
    if (currentFilters.search) params.search = currentFilters.search;
    if (currentFilters.status_id) params.status_id = currentFilters.status_id;
    if (currentFilters.yard_id) params.yard_id = currentFilters.yard_id;
    if (currentFilters.plan_date_from) params.plan_date = currentFilters.plan_date_from;
    if (currentFilters.plan_date_to) params.end_date = currentFilters.plan_date_to;

    axios.post('/task/gettasks', params)
      .then(response => {
        console.log('✅ Получен ответ от API:', response.data);
        if (response.data.status) {
          const newTasks = response.data.data.tasks || response.data.data;
          console.log('📦 Новые задачи:', newTasks.length, 'шт.');
          setTasks(newTasks);
          setTotalPages(response.data.data.totalPages || 1);
          setTotalTasks(response.data.data.total || newTasks.length);
        } else {
          setError('Ошибка при загрузке задач');
          setTasks([]);
        }
      })
      .catch(err => {
        console.error('❌ Ошибка загрузки задач:', err);
        setError(err.message || 'Ошибка запроса');
        setTasks([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTasks(page);
  }, [page]);

  // Применить фильтры
  const applyFilters = () => {
    setPage(1);
    fetchTasks(1, filters);
  };

  // Сбросить фильтры
  const resetFilters = () => {
    const emptyFilters: Filters = {
      search: '',
      status_id: '',
      yard_id: '',
      plan_date_from: '',
      plan_date_to: '',
    };
    setFilters(emptyFilters);
    setPage(1);
    fetchTasks(1, emptyFilters);
  };

  // Количество активных фильтров
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.status_id) count++;
    if (filters.yard_id) count++;
    if (filters.plan_date_from) count++;
    if (filters.plan_date_to) count++;
    return count;
  }, [filters]);

  // Сортировка задач (клиентская)
  const sortedTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortField) {
        case 'plan_date':
          aVal = a.plan_date ? new Date(a.plan_date).getTime() : 0;
          bVal = b.plan_date ? new Date(b.plan_date).getTime() : 0;
          break;
        case 'created_at':
          aVal = a.created_at ? new Date(a.created_at).getTime() : 0;
          bVal = b.created_at ? new Date(b.created_at).getTime() : 0;
          break;
        case 'name':
          aVal = a.name?.toLowerCase() || '';
          bVal = b.name?.toLowerCase() || '';
          break;
        case 'status_name':
          aVal = a.status_name?.toLowerCase() || '';
          bVal = b.status_name?.toLowerCase() || '';
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [tasks, sortField, sortOrder]);

  // Переключение сортировки
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));

  return (
    <div className='p-4 md:p-5 space-y-4'>
      {/* Панель инструментов */}
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          {/* Верхняя строка: поиск и кнопки */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            {/* Поиск */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по рейсу или описанию..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                className="pl-9"
              />
            </div>

            {/* Кнопки */}
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                onClick={() => setFiltersOpen(!filtersOpen)}
                className={cn(activeFiltersCount > 0 && "border-primary")}
              >
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Фильтры
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>

              <Button variant="outline" onClick={() => fetchTasks(page)}>
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </Button>

              {isSupplier && (
                <Button onClick={() => setIsModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить
                </Button>
              )}
            </div>
          </div>

          {/* Расширенные фильтры */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleContent className="pt-4 border-t">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Статус */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Статус</label>
                  <Select
                    value={filters.status_id || "all"}
                    onValueChange={(val) => setFilters({ ...filters, status_id: val === "all" ? "" : val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Все статусы" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все статусы</SelectItem>
                      {statuses.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Площадка */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Площадка</label>
                  <Select
                    value={filters.yard_id || "all"}
                    onValueChange={(val) => setFilters({ ...filters, yard_id: val === "all" ? "" : val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Все площадки" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все площадки</SelectItem>
                      {yards.map((y) => (
                        <SelectItem key={y.id} value={String(y.id)}>
                          {y.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Дата от */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">План от</label>
                  <Input
                    type="date"
                    value={filters.plan_date_from}
                    onChange={(e) => setFilters({ ...filters, plan_date_from: e.target.value })}
                  />
                </div>

                {/* Дата до */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">План до</label>
                  <Input
                    type="date"
                    value={filters.plan_date_to}
                    onChange={(e) => setFilters({ ...filters, plan_date_to: e.target.value })}
                  />
                </div>
              </div>

              {/* Кнопки фильтров */}
              <div className="flex gap-2 mt-4">
                <Button onClick={applyFilters}>
                  <Filter className="w-4 h-4 mr-2" />
                  Применить
                </Button>
                {activeFiltersCount > 0 && (
                  <Button variant="ghost" onClick={resetFilters}>
                    <X className="w-4 h-4 mr-2" />
                    Сбросить
                  </Button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </Card>

      {/* Сортировка */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Сортировка:</span>
        {[
          { field: 'plan_date' as SortField, label: 'По дате плана' },
          { field: 'created_at' as SortField, label: 'По дате создания' },
          { field: 'name' as SortField, label: 'По названию' },
          { field: 'status_name' as SortField, label: 'По статусу' },
        ].map(({ field, label }) => (
          <Button
            key={field}
            variant={sortField === field ? "secondary" : "ghost"}
            size="sm"
            onClick={() => toggleSort(field)}
            className="h-7"
          >
            {label}
            {sortField === field && (
              sortOrder === 'asc' 
                ? <ChevronUp className="w-3 h-3 ml-1" />
                : <ChevronDown className="w-3 h-3 ml-1" />
            )}
          </Button>
        ))}
      </div>

      {/* Информация о результатах */}
      {!loading && (
        <div className="text-sm text-muted-foreground">
          Найдено: <strong className="text-foreground">{totalTasks}</strong> заданий
          {totalPages > 1 && (
            <span className="ml-2">
              (страница {page} из {totalPages})
            </span>
          )}
        </div>
      )}

      {/* Состояния загрузки/ошибки */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="p-4">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
                <div className="flex gap-4 pt-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className="p-6 text-center">
          <div className="text-red-600 mb-2">Ошибка: {error}</div>
          <Button variant="outline" onClick={() => fetchTasks(page)}>
            Повторить
          </Button>
        </Card>
      )}

      {!loading && !error && tasks.length === 0 && (
        <Card className="p-8 text-center">
          <div className="text-muted-foreground mb-2">Задачи не найдены</div>
          {activeFiltersCount > 0 && (
            <Button variant="outline" onClick={resetFilters}>
              Сбросить фильтры
            </Button>
          )}
        </Card>
      )}

      {/* Таблица задач */}
      {!loading && !error && tasks.length > 0 && (
        <TaskTable tasks={sortedTasks} fetchTasks={() => fetchTasks(page)} />
      )}

      {/* Пагинация */}
      {!loading && totalPages > 1 && (
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              Страница {page} из {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goPrev}
                disabled={page === 1 || loading}
              >
                Назад
              </Button>
              
              {/* Номера страниц */}
              <div className="hidden sm:flex gap-1">
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  
                  return (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(pageNum)}
                      className="w-8 h-8 p-0"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={goNext}
                disabled={page === totalPages || loading}
              >
                Вперёд
              </Button>
            </div>
          </div>
        </Card>
      )}

      <TaskModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSaved={() => fetchTasks(page)} 
      />
    </div>
  );
};

export default TasksMiddle;
