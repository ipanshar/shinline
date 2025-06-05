import React from "react";

type TaskWeighing = {
  statuse_weighing_name: string;
  weight: number;
  updated_at: string;
};

type TaskLoading = {
  warehouse_name: string;
  warehouse_gate_plan_name: string;
  warehouse_gate_fact_name: string;
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
  task_weighings: TaskWeighing[];
  task_loadings: TaskLoading[];
};

const formatDate = (dateStr: string) => {
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

const TaskTable: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  return (
    <div className="overflow-x-auto rounded-lg shadow border border-gray-300">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-3 text-center font-semibold text-gray-700 w-12">ID</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-700 min-w-[120px]">Рейс / Статус</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-700 min-w-[140px]">План / Прибытие / Убытие</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-700 min-w-[100px]">Описание</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-700 min-w-[100px]">Автопарк</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-700 min-w-[160px]">Контакты / Водитель</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-700 min-w-[180px]">Погрузка</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tasks.map((task) => (
            <tr
              key={task.id}
              className="hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
              title={`Рейс ${task.name}, Статус: ${task.status_name}`}
            >
              <td className="px-4 py-3 align-top font-mono text-gray-600">{task.id}</td>
              <td className="px-4 py-3 align-top space-y-1">
                <div className="font-semibold text-gray-800">{task.name}</div>
                <div className="text-sm text-gray-500">{task.status_name}</div>
                <div className="text-xs text-gray-400">{task.yard_name}</div>
              </td>
              <td className="px-4 py-3 align-top space-y-1 font-mono text-gray-700">
                <div>План: {formatDate(task.plan_date)}</div>
                <div>Прибытие: {formatDate(task.begin_date)}</div>
                <div>Убытие: {formatDate(task.end_date)}</div>
              </td>
              <td className="px-4 py-3 align-top max-w-xs text-gray-700 break-words whitespace-normal">
                {task.description || "—"}
              </td>
              <td className="px-4 py-3 align-top space-y-1 text-gray-700 text-xs font-mono">
                <div><b>Тр.: </b>{task.truck_plate_number}</div>
                {task.trailer_plate_number && <div><b>Пр.: </b>{task.trailer_plate_number}</div>}
                {task.truck_model && <div><b>Модель: </b>{task.truck_model}</div>}
                {task.truck_category_name && <div><b>Катег.: </b>{task.truck_category_name}</div>}
                {task.color && <div><b>Цвет: </b>{task.color}</div>}
              </td>
              <td className="px-4 py-3 align-top space-y-1 text-gray-700 text-sm">
                <div><b>Автор: </b>{task.avtor} {task.phone && `(${task.phone})`}</div>
                <div><b>Водитель: </b>{task.user_name}</div>
                <div><b>Логин: </b>{task.user_login}</div>
                <div><b>Телефон: </b>{task.user_phone}</div>
              </td>
              <td className="px-4 py-3 align-top space-y-3 max-w-[220px] text-gray-700 text-xs">
                {task.task_loadings.length === 0 ? (
                  <div>—</div>
                ) : (
                  task.task_loadings.map((l, i) => (
                    <div key={i} className="p-2 bg-gray-50 rounded border border-gray-200">
                      <div className="font-semibold">{l.warehouse_name}</div>
                      <div>План: <span className="text-green-600">{l.warehouse_gate_plan_name || "—"}</span></div>
                      <div>Факт: <span className="text-red-600">{l.warehouse_gate_fact_name || "—"}</span></div>
                    </div>
                  ))
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TaskTable;
