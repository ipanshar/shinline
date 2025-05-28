import React, { useEffect, useState } from "react";
import axios from "axios";
import { DataGrid, GridActionsCellItem, GridRowId, GridRowModesModel, GridRowModes, GridRowModel } from "@mui/x-data-grid";
import QrCodeIcon from '@mui/icons-material/QrCode';
import DeleteIcon from "@mui/icons-material/Delete";
import { Box, useMediaQuery, CircularProgress } from "@mui/material";
import WarehouseGateFormAdd from '@/components/warehouseGate/warehouseGateFormAdd';
import Edit from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import QRCode from "react-qr-code";

interface Gates {
    id: number;
    name: string;
    code: string;
}

interface WarehousesGateTableProps {
    gates: any[];
    loading: boolean;
}

const WarehousesTable: React.FC<WarehousesGateTableProps> = () => {
    const [gates, setGates] = useState<Gates[]>([]);
    const [gateCode, setGateCode] = useState<Gates | null>(null);
    const [warehouse_id, setWarehouseId] = useState("");
    const [loading, setLoading] = useState(true);
    const isMobile = useMediaQuery("(max-width: 768px)");
    const [rowModesModel, setRowModesModel] = React.useState<GridRowModesModel>({});

    const fetchgates = (id: string) => {
        setLoading(true);
        axios.post("/warehouse/getgates", { warehouse_id: id })
            .then(response => {
                if (response.data.status) {
                    setGates(response.data.data);
                }
            })
            .catch(error => console.error("Ошибка загрузки складов:", error))
            .finally(() => setLoading(false));
    };


    useEffect(() => {
        fetchgates(warehouse_id);
    }, []);

    const onChangeWarehouse = (id: string) => {
        setWarehouseId(id);
        fetchgates(id);
    };
    const handleQrClick = (id: GridRowId) => () => {
        setGateCode(gates.find(gate => gate.id === id) || null);
    }
    const handleEditClick = (id: GridRowId) => () => {
        setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.Edit } });
    }
    const handleCancelClick = (id: GridRowId) => () => {
        setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.View } });
    }

    const handleSaveClick = (id: GridRowId) => () => {
        setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.View } });
    }

    const processRowUpdate = (newRow: GridRowModel) => {
        const updatedRow: Gates = { id: newRow.id, name: newRow.name, code: newRow.code };
        setGates(gates.map((row) => (row.id === newRow.id ? updatedRow : row)));


        axios.post("/warehouse/updategate", { warehouse_id: warehouse_id, id: updatedRow.id, name: updatedRow.name, code: updatedRow.code })
            .then(response => {
                if (response.data.status) {
                    console.log("Ворота успешно обновлены:", response.data.data);
                } else {
                    console.error("Ошибка сохранения:", response.data.message);
                }
            })
            .catch(error => console.error("Ошибка сохранения:", error));
        return updatedRow;
    };

    const handleDeleteClick = (id: GridRowId) => () => {
        console.log("Удалить ворота с ID:", id);
        axios.post("/warehouse/deletegate", { id: id })
            .then(response => {
                if (response.data.status) {
                    setGates(gates.filter(gate => gate.id !== id));
                } else {
                    console.error("Ошибка удаления:", response.data.message);
                }
            })
            .catch(error => console.error("Ошибка удаления:", error));
    }
    const columns = [
        { field: "code", headerName: "Код", width: isMobile ? 50 : 80 },
        { field: "name", headerName: "Название", flex: 1, minWidth: 120, editable: true, },
        {
            field: 'actions', headerName: '', width: 120, headerAlign: 'center', type: 'actions', cellClassName: 'actions', getActions: ({ id }: { id: GridRowId }) => {
                const isInEditMode = rowModesModel[id]?.mode === GridRowModes.Edit;

                if (isInEditMode) {
                    return [
                        <GridActionsCellItem
                            icon={<SaveIcon />}
                            label="Save"
                            onClick={handleSaveClick(id)}
                        />,
                        <GridActionsCellItem
                            icon={<DeleteIcon />}
                            label="Delete"
                            onClick={handleDeleteClick(id)}
                            color="inherit"
                        />,
                        <GridActionsCellItem
                            icon={<CancelIcon />}
                            label="Cancel"
                            className="textPrimary"
                            onClick={handleCancelClick(id)}
                            color="inherit"
                        />,
                    ];
                }
                return [
                    <GridActionsCellItem
                        icon={<QrCodeIcon />}
                        label="qrCode"
                        className="textPrimary"
                        onClick={handleQrClick(id)}
                        color="inherit"
                    />,
                    <GridActionsCellItem
                        icon={<Edit />}
                        label="Edit"
                        className="textPrimary"
                        onClick={handleEditClick(id)}
                        color="inherit"
                    />,

                ];
            }
        }
    ];


    return (
        <Box>

            <WarehouseGateFormAdd onChange={onChangeWarehouse} />
            <Box sx={{ width: "100%", maxWidth: "1200px", margin: "auto", padding: "10px" }}>
                <h2 style={{ textAlign: "center" }}>Ворота склада</h2>

                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", padding: 5 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box sx={{ height: 500, width: "100%" }}>
                        <DataGrid
                            rows={gates}
                            columns={columns}
                            loading={loading}
                            editMode="row"
                            rowModesModel={rowModesModel}
                            processRowUpdate={processRowUpdate}
                            getRowId={(row) => row.id}
                            pageSizeOptions={isMobile ? [5] : [5, 10, 20]}
                        />
                    </Box>
                )}
            </Box>
            {gateCode && (
                <Box
                    sx={{
                        zIndex: 1000,
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        backgroundColor: 'white',
                        padding: 2,
                        boxShadow: 3,
                        borderRadius: 2,
                        transform: 'translate(-50%, -50%)',
                        width: '100%',
                        maxWidth: '250px',
                        height: '100%',
                        maxHeight: '400px',
                        textAlign: 'center',
                        overflowY: 'auto',
                        
                    }}
                >
                    <button
                        onClick={() => setGateCode(null)}
                        title="Закрыть"
                        style={{
                            position: 'absolute',
                            top: '5px',
                            right: '5px',
                            background: 'transparent',
                            border: 'none',
                            fontSize: '18px',
                            cursor: 'pointer',
                        }}
                    >
                        ×
                    </button>
                    <h3>{gateCode.name}</h3>
                    <QRCode
                        style={{
                            height: '100%',
                            maxHeight: '250px',
                            maxWidth: '100%',
                            width: '100%',
                            marginBottom: 10,
                        }}
                        value={gateCode.code}
                        size={128}
                        viewBox={`0 0 256 256`}
                    />
                    <h3>Код: {gateCode.code}</h3>
                </Box>
            )}
        </Box>
    );
};

export default WarehousesTable;