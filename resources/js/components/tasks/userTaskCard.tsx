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

export type Task = {
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
  onScanClick?: () => void; // событие для кнопки
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("kk-KZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const UserTaskCard: React.FC<{ task: Task }> = ({ task }) => {
  return (
    <div className="bg-white shadow-md rounded-xl p-4 mb-6 border border-gray-200 max-w-3xl mx-auto">
      <div className="text-lg font-bold text-blue-700 mb-2">
        📌 {task.id} | 🚚 Рейс: {task.name} | {task.status_name} 
      </div>

      <div className="text-sm text-gray-600 mb-2">
        📅 План: {formatDate(task.plan_date)} | ⏳ Прибытие: {formatDate(task.begin_date)} | 🚀 Убытие: {formatDate(task.end_date)}
      </div>

      {task.description && <p className="text-sm mb-1">📝 {task.description}</p>}
      <p className="text-sm mb-1">🏠 Двор: {task.yard_name}</p>
      <p className="text-sm mb-1">
        📞 Координатор: <b>{task.avtor}</b> {task.phone && `| Тел: ${task.phone}`}
      </p>

      <p className="text-sm mb-1">
        🚛 Компания: <b>{task.company || "Не указано"}</b> | Номер ТС: <b>{task.truck_plate_number}</b>
      </p>
      
      {task.trailer_plate_number && <p className="text-sm mb-1">Номер прицепа: {task.trailer_plate_number}</p>}
      {task.truck_model && <p className="text-sm mb-1">Модель ТС: {task.truck_model}</p>}
      {task.truck_category_name && <p className="text-sm mb-1">Категория: {task.truck_category_name}</p>}
      {task.trailer_type_name && <p className="text-sm mb-1">Тип прицепа: {task.trailer_type_name}</p>}
      {task.color && <p className="text-sm mb-1">Цвет: {task.color}</p>}

      <p className="text-sm mb-1">
        👤 Водитель: <b>{task.user_name}</b> | Login: {task.user_login} | Тел: {task.user_phone}
      </p>

      {task.coordinates && typeof task.coordinates === "string" && (
        <div className="mt-2 w-full">
          <button
            onClick={() =>
              window.open(`https://www.google.com/maps?q=${task.coordinates}`, "_blank")
            }
            className="w-full bg-white/60 hover:bg-white/80 text-gray-800 font-medium py-2 px-4 rounded-lg border border-gray-300 shadow transition duration-200 cursor-pointer"
          >
            📍Открыть на карте
          </button>
        </div>
      )}



      {/* Таблица задач */}
      {(task.task_weighings.length > 0 || task.task_loadings.length > 0) && (
        <div className="mt-4 border rounded-md overflow-hidden">
          <div className="bg-gray-100 px-4 py-2 font-semibold text-center">Задачи</div>
          <table className="w-full text-sm">
            <tbody>
              {task.task_weighings.map((w, idx) => (
                <tr key={`weighing-${idx}`} className="bg-green-50 border-t">
                  <td className="px-3 py-2">📏 {w.statuse_weighing_name}</td>
                  <td className="px-3 py-2">Вес: <b>{w.weight || "—"}</b></td>
                  <td className="px-3 py-2">{w.weight ? formatDate(w.updated_at) : "—"}</td>
                </tr>
              ))}
              {task.task_loadings.map((l, idx) => (
                <tr key={`loading-${idx}`} className="bg-yellow-50 border-t">
                  <td className="px-3 py-2">{l.warehouse_name}</td>
                  <td className="px-3 py-2">План: <b>{l.warehouse_gate_plan_name}</b></td>
                  <td className="px-3 py-2">Факт: <b>{l.warehouse_gate_fact_name}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Кнопка сканирования */}
      <div className="mt-4 text-center">
        <button
          onClick={task.onScanClick}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 w-full rounded-lg shadow font-semibold transition"
        >
          Сканировать QR
        </button>
      

      </div>

     
    </div>
  );
};

export default UserTaskCard;
