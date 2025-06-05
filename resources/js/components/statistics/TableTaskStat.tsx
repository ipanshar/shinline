import React, { useEffect, useState } from "react";
import axios from "axios";

interface Task {
  truck_plate_number?: string;
  truck_model_name?: string;
  user_name?: string;
  user_phone?: string;
  status_name?: string;
  plan_date?: string;
  yard_name?: string;
}

export default function TableTaskStat() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem("auth_token");

  useEffect(() => {
    setLoading(true);
    axios
      .post(
        "/task/actual-tasks",
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      .then((response) => {
        if (response.data.status) setTasks(response.data.data);
        else setError("Ошибка при загрузке задач");
      })
      .catch(() => setError("Ошибка сети или сервера"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="text-center text-gray-500 py-6">Загрузка данных...</div>;
  if (error) return <div className="text-center text-red-500 py-6">{error}</div>;
  if (!tasks.length) return <div className="text-center text-gray-600 py-6">Актуальных задач нет</div>;

  return (
    <div className="w-full bg-white rounded-2xl shadow-lg p-4 sm:p-6 space-y-4">
      <h2 className="text-2xl font-bold text-gray-800">Задачи на сегодня</h2>

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 text-sm text-gray-800">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left border-b">№ Машины</th>
              <th className="px-4 py-3 text-left border-b">Модель</th>
              <th className="px-4 py-3 text-left border-b">Водитель</th>
              <th className="px-4 py-3 text-left border-b">Телефон</th>
              <th className="px-4 py-3 text-left border-b">Статус</th>
              <th className="px-4 py-3 text-left border-b">Дата плана</th>
              <th className="px-4 py-3 text-left border-b">Площадка</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, i) => (
              <tr key={i} className="hover:bg-gray-100 border-b transition-colors">
                <td className="px-4 py-2 whitespace-nowrap">{task.truck_plate_number || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap">{task.truck_model_name || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap">{task.user_name || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap">{task.user_phone || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-600">{task.status_name || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {task.plan_date ? new Date(task.plan_date).toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{task.yard_name || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
