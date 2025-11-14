import React, { useEffect, useState } from "react";
import axios from "axios";
import { DataGrid, GridColDef, GridActionsCellItem } from "@mui/x-data-grid";
import { Box, useMediaQuery, CircularProgress, Button } from "@mui/material";
import { Edit, Delete, MessageCircle } from "lucide-react";
import CounterpartyForm from '@/components/counterparties/CounterpartyForm';
import ImportExcelModal from '@/components/counterparties/ImportExcelModal';
import { router } from '@inertiajs/react';

interface Counterparty {
    id: number;
    name: string;
    inn: string;
    address: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    supervisor: string | null;
    contact_person: string | null;
    carrier_type: boolean;
}

const CounterpartiesTable: React.FC = () => {
    const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCounterparty, setSelectedCounterparty] = useState<Counterparty | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const isMobile = useMediaQuery("(max-width: 768px)");

    const fetchCounterparties = () => {
        setLoading(true);
        axios.post("/counterparty/getcounterparties")
            .then(response => {
                if (response.data.status) {
                    setCounterparties(response.data.data);
                }
            })
            .catch(error => console.error("Ошибка загрузки контрагентов:", error))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchCounterparties();
    }, []);

    const handleCounterpartyAdded = () => {
        fetchCounterparties();
        setSelectedCounterparty(null);
    };

    const handleEdit = (counterparty: Counterparty) => {
        setSelectedCounterparty(counterparty);
    };

    const handleDelete = (id: number) => {
        if (!confirm('Вы уверены, что хотите удалить этого контрагента?')) {
            return;
        }

        axios.post("/counterparty/deletecounterparty", { id })
            .then(response => {
                if (response.data.status) {
                    fetchCounterparties();
                } else {
                    alert(response.data.message);
                }
            })
            .catch(error => {
                alert(error.response?.data?.message || "Ошибка при удалении контрагента");
            });
    };

    const handleChat = async (counterparty: Counterparty) => {
        if (!counterparty.whatsapp) {
            alert('У контрагента не указан номер WhatsApp');
            return;
        }

        try {
            // Получаем или создаем чат с контрагентом
            const response = await axios.post('/counterparty/chat/getorcreatechat', {
                counterparty_id: counterparty.id
            });

            if (response.data.status) {
                // Переходим на обычную страницу чата с выбранным чатом
                router.visit(`/chat?chat_id=${response.data.data.chat_id}`);
            } else {
                alert(response.data.message || 'Не удалось создать чат');
            }
        } catch (error: any) {
            console.error('Error in handleChat:', error);
            alert(error.response?.data?.message || 'Ошибка при открытии чата');
        }
    };

    const columns: GridColDef[] = [
        { field: "id", headerName: "ID", width: isMobile ? 50 : 80 },
        { field: "name", headerName: "Название", flex: 1, minWidth: 150 },
        { field: "inn", headerName: "ИНН", flex: 1, minWidth: 120 },
        { field: "address", headerName: "Адрес", flex: 1, minWidth: 200 },
        { field: "phone", headerName: "Телефон", flex: 1, minWidth: 120 },
        { field: "whatsapp", headerName: "WhatsApp", flex: 1, minWidth: 120 },
        { field: "email", headerName: "Email", flex: 1, minWidth: 150 },
        { field: "supervisor", headerName: "Руководитель", flex: 1, minWidth: 150 },
        { field: "contact_person", headerName: "Контактное лицо", flex: 1, minWidth: 150 },
        {
            field: "carrier_type",
            headerName: "Международный",
            width: 120,
            renderCell: (params) => (params.value ? "Да" : "Нет"),
        },
        {
            field: "actions",
            type: "actions",
            headerName: "Действия",
            width: 150,
            getActions: (params) => [
                <GridActionsCellItem
                    icon={<Edit size={18} />}
                    label="Редактировать"
                    onClick={() => handleEdit(params.row)}
                />,
                <GridActionsCellItem
                    icon={<MessageCircle size={18} />}
                    label="Чат"
                    onClick={() => handleChat(params.row)}
                />,
                <GridActionsCellItem
                    icon={<Delete size={18} />}
                    label="Удалить"
                    onClick={() => handleDelete(params.row.id)}
                    showInMenu
                />,
            ],
        },
    ];

    return (
        <Box>
            <CounterpartyForm
                onCounterpartyAdded={handleCounterpartyAdded}
                counterparty={selectedCounterparty}
                onCancel={() => setSelectedCounterparty(null)}
                onImportClick={() => setIsImportModalOpen(true)}
            />
            <Box sx={{ width: "100%", maxWidth: "1400px", margin: "auto", padding: "10px" }}>
                <h2 style={{ textAlign: "center" }}>Контрагенты</h2>

                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", padding: 5 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box sx={{ height: 600, width: "100%" }}>
                        <DataGrid
                            rows={counterparties}
                            columns={columns}
                            loading={loading}
                            getRowId={(row) => row.id}
                            pageSizeOptions={isMobile ? [10] : [10, 25, 50]}
                            initialState={{
                                pagination: {
                                    paginationModel: { pageSize: 25 },
                                },
                            }}
                        />
                    </Box>
                )}
            </Box>
            
            <ImportExcelModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImportComplete={() => {
                    setIsImportModalOpen(false);
                    fetchCounterparties();
                }}
            />
        </Box>
    );
};

export default CounterpartiesTable;
