import React, { useEffect, useState } from "react";
import axios from "axios";

interface Truck {
  truck_model_name?: string;
  plate_number?: string;
  truck_brand_name?: string;
  truck_categories_name?: string;
  color?: string;
  vin?: string;
  trailer_model_name?: string;
  trailer_type_name?: string;
  created_at?: string;
}

export default function TrackListStat() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem("auth_token");

  useEffect(() => {
    setLoading(true);
    axios
      .post(
        "/trucs/gettrucks",
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      .then((response) => {
        if (response.data.status) setTrucks(response.data.data);
        else setError("Ошибка при загрузке данных");
      })
      .catch(() => setError("Ошибка сети или сервера"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="text-center text-gray-500 py-6">Загрузка данных...</div>;
  if (error) return <div className="text-center text-red-500 py-6">{error}</div>;
  if (!trucks.length) return <div className="text-center text-gray-600 py-6">Нет зарегистрированных грузовиков</div>;

  return (
    <div className="w-full bg-white rounded-2xl shadow-lg p-4 sm:p-6 space-y-4">
      <h2 className="text-2xl font-bold text-gray-800">Список грузовиков</h2>

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 text-sm text-gray-800">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left border-b">Марка</th>
              <th className="px-4 py-3 text-left border-b">Гос. номер</th>
              <th className="px-4 py-3 text-left border-b">Телефон</th>
              <th className="px-4 py-3 text-left border-b">Категория</th>
              <th className="px-4 py-3 text-left border-b">Цвет</th>
              <th className="px-4 py-3 text-left border-b">VIN</th>
              <th className="px-4 py-3 text-left border-b">Прицеп</th>
              <th className="px-4 py-3 text-left border-b">Тип прицепа</th>
              <th className="px-4 py-3 text-left border-b">Дата регистрации</th>
            </tr>
          </thead>
          <tbody>
            {trucks.map((truck, i) => (
              <tr key={i} className="hover:bg-gray-100 border-b transition-colors">
                <td className="px-4 py-2 whitespace-nowrap">{truck.truck_model_name || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap">{truck.plate_number || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap">{truck.truck_brand_name || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap">{truck.truck_categories_name || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap">{truck.color || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-600">{truck.vin || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap">{truck.trailer_model_name || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap">{truck.trailer_type_name || "-"}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {truck.created_at ? new Date(truck.created_at).toLocaleDateString() : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
