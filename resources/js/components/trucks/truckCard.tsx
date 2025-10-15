import React from "react";
import PropTypes from "prop-types";
import { Button } from "@mui/material";

// Отдельный компонент для строки информации
interface InfoRowProps {
    label: string;
    value?: any;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
    <div style={{ marginBottom: 8 }}>
        <strong>{label}:</strong> {value || "—"}
    </div>
);

InfoRow.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.any,
};

// Типизация пропсов грузовика
interface Truck {
    truck_own: any;
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

// Основная карточка грузовика
const TruckCard: React.FC<{ truck: Truck }> = ({ truck }) => (
    <div style={{
        border: "1px solid #e0e0e0",
        borderRadius: "10px",
        padding: "20px",
        margin: "16px 0",
        background: "#fafbfc",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        maxWidth: 400
    }}>
        <h2 style={{ margin: "0 0 12px 0", color: "#2d3a4b" }}>
            {truck.truck_model_name || "Без модели"}
        </h2>
        <InfoRow label="Гос. номер" value={truck.plate_number} />
        <InfoRow label="Владелец" value={truck.truck_own ? "Собственный" : "Чужой"} />
        <InfoRow label="Марка" value={truck.truck_brand_name} />
        <InfoRow label="Категория" value={truck.truck_categories_name} />
        <InfoRow label="Цвет" value={truck.color} />
        <InfoRow label="VIN" value={truck.vin} />
        <InfoRow label="Прицеп" value={truck.trailer_model_name} />
        <InfoRow label="Тип прицепа" value={truck.trailer_type_name} />
        <div style={{ fontSize: 12, color: "#888" }}>
            Добавлен: {new Date(truck.created_at).toLocaleDateString()}
        </div>
        <Button variant="contained" color="primary">Редактировать</Button>
        <Button variant="contained" color="secondary" style={{ marginLeft: 8 }}>Удалить</Button>
    </div>
);

TruckCard.propTypes = {
    truck: PropTypes.object.isRequired,
};

export default TruckCard;
