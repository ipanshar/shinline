import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Truck, Clock, MapPin, User, ChevronRight } from 'lucide-react';
import { Link } from '@inertiajs/react';

interface Task {
    id: number;
    truck_plate_number?: string;
    truck_model_name?: string;
    user_name?: string;
    status_name?: string;
    plan_date?: string;
    yard_name?: string;
}

const getStatusColor = (status?: string): string => {
    if (!status) return 'bg-gray-100 text-gray-800';
    const lower = status.toLowerCase();
    if (lower.includes('выполн') || lower.includes('завер')) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    if (lower.includes('ожида') || lower.includes('план')) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    if (lower.includes('отмен') || lower.includes('проблем')) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    if (lower.includes('процесс') || lower.includes('работ')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400';
};

const TodayTasks: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        axios
            .post('/task/actual-tasks', {})
            .then((response) => {
                if (response.data.status) {
                    setTasks(response.data.data.slice(0, 5)); // Показываем только 5 задач
                } else {
                    setError('Ошибка при загрузке задач');
                }
            })
            .catch(() => setError('Ошибка сети'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Card className="h-full">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Задачи на сегодня
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                            <Skeleton className="h-10 w-10 rounded-lg" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                            <Skeleton className="h-6 w-16 rounded-full" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="h-full">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Задачи на сегодня
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-muted-foreground">{error}</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="h-full">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Задачи на сегодня
                </CardTitle>
                <Link 
                    href="/tasks" 
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                    Все задачи
                    <ChevronRight className="h-4 w-4" />
                </Link>
            </CardHeader>
            <CardContent>
                {tasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        Нет задач на сегодня
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tasks.map((task, index) => (
                            <div 
                                key={task.id || index} 
                                className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                            >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <Truck className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">
                                            {task.truck_plate_number || 'Без номера'}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            {task.user_name && (
                                                <span className="flex items-center gap-1">
                                                    <User className="h-3 w-3" />
                                                    {task.user_name}
                                                </span>
                                            )}
                                            {task.yard_name && (
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" />
                                                    {task.yard_name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <Badge 
                                    variant="secondary" 
                                    className={`${getStatusColor(task.status_name)} whitespace-nowrap self-start sm:self-auto`}
                                >
                                    {task.status_name || 'Неизвестно'}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default TodayTasks;
