import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  BarElement,
  ArcElement,
} from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  BarElement,
  ArcElement
);

type VisitorDay = { date: string; total: number };
type WarehouseStat = { warehouse_id: string; total: number; warehouse?: { name?: string } };
type TaskByStatus = { status_id: string; total: number; name: string };
type TaskPerUser = { user_id: string; total: number; user?: { name?: string } };

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
  visitors_per_day: VisitorDay[];
  top_warehouses_by_loadings: WarehouseStat[];
  tasks_per_user: TaskPerUser[];
  tasks_by_status: TaskByStatus[];
}

const Statistics: React.FC = () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const sevenDaysAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(sevenDaysAgoStr);
  const [to, setTo] = useState(todayStr);

  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (from && to) {
      setLoading(true);
      setError(null);
      axios
        .get<StatsData>('/api/admin/statistics', { params: { from, to } })
        .then((res) => setStats(res.data))
        .catch(() => setError('Ошибка загрузки статистики'))
        .finally(() => setLoading(false));
    }
  }, [from, to]);

  const handleFromChange = (value: string) => {
    if (!to || value <= to) setFrom(value);
  };

  const handleToChange = (value: string) => {
    if (!from || (value >= from && value <= todayStr)) setTo(value);
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Загрузка статистики...</div>;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;
  if (!stats) return null;

  const topUsers = stats.tasks_per_user.slice(0, 5);
  const userLabels = topUsers.map((u) => u.user?.name || `Пользователь #${u.user_id}`);
  const userData = topUsers.map((u) => u.total);

  const statusLabels = stats.tasks_by_status.map((s) => s.name);
  const statusData = stats.tasks_by_status.map((s) => s.total);

  const statusChartData = {
    labels: statusLabels,
    datasets: [
      {
        label: 'Задачи по статусам',
        data: statusData,
        backgroundColor: [
          '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
        ],
      },
    ],
  };

  const userChartData = {
    labels: userLabels,
    datasets: [
      {
        label: 'Задачи по пользователям',
        data: userData,
        backgroundColor: '#3b82f6',
      },
    ],
  };

  const warehouseChartData = {
    labels: stats.top_warehouses_by_loadings.map(
      (w) => w.warehouse?.name || `Склад #${w.warehouse_id}`
    ),
    datasets: [
      {
        label: 'Количество погрузок',
        data: stats.top_warehouses_by_loadings.map((w) => w.total),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
      },
    ],
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-8 bg-white min-h-screen rounded-2xl shadow-lg">
      <section className="relative">
        {/* Фильтр по датам с прилипанием */}
        <div className="sticky top-0 z-50 bg-white border-b border-gray-200 py-3">
          <div className="flex flex-wrap gap-4 items-center justify-start">
            <label className="text-sm font-medium text-gray-700">
              С:
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => handleFromChange(e.target.value)}
                className="ml-2 border px-3 py-1 rounded-md shadow-sm focus:outline-none focus:ring focus:ring-blue-200"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              По:
              <input
                type="date"
                value={to}
                min={from}
                max={todayStr}
                onChange={(e) => handleToChange(e.target.value)}
                className="ml-2 border px-3 py-1 rounded-md shadow-sm focus:outline-none focus:ring focus:ring-blue-200"
              />
            </label>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-gray-900 text-center">📊 Общая статистика</h2>

        {/* Основные показатели */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          <StatBox label="Всего задач" value={stats.total_tasks} />
          <StatBox label="Всего погрузок" value={stats.total_loadings} />
          <StatBox label="Всего взвешиваний" value={stats.total_weighings} />
          <StatBox label="Средний вес" value={`${stats.average_weight} кг`} />
          <StatBox label="Всего грузовиков" value={stats.total_trucks} />
          <StatBox label="Всего водителей" value={stats.total_drivers} />
        </div>

        {/* Посетители */}
        <section>
          <h3 className="text-2xl font-semibold mt-6 mb-4">👥 Посетители</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <StatBox label="Сегодня" value={stats.visitors_today} />
            <StatBox label="Неделя" value={stats.visitors_week} />
            <StatBox label="Месяц" value={stats.visitors_month} />
          </div>
        </section>

        {/* Диаграмма задач по статусам */}
        <div className="flex justify-center mt-8">
          <div className="bg-white p-4 rounded-lg shadow w-full md:w-1/2">
            <h3 className="text-lg font-semibold mb-4 text-center">Задачи по статусам</h3>
            <div className="h-64">
              <Pie data={statusChartData} />
            </div>
          </div>
        </div>

        {/* Диаграммы по складам и пользователям */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4 text-center">Склады по количеству погрузок</h3>
            <div className="h-64">
              <Bar
                data={warehouseChartData}
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: { x: { beginAtZero: true } },
                }}
              />
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4 text-center">Пользователи по задачам</h3>
            <div className="h-64">
              <Bar
                data={userChartData}
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: { x: { beginAtZero: true } },
                }}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

interface StatBoxProps {
  label: string;
  value: number | string;
}
const StatBox: React.FC<StatBoxProps> = ({ label, value }) => (
  <div className="p-4 bg-gray-100 rounded-lg shadow-sm text-center">
    <div className="text-gray-500 text-sm">{label}</div>
    <div className="text-2xl font-semibold text-gray-900">{value}</div>
  </div>
);

export default Statistics;
