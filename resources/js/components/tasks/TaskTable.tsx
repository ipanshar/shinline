import React, { useState } from "react";
import EditTaskModal, { EditTaskModalProps } from './EditTaskModal';

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

interface TaskTableProps {
  tasks: Task[];
  fetchTasks: () => void; // функция перезагрузки списка задач
}

const TaskTable: React.FC<TaskTableProps> = ({ tasks, fetchTasks }) => {
  // modalTaskId = ID задачи, которую редактируем; null — модалка закрыта
  const [modalTaskId, setModalTaskId] = useState<number | null>(null);
  const isModalOpen = modalTaskId !== null;

  const handleModalSaved = () => {
    setModalTaskId(null);
    fetchTasks();
  };

  return (
    <>
      {/* Рендерим модалку только когда открыт флаг */}
      <EditTaskModal
  taskId={modalTaskId!}
  isOpen={isModalOpen}
  onClose={() => setModalTaskId(null)}
  onSaved={handleModalSaved}
/>


      <div className="overflow-x-auto rounded-lg shadow border border-gray-300">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-3 text-center font-semibold w-12">ID</th>
              <th className="px-4 py-3 text-center font-semibold">Рейс / Статус</th>
              <th className="px-4 py-3 text-center font-semibold">План / Прибытие / Убытие</th>
              <th className="px-4 py-3 text-center font-semibold">Описание</th>
              <th className="px-4 py-3 text-center font-semibold">Автопарк</th>
              <th className="px-4 py-3 text-center font-semibold">Контакты / Водитель</th>
              <th className="px-4 py-3 text-center font-semibold">Погрузка</th>
              <th className="px-4 py-3 text-center font-semibold w-24">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tasks.map(task => (
              <tr
                key={task.id}
                className="hover:bg-gray-50 cursor-pointer"
                title={`Рейс ${task.name}, Статус: ${task.status_name}`}
              >
                <td className="px-4 py-3 text-center font-mono text-gray-600">
                  {task.id}
                </td>
                <td className="px-4 py-3 space-y-1">
                  <div className="font-semibold">{task.name}</div>
                  <div className="text-sm text-gray-500">{task.status_name}</div>
                  <div className="text-xs text-gray-400">{task.yard_name}</div>
                </td>
                <td className="px-4 py-3 space-y-1 font-mono">
                  <div>План: {formatDate(task.plan_date)}</div>
                  <div>Прибытие: {formatDate(task.begin_date)}</div>
                  <div>Убытие: {formatDate(task.end_date)}</div>
                </td>
                <td className="px-4 py-3 max-w-xs break-words">
                  {task.description || "—"}
                </td>
                <td className="px-4 py-3 space-y-1 text-xs font-mono">
                  <div><b>Тр.: </b>{task.truck_plate_number}</div>
                  {task.trailer_plate_number && <div><b>Пр.: </b>{task.trailer_plate_number}</div>}
                  {task.truck_model && <div><b>Модель: </b>{task.truck_model}</div>}
                  {task.truck_category_name && <div><b>Катег.: </b>{task.truck_category_name}</div>}
                  {task.color && <div><b>Цвет: </b>{task.color}</div>}
                </td>
                <td className="px-4 py-3 space-y-1 text-sm">
                  <div><b>Автор: </b>{task.avtor}{task.phone && ` (${task.phone})`}</div>
                  <div><b>Водитель: </b>{task.user_name}</div>
                  <div><b>Логин: </b>{task.user_login}</div>
                  <div><b>Телефон: </b>{task.user_phone}</div>
                </td>
                <td className="px-4 py-3 space-y-3 text-xs max-w-[220px]">
                  {task.task_loadings.length === 0 ? (
                    <div>—</div>
                  ) : (
                    task.task_loadings.map((l, i) => (
                      <div key={i} className="p-2 bg-gray-50 rounded border">
                        <div className="font-semibold">{l.warehouse_name}</div>
                        <div>План: {l.warehouse_gate_plan_name || "—"}</div>
                        <div>Факт: {l.warehouse_gate_fact_name || "—"}</div>
                      </div>
                    ))
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => setModalTaskId(task.id)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default TaskTable;
