import React, { useEffect, useState } from "react";
import axios from "axios";
import { DataGrid, GridActionsCellItem, GridRowId, GridRowModesModel, GridRowModes, GridRowModel } from "@mui/x-data-grid";
import DeleteIcon from "@mui/icons-material/Delete";
import { Box, useMediaQuery, CircularProgress } from "@mui/material";
import KPPForm from '@/components/KPP/KPPForm ';
import Edit from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";

interface Kpp {
    id: number;
    name: string;
}

interface kkpProps {
    kpp: any[];
    loading: boolean;
}

const KppTable: React.FC<kkpProps> = () => {
    const [kpp, setKpp] = useState<Kpp[]>([]);
    const [yard_id, setYardId] = useState("");
    const [loading, setLoading] = useState(true);
    const isMobile = useMediaQuery("(max-width: 768px)");
    const [rowModesModel, setRowModesModel] = React.useState<GridRowModesModel>({});

    const fetchgates = (id: string) => {
        setLoading(true);
        axios.post("/entrance-permit/getcheckpoint", { yard_id: id })
            .then(response => {
                if (response.data.status) {
                    setKpp(response.data.data);
                }
            })
            .catch(error => console.error("Ошибка загрузки кпп:", error))
            .finally(() => setLoading(false));
    };


    useEffect(() => {
        fetchgates(yard_id);
}, []);


    const onChangeYard = (id: string) => {
        setYardId(id);
        fetchgates(id);
    };

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
        const updatedRow: Kpp = { id: newRow.id, name: newRow.name};
        setKpp(kpp.map((row) => (row.id === newRow.id ? updatedRow : row)));


        axios.post("/entrance-permit/updatecheckpoint", { yard_id: yard_id, id: updatedRow.id, name: updatedRow.name, code: updatedRow.code })
            .then(response => {
                if (!response.data.status) {
                    console.error("Ошибка сохранения:", response.data.message);
                } 
            })
            .catch(error => console.error("Ошибка сохранения:", error));
        return updatedRow;
    };

    const handleDeleteClick = (id: GridRowId) => () => {
        axios.post("/entrance-permit/deletecheckpoint", { id: id })
            .then(response => {
                if (response.data.status) {
                    setKpp(kpp.filter(gate => gate.id !== id));
                } else {
                    console.error("Ошибка удаления:", response.data.message);
                }
            })
            .catch(error => console.error("Ошибка удаления:", error));
    }
    const columns = [
        { field: "id", headerName: "Код", width: isMobile ? 50 : 80 },
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

            <KPPForm onChange={onChangeYard}/> 
            <Box sx={{ width: "100%", maxWidth: "1200px", margin: "auto", padding: "10px" }}>
                <h2 style={{ textAlign: "center" }}>КПП</h2>

                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", padding: 5 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box sx={{ height: 500, width: "100%" }}>
                        <DataGrid
                            rows={kpp}
                            columns={columns}
                            editMode="row"
                            rowModesModel={rowModesModel}
                            processRowUpdate={processRowUpdate}
                            getRowId={(row) => row.id}
                            pageSizeOptions={isMobile ? [5] : [5, 10, 20]}
                        />
                    </Box>
                )}
            </Box>
            
        </Box>
    );
};

export default KppTable;