import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LineChart, Line,
  BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';

interface TrafficDataItem {
  period: string;
  count: number;
}

const TrafficChart: React.FC = () => {
  const [data, setData] = useState<TrafficDataItem[]>([]);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const [chartType, setChartType] = useState<'line' | 'bar'>('bar');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchData(groupBy);
  }, [groupBy]);

  const fetchData = async (group: 'day' | 'week' | 'month') => {
    try {
      setLoading(true);
      const res = await axios.get<TrafficDataItem[]>(`/api/admin/traffic-stats?group_by=${group}`);
      setData(res.data);
    } catch (err) {
      console.error('Ошибка при загрузке графика:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 bg-white rounded-2xl shadow-lg space-y-6">
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
        Статистика въездов ТС
      </h2>

      {/* Группировка по периоду */}
      <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
        {(['day', 'week', 'month'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setGroupBy(type)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring
              ${groupBy === type
                ? 'bg-blue-600 text-white shadow'
                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
          >
            По {type === 'day' ? 'дням' : type === 'week' ? 'неделям' : 'месяцам'}
          </button>
        ))}
      </div>

      {/* Тип графика */}
      <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
        <button
          onClick={() => setChartType('line')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring
            ${chartType === 'line'
              ? 'bg-green-600 text-white shadow'
              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
            }`}
        >
          Линейный
        </button>
        <button
          onClick={() => setChartType('bar')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring
            ${chartType === 'bar'
              ? 'bg-green-600 text-white shadow'
              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
            }`}
        >
          Столбчатый
        </button>
      </div>

      {/* График */}
      {loading ? (
        <div className="text-center text-gray-500 py-10">Загрузка данных...</div>
      ) : (
        <div className="w-full h-[350px] sm:h-[400px] overflow-x-auto">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            ) : (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default TrafficChart;
