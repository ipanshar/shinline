import React from "react";
import { Card, CardContent, Typography, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { LocalShipping, Info, AccountCircle } from "@mui/icons-material";

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

// Функция для форматирования даты под локальный формат
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

const TaskCard: React.FC<{ task: Task }> = ({ task }) => (
    <Card sx={{ maxWidth: 600, margin: "10px", boxShadow: 3, borderRadius: 2 }}>
        <CardContent>
            <Typography variant="h6" gutterBottom color="primary" >
                📌 {task.id} | 🚚 Рейс: {task.name} | {task.status_name}
            </Typography>
            
            <Typography variant="subtitle2" color="textSecondary">
                📅 План: {formatDate(task.plan_date)} | ⏳ Прибытие: {formatDate(task.begin_date)} | 🚀 Убытие: {formatDate(task.end_date)}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>{task.description}</Typography>
            
            <Typography variant="body2" sx={{ mt: 1 }}>
                🏠 {task.yard_name}
            </Typography>
            
            <Typography variant="body2" color="secondary">
                📞 Координатор: {task.avtor} {task.phone && ` | Тел: ${task.phone}`}
            </Typography>
            
            <Typography variant="body2">
                <LocalShipping color="action" /> Компания: {task.company || "Не указано"} | Номер ТС: <b>{task.truck_plate_number}</b>
                {task.trailer_plate_number && ` | Номер прицепа: ${task.trailer_plate_number}`}
                {task.truck_model && ` | Модель: ${task.truck_model}`}
                {task.truck_category_name && ` | Категория: ${task.truck_category_name}`}
                {task.trailer_type_name && ` | Тип прицепа: ${task.trailer_type_name}`}
                {task.color && ` | Цвет: ${task.color}`}
            </Typography>
            
            <Typography variant="body2">
                <AccountCircle color="primary" /> Водитель: {task.user_name} | Login: {task.user_login} | Тел: {task.user_phone}
            </Typography>
            
            <Table size="small" sx={{ mt: 2 }}>
                <TableHead>
                    <TableRow>
                        <TableCell align="center" colSpan={3}>
                            <Typography variant="subtitle2"><b>Задачи</b></Typography>
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {task.task_weighings.map((weighing, idx) => (
                        <TableRow key={idx} sx={{ backgroundColor: "#e0f2f1" }}>
                            <TableCell><Info color="success" /> {weighing.statuse_weighing_name}</TableCell>
                            <TableCell>Вес: <b>{weighing.weight}</b></TableCell>
                            <TableCell>{weighing.weight ? formatDate(weighing.updated_at) : "—"}</TableCell>
                        </TableRow>
                    ))}
                    {task.task_loadings.map((loading, idx) => (
                        <TableRow key={idx} sx={{ backgroundColor: "#fff3e0" }}>
                            <TableCell>{loading.warehouse_name}</TableCell>
                            <TableCell>План: <b>{loading.warehouse_gate_plan_name}</b></TableCell>
                            <TableCell>Факт: <b>{loading.warehouse_gate_fact_name}</b></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
);

export default TaskCard;