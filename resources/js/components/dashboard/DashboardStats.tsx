import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
    Truck, 
    Users, 
    ClipboardList, 
    Scale, 
    Warehouse, 
    TrendingUp, 
    TrendingDown,
    Minus,
    CalendarDays,
    UserCheck
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface StatsData {
    total_tasks: number;
    total_loadings: number;
    total_weighings: number;
    average_weight: number;
    total_trucks: number;
    total_drivers: number;
    visitors_today: number;
    visitors_week: number;
    visitors_month: number;
}

interface StatCardProps {
    title: string;
    value: number | string;
    icon: React.ReactNode;
    description?: string;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    className?: string;
}

const StatCard: React.FC<StatCardProps> = ({ 
    title, 
    value, 
    icon, 
    description, 
    trend, 
    trendValue,
    className = ''
}) => {
    const getTrendIcon = () => {
        switch (trend) {
            case 'up': return <TrendingUp className="h-3 w-3 text-green-500" />;
            case 'down': return <TrendingDown className="h-3 w-3 text-red-500" />;
            default: return <Minus className="h-3 w-3 text-gray-400" />;
        }
    };

    const getTrendColor = () => {
        switch (trend) {
            case 'up': return 'text-green-600';
            case 'down': return 'text-red-600';
            default: return 'text-gray-500';
        }
    };

    return (
        <Card className={`transition-all duration-200 hover:shadow-lg hover:scale-[1.02] ${className}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    {icon}
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {(description || trendValue) && (
                    <div className="flex items-center gap-1 mt-1">
                        {trend && getTrendIcon()}
                        <p className={`text-xs ${getTrendColor()}`}>
                            {trendValue && <span className="font-medium">{trendValue}</span>}
                            {description && <span className="text-muted-foreground ml-1">{description}</span>}
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const DashboardStats: React.FC = () => {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        axios
            .get<StatsData>('/api/admin/statistics', { params: { from: weekAgo, to: today } })
            .then((res) => setStats(res.data))
            .catch(() => setError('Ошибка загрузки статистики'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-8 w-8 rounded-lg" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-16 mb-2" />
                            <Skeleton className="h-3 w-32" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                {error || 'Нет данных'}
            </div>
        );
    }

    return (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
                title="Всего задач"
                value={stats.total_tasks}
                icon={<ClipboardList className="h-4 w-4 text-primary" />}
                description="за 7 дней"
                trend="neutral"
            />
            <StatCard
                title="Погрузки"
                value={stats.total_loadings}
                icon={<Warehouse className="h-4 w-4 text-blue-600" />}
                description="за 7 дней"
                trend="up"
            />
            <StatCard
                title="Взвешивания"
                value={stats.total_weighings}
                icon={<Scale className="h-4 w-4 text-amber-600" />}
                description="за 7 дней"
            />
            <StatCard
                title="Средний вес"
                value={`${stats.average_weight} кг`}
                icon={<Scale className="h-4 w-4 text-purple-600" />}
                description="за 7 дней"
            />
            <StatCard
                title="Транспорт"
                value={stats.total_trucks}
                icon={<Truck className="h-4 w-4 text-green-600" />}
                description="всего в базе"
            />
            <StatCard
                title="Водители"
                value={stats.total_drivers}
                icon={<Users className="h-4 w-4 text-indigo-600" />}
                description="с транспортом"
            />
            <StatCard
                title="Посетители сегодня"
                value={stats.visitors_today}
                icon={<UserCheck className="h-4 w-4 text-cyan-600" />}
            />
            <StatCard
                title="Посетители за неделю"
                value={stats.visitors_week}
                icon={<CalendarDays className="h-4 w-4 text-rose-600" />}
            />
        </div>
    );
};

export default DashboardStats;
