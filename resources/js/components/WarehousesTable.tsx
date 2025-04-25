import React, { useEffect, useState } from "react";
import axios from "axios";
import { DataGrid } from "@mui/x-data-grid";
import { Box, useMediaQuery, CircularProgress } from "@mui/material";
import WarehouseForm from '@/components/WarehouseForm ';

interface Warehouse {
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
    yard_name: string;
}

interface WarehousesTableProps {
    warehouses: any[];
    loading: boolean;
}

const WarehousesTable: React.FC<WarehousesTableProps> = () => {
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [loading, setLoading] = useState(true);
    const isMobile = useMediaQuery("(max-width: 768px)");

    const fetchWarehouses = () => {
        setLoading(true);
        axios.post("/warehouse/getwarehouses")
            .then(response => {
                if (response.data.status) {
                    setWarehouses(response.data.data);
                }
            })
            .catch(error => console.error("Ошибка загрузки складов:", error))
            .finally(() => setLoading(false));
    };


    useEffect(() => {
        fetchWarehouses();
    }, []);

    const handleWarehouseAdded = () => {
        fetchWarehouses();
    };
    const columns = [
        { field: "id", headerName: "ID", width: isMobile ? 50 : 80 },
        { field: "name", headerName: "Название", flex: 1, minWidth: 150 },
        { field: "address", headerName: "Адрес", flex: 1, minWidth: 200 },
        { field: "phone", headerName: "Телефон", flex: 1, minWidth: 150 },
        { field: "yard_name", headerName: "Зона", flex: 2, minWidth: 250 },
    ];


    return (
        <Box>

            <WarehouseForm onWarehouseAdded={handleWarehouseAdded} />
            <Box sx={{ width: "100%", maxWidth: "1200px", margin: "auto", padding: "10px" }}>
                <h2 style={{ textAlign: "center" }}>Склады</h2>

                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", padding: 5 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box sx={{ height: 500, width: "100%" }}>
                        <DataGrid
                            rows={warehouses}
                            columns={columns}
                            loading={loading}
                            getRowId={(row) => row.id}
                            pageSizeOptions={isMobile ? [5] : [5, 10, 20]}
                        />
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default WarehousesTable;