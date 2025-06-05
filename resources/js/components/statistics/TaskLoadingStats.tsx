import React, { useEffect, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";
import axios from "axios";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface StatItem {
  date: string;
  planned: number;
  fact: number;
}

const TaskLoadingStats: React.FC = () => {
  const [stats, setStats] = useState<StatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    axios
      .get("/admin/getloadingstats")
      .then((res) => {
        setStats(res.data.data);
      })
      .catch((err) => setError("Ошибка загрузки: " + err.message))
      .finally(() => setLoading(false));
  }, []);

  const labels = stats.map((item) => item.date);
  const data = {
    labels,
    datasets: [
      {
        label: "Плановые отгрузки",
        data: stats.map((item) => item.planned),
        backgroundColor: "rgba(59, 130, 246, 0.7)", // blue-500
      },
      {
        label: "Фактические отгрузки",
        data: stats.map((item) => item.fact),
        backgroundColor: "rgba(16, 185, 129, 0.7)", // green-500
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          font: {
            size: 14,
          },
        },
      },
      title: {
        display: true,
        text: "Статистика погрузок по дням",
        font: {
          size: 18,
          weight: "bold" as const,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          font: {
            size: 12,
          },
        },
      },
      x: {
        ticks: {
          font: {
            size: 12,
          },
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 text-gray-600">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-500 border-opacity-50"></div>
        <p className="mt-4 text-base font-medium">Загрузка статистики...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-8 p-4 bg-red-100 border border-red-300 text-red-700 rounded-lg shadow">
        <strong className="font-semibold">Ошибка:</strong> {error}
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-6 md:px-10 p-6 bg-white rounded-2xl shadow-xl mt-8">
      <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6 text-center">
        Статистика погрузок
      </h2>
      <Bar data={data} options={options} />
    </div>
  );

};

export default TaskLoadingStats;
