import React, { useEffect, useState } from "react";
import axios from "axios";

type Task = {
  truck_own: any;
  truck_plate_number?: string;
  truck_model_name?: string;
  user_name?: string;
  user_phone?: string;
  status_name?: string;
  plan_date?: string;
  yard_name?: string;
  description?: string;
  name?: string;
  // add other fields if needed
};

export default function TrucksTable() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem("auth_token");

  useEffect(() => {
    setLoading(true);
    axios.post(
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

  if (loading) return <div className="p-2 text-center text-gray-500">Загрузка...</div>;
  if (error) return <div className="p-2 text-center text-red-500">{error}</div>;
  if (!tasks.length) return <div className="p-2 text-center text-gray-600">Актуальных задач нет</div>;

  // 🔽 Фильтруем нужные задачи один раз
  const filteredTasks = tasks.filter(
    (task) => task.truck_plate_number && task.status_name === "Новый"
  );
  const countTasks = filteredTasks.length;

  return (
    <>
      <h2 className="text-xl font-semibold">
        Ожидаемые транспортные средства {countTasks > 0 && `(${countTasks})`}
      </h2>
      <div className="overflow-x-auto border border-gray-300 rounded-sm">
        <table className="min-w-full text-sm text-left text-gray-700">
          <thead className="bg-gray-100">
            <tr>
              <th className="py-2 px-3 font-semibold border-b border-gray-300">№ машины</th>
              <th className="py-2 px-3 font-semibold border-b border-gray-300">Модель</th>
              <th className="py-2 px-3 font-semibold border-b border-gray-300">Владелец</th>
              <th className="py-2 px-3 font-semibold border-b border-gray-300">Задание</th>
              <th className="py-2 px-3 font-semibold border-b border-gray-300">Пояснение</th>
              <th className="py-2 px-3 font-semibold border-b border-gray-300">Водитель</th>
              <th className="py-2 px-3 font-semibold border-b border-gray-300">Телефон</th>
              <th className="py-2 px-3 font-semibold border-b border-gray-300">Статус</th>
              <th className="py-2 px-3 font-semibold border-b border-gray-300">Дата плана</th>
              <th className="py-2 px-3 font-semibold border-b border-gray-300">Площадка</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task, i) => (
              <tr
                key={i}
                className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <td className="py-1 px-3 whitespace-nowrap">{task.truck_plate_number || "-"}</td>
                <td className="py-1 px-3 whitespace-nowrap">{task.truck_model_name || "-"}</td>
                <td className="py-1 px-3 whitespace-nowrap">{task.truck_own || "Не указано"}</td>
                <td className="py-1 px-3 whitespace-nowrap">{task.name || "-"}</td>
                <td className="py-1 px-3 whitespace-nowrap">{task.description || "-"}</td>
                <td className="py-1 px-3 whitespace-nowrap">{task.user_name || "-"}</td>
                <td className="py-1 px-3 whitespace-nowrap">{task.user_phone || "-"}</td>
                <td className="py-1 px-3 whitespace-nowrap text-gray-600">{task.status_name || "-"}</td>
                <td className="py-1 px-3 whitespace-nowrap">
                  {task.plan_date
                    ? new Date(task.plan_date).toLocaleDateString()
                    : "-"}
                </td>
                <td className="py-1 px-3 whitespace-nowrap">{task.yard_name || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

