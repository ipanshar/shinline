import React from "react";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

// Отдельный компонент для строки информации
interface InfoRowProps {
    label: string;
    value?: any;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
    <div className="text-sm">
        <span className="font-medium text-foreground">{label}:</span>{" "}
        <span className="text-muted-foreground">{value || "—"}</span>
    </div>
);

InfoRow.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.any,
};

// Типизация пропсов грузовика
export interface TruckCardTruck {
    id: number;
    name: string | undefined;
    user_id: number | undefined;
    truck_own: any;
    plate_number: string;
    truck_model_name: string | undefined;
    truck_brand_name: string | undefined;
    truck_categories_name: string | undefined;
    color: string | undefined;
    vin: string | undefined;
    truck_brand_id: number | undefined;
    truck_model_id: number | undefined;
    trailer_model_id: number | undefined;
    trailer_type_id: number | undefined;
    trailer_number: string | undefined;
    trailer_height: number | undefined;
    trailer_width: number | undefined;
    trailer_length: number | undefined;
    trailer_load_capacity: number | undefined;
    truck_category_id: number | undefined;
    updated_at: string;
    user_name: string | undefined;
    trailer_model_name: string | undefined;
    trailer_type_name: string | undefined;
    created_at: string | number | Date;
}

interface TruckCardProps {
    truck: TruckCardTruck;
    onEdit?: (truck: TruckCardTruck) => void;
}

// Основная карточка грузовика
const TruckCard: React.FC<TruckCardProps> = ({ truck, onEdit }) => (
    <div className="border rounded-lg p-5 bg-card shadow-sm hover:shadow-md transition-shadow">
        <h2 className="text-xl font-semibold mb-3 text-foreground">
            {truck.truck_model_name || "Без модели"}
        </h2>
        <div className="space-y-2 mb-4">
            <InfoRow label="Гос. номер" value={truck.plate_number} />
            <InfoRow label="Собственность" value={truck.truck_own || "Не указано"} />
            <InfoRow label="Марка" value={truck.truck_brand_name} />
            <InfoRow label="Категория" value={truck.truck_categories_name} />
            <InfoRow label="Цвет" value={truck.color} />
            <InfoRow label="VIN" value={truck.vin} />
            <InfoRow label="Прицеп" value={truck.trailer_model_name} />
            <InfoRow label="Тип прицепа" value={truck.trailer_type_name} />
        </div>
        <div className="text-xs text-muted-foreground mb-4">
            Добавлен: {new Date(truck.created_at).toLocaleDateString()}
        </div>
        <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => onEdit && onEdit(truck)}
        >
            <Pencil className="mr-2 h-4 w-4" />
            Редактировать
        </Button>
    </div>
);

TruckCard.propTypes = {
    truck: PropTypes.object.isRequired,
};

export default TruckCard;
