import { useState } from "react";
import { Head } from "@inertiajs/react";
import AppLayout from "@/layouts/app-layout";
import { type BreadcrumbItem } from "@/types";
import AddVehicleDialog from "@/components/vehicles/AddVehicleDialog";
import VehicleSearch from "@/components/vehicles/VehicleSearch";
import VehicleList from "@/components/vehicles/VehicleList";
import { Vehicle, searchVehicles } from "@/lib/api";
import axios from "axios";

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: "Проверка",
    href: "/check",
  },
];

export default function Check() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchPattern, setSearchPattern] = useState<string>("");

  // Поиск по 3 цифрам
  const handleSearch = async (pattern: string) => {
    setSearchPattern(pattern);
    setIsLoading(true);
    try {
      const results = await searchVehicles(pattern);
      setVehicles(results);
    } catch (error) {
      console.error("Ошибка при поиске:", error);
    } finally {
      setIsLoading(false);
    }

  //   const serch = await axios.post('/security/searchtruck', {
  //     plate_number: pattern,
  //   }).then((response) => {
  //     if (response.data.status === true) {
  //       setVehicles(response.data.data);
  //     } else {
  //       setVehicles([]);
  //     }
  //   }
  //   ).catch((error) => {
  //     console.error(error);
  //     setVehicles([]);
  //   }
  //   );
  //   setIsLoading(false);

   };

  // Обновление статуса машины
  const handleStatusUpdate = (id: string, newStatus: boolean) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, allowed: newStatus } : v))
    );
  };

  // Повторный поиск после добавления машины
  const handleVehicleAdded = () => {
    if (searchPattern.length === 3) {
      handleSearch(searchPattern);
    }
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Проверка" />
      <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
        <div className="flex flex-col gap-4">
          <AddVehicleDialog onVehicleAdded={handleVehicleAdded} />
          <VehicleSearch onSearch={handleSearch} isLoading={isLoading} />
          <VehicleList
            vehicles={vehicles}
            isLoading={isLoading}
            onStatusUpdate={handleStatusUpdate}
          />
        </div>
      </div>
    </AppLayout>
  );
}
