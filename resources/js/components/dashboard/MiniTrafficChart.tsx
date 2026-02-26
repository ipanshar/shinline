import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, TrendingUp } from 'lucide-react';
import {
    LineChart, Line,
    BarChart, Bar,
    CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';

interface TrafficDataItem {
    period: string;
    count: number;
}

const MiniTrafficChart: React.FC = () => {
    const [data, setData] = useState<TrafficDataItem[]>([]);
    const [chartType, setChartType] = useState<'line' | 'bar'>('bar');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios
            .get<TrafficDataItem[]>('/api/admin/traffic-stats?group_by=day')
            .then((res) => setData(res.data.slice(-7))) // Последние 7 записей
            .catch((err) => console.error('Ошибка при загрузке графика:', err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Card className="h-full">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Въезды ТС
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[200px] w-full rounded-lg" />
                </CardContent>
            </Card>
        );
    }

    const totalCount = data.reduce((sum, item) => sum + item.count, 0);
    const avgCount = data.length > 0 ? Math.round(totalCount / data.length) : 0;

    return (
        <Card className="h-full">
            <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
                <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Въезды ТС
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Всего: <span className="font-medium text-foreground">{totalCount}</span>
                        <span className="mx-2">·</span>
                        Среднее: <span className="font-medium text-foreground">{avgCount}/день</span>
                    </p>
                </div>
                <div className="flex gap-1">
                    <Button
                        variant={chartType === 'bar' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setChartType('bar')}
                        className="h-7 px-2 text-xs"
                    >
                        <BarChart3 className="h-3 w-3" />
                    </Button>
                    <Button
                        variant={chartType === 'line' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setChartType('line')}
                        className="h-7 px-2 text-xs"
                    >
                        <TrendingUp className="h-3 w-3" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        {chartType === 'line' ? (
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis 
                                    dataKey="period" 
                                    tick={{ fontSize: 10 }} 
                                    tickFormatter={(value) => {
                                        const parts = value.split('-');
                                        return parts.length >= 3 ? `${parts[2]}.${parts[1]}` : value;
                                    }}
                                />
                                <YAxis tick={{ fontSize: 10 }} width={30} />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'hsl(var(--card))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '8px'
                                    }}
                                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="count"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                                    name="Въездов"
                                />
                            </LineChart>
                        ) : (
                            <BarChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis 
                                    dataKey="period" 
                                    tick={{ fontSize: 10 }} 
                                    tickFormatter={(value) => {
                                        const parts = value.split('-');
                                        return parts.length >= 3 ? `${parts[2]}.${parts[1]}` : value;
                                    }}
                                />
                                <YAxis tick={{ fontSize: 10 }} width={30} />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'hsl(var(--card))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '8px'
                                    }}
                                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                                />
                                <Bar 
                                    dataKey="count" 
                                    fill="hsl(var(--primary))" 
                                    radius={[4, 4, 0, 0]} 
                                    name="Въездов"
                                />
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
};

export default MiniTrafficChart;
