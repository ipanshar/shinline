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
interface Truck {
    id: number;
    truck_own: any;
    vip_level?: number;
    truck_model_name?: string;
    plate_number?: string;
    truck_brand_name?: string;
    truck_categories_name?: string;
    color?: string;
    vin?: string;
    trailer_model_name?: string;
    trailer_type_name?: string;
    created_at: string | number | Date;
}

interface TruckCardProps {
    truck: Truck;
    onEdit?: (truck: Truck) => void;
}

// Основная карточка грузовика
const TruckCard: React.FC<TruckCardProps> = ({ truck, onEdit }) => {
    // Определяем цвет карточки в зависимости от VIP статуса
    const getCardClass = () => {
        if (truck.vip_level === 1) return 'border-l-4 border-amber-500 bg-amber-50/50';
        if (truck.vip_level === 2) return 'border-l-4 border-slate-500 bg-slate-50/50';
        if (truck.vip_level === 3) return 'border-l-4 border-green-500 bg-green-50/50';
        return '';
    };

    const getVipBadge = () => {
        if (truck.vip_level === 1) return <span className="ml-2 text-xs font-bold px-2 py-1 rounded-full bg-amber-500 text-white">⭐ VIP</span>;
        if (truck.vip_level === 2) return <span className="ml-2 text-xs font-bold px-2 py-1 rounded-full bg-slate-500 text-white">👤 Руководство</span>;
        if (truck.vip_level === 3) return <span className="ml-2 text-xs font-bold px-2 py-1 rounded-full bg-green-600 text-white">🚒 Зд обход</span>;
        return null;
    };

    return (
    <div className={`border rounded-lg p-5 bg-card shadow-sm hover:shadow-md transition-shadow ${getCardClass()}`}>
        <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-foreground">
                {truck.truck_model_name || "Без модели"}
            </h2>
            {getVipBadge()}
        </div>
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
};

TruckCard.propTypes = {
    truck: PropTypes.object.isRequired,
};

export default TruckCard;
