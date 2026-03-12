import React, { useEffect, useState } from "react";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Pagination from "@/components/pagination";
import { Search } from "lucide-react";

interface Truck {
  id: number;
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
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const token = localStorage.getItem("auth_token");
  const perPage = 25;

  useEffect(() => {
    setLoading(true);
    setError(null);

    const payload: Record<string, string | number> = {
      page: currentPage,
      per_page: perPage,
    };

    if (appliedSearch.trim()) {
      payload.plate_number = appliedSearch.trim();
    }

    axios
      .post(
        "/trucs/gettrucks",
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      .then((response) => {
        if (response.data.status) {
          setTrucks(response.data.data ?? []);
          setLastPage(response.data.last_page || 1);
          setTotal(response.data.total || 0);
        } else {
          setError("Ошибка при загрузке данных");
        }
      })
      .catch((requestError) => {
        if (requestError?.response?.status === 404) {
          setTrucks([]);
          setLastPage(1);
          setTotal(0);
          return;
        }

        setError("Ошибка сети или сервера");
      })
      .finally(() => setLoading(false));
  }, [appliedSearch, currentPage, token]);

  const applySearch = () => {
    setCurrentPage(1);
    setAppliedSearch(searchInput);
  };

  return (
    <div className="w-full bg-white rounded-2xl shadow-lg p-4 sm:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Список грузовиков</h2>
          <p className="text-sm text-gray-500">
            Показано {trucks.length} из {total} записей
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[360px] sm:flex-row">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applySearch();
              }
            }}
            placeholder="Поиск по гос. номеру"
          />
          <Button onClick={applySearch}>
            <Search className="h-4 w-4" />
            Найти
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="text-center text-gray-500 py-6">Загрузка данных...</div>
        ) : error ? (
          <div className="text-center text-red-500 py-6">{error}</div>
        ) : !trucks.length ? (
          <div className="text-center text-gray-600 py-6">Нет зарегистрированных грузовиков</div>
        ) : (
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
              {trucks.map((truck) => (
                <tr key={truck.id} className="hover:bg-gray-100 border-b transition-colors">
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
        )}
      </div>

      {lastPage > 1 && (
        <Pagination currentPage={currentPage} lastPage={lastPage} setPage={setCurrentPage} />
      )}
    </div>
  );
}
