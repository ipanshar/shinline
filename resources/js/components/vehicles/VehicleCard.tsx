
import { useState } from "react";
import { Vehicle, updateVehicleStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VehicleCardProps {
  vehicle: Vehicle;
  onStatusUpdate: (id: string, newStatus: boolean) => void;
}

const VehicleCard = ({ vehicle, onStatusUpdate }: VehicleCardProps) => {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusChange = async () => {
    try {
      setIsUpdating(true);
      // Call API to update status
      const updatedVehicle = await updateVehicleStatus(vehicle.id, !vehicle.allowed);
      // Update local state via parent callback
      onStatusUpdate(vehicle.id, updatedVehicle.allowed);
    } catch (error) {
      console.error("Failed to update vehicle status:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Status text and style
  const statusText = vehicle.allowed ? "Разрешен" : "Запрещен";
  const statusClass = vehicle.allowed ? "bg-gray-100" : "bg-gray-100 border-l-4 border-destructive";

  return (
    <div className={cn("p-4 rounded shadow-sm border mb-3", statusClass)}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-lg">{vehicle.plate_number}</h3>
          {vehicle.truck_model_name && <p className="text-muted-foreground">{vehicle.truck_model_name}</p>}
          <p className={vehicle.allowed ? "text-primary" : "text-destructive font-medium"}>
            {statusText}
          </p>
        </div>
        <Button
          onClick={handleStatusChange}
          disabled={isUpdating}
          variant={vehicle.allowed ? "outline" : "destructive"}
          className="min-h-[44px] min-w-[120px]"
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : vehicle.allowed ? (
            "Запретить"
          ) : (
            "Пропустить"
          )}
        </Button>
      </div>
    </div>
  );
};

export default VehicleCard;
