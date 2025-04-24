
import { Vehicle } from "@/lib/api";
import VehicleCard from "./VehicleCard";
import { useIsMobile } from "@/hooks/use-mobile";

interface VehicleListProps {
  vehicles: Vehicle[];
  isLoading: boolean;
  onStatusUpdate: (id: string, newStatus: boolean) => void;
}

const VehicleList = ({ vehicles, isLoading, onStatusUpdate }: VehicleListProps) => {
  const isMobile = useIsMobile();

  if (isLoading) {
    return <p className="text-center py-4">Загрузка данных...</p>;
  }

  if (vehicles.length === 0) {
    return <p className="text-center py-4">Машины не найдены</p>;
  }

  // Card view for mobile
  if (isMobile) {
    return (
      <div className="space-y-4">
        {vehicles.map((vehicle) => (
          <VehicleCard 
            key={vehicle.id} 
            vehicle={vehicle} 
            onStatusUpdate={onStatusUpdate} 
          />
        ))}
      </div>
    );
  }

  // Table view for tablet and desktop
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-secondary">
            <th className="text-left p-3 border-b">Номер</th>
            <th className="text-left p-3 border-b">Модель</th>
            <th className="text-left p-3 border-b">Статус</th>
            <th className="text-right p-3 border-b">Действие</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((vehicle) => (
            <tr key={vehicle.id} className={vehicle.allowed ? "" : "border-l-4 border-destructive"}>
              <td className="p-3 border-b font-medium">{vehicle.plate_number}</td>
              <td className="p-3 border-b text-muted-foreground">{vehicle.truck_model_name || "—"}</td>
              <td className={`p-3 border-b ${vehicle.allowed ? "text-primary" : "text-destructive font-medium"}`}>
                {vehicle.allowed ? "Выехал" : "Запустить"}
              </td>
              <td className="p-3 border-b text-right">
                <button
                  onClick={() => onStatusUpdate(vehicle.id, !vehicle.allowed)}
                  className={`px-4 py-2 rounded min-h-[44px] min-w-[120px] transition-colors ${
                    vehicle.allowed
                      ? "border border-input bg-background hover:bg-accent"
                      : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  }`}
                >
                  {vehicle.allowed ? "Запустить" : "Выехал"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default VehicleList;
