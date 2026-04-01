import React, { useEffect, useState } from "react";
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import Edit from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import DeleteIcon from "@mui/icons-material/Delete";
import { Box, useMediaQuery, CircularProgress } from "@mui/material";
import { DataGrid, GridActionsCellItem, GridRowId, GridRowModesModel, GridRowModes, GridRowModel, GridColDef } from "@mui/x-data-grid";
import axios from "axios";



const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Камеры наблюдения',
        href: '/integration_dss/devices',
    },
];
interface Device{
    id: number;
    channelId: string;
    channelName: string;
    checkpoint_id: number;
    type: string;
    zone_id: number | null;
    barrier_channel_id: string | null;
}

interface Zone {
    id: number;
    name: string;
}

interface Checkpoint {
    id: number;
    name: string;
    yard_id: number;
    yard_name?: string;
}

export default function Integration_dss() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [zones, setZones] = useState<Zone[]>([]);
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const isMobile = useMediaQuery("(max-width: 768px)");
    const [rowModesModel, setRowModesModel] = React.useState<GridRowModesModel>({});
    const fetchZones = () => {
        axios.post("/zones/getzones")
            .then(response => {
                if (response.data.status) {
                    setZones(response.data.data);
                }
            })
            .catch(error => console.error("Ошибка загрузки зон:", error));
    };

    const fetchCheckpoints = () => {
        axios.post("/entrance-permit/getallcheckpoints")
            .then(response => {
                if (response.data.status) {
                    setCheckpoints(response.data.data);
                }
            })
            .catch(error => console.error("Ошибка загрузки КПП:", error));
    };

    const fetchDevices = () => {
        setLoading(true);
        axios.post("/dss/dssdevices")
            .then(response => {
                if (response.data.status) {
                    setDevices(response.data.data);
                }
            })
            .catch(error => console.error("Ошибка загрузки устройств:", error))
            .finally(() => setLoading(false));
    };
    useEffect(() => {
        fetchZones();
        fetchCheckpoints();
        fetchDevices();
    }, []);

    // Обработчики событий
    const handleCancelClick = (id: GridRowId) => () => {
        setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.View } });
    };
    const handleEditClick = (id: GridRowId) => () => {
        setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.Edit } });
    };
    const handleSaveClick = (id: GridRowId) => () => {
            setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.View } });
        };
    // Обработчики событий

    const processRowUpdate = async (newRow: GridRowModel): Promise<Device> => {
        try {
            if (!newRow || typeof newRow.id === 'undefined') {
                throw new Error('Invalid row data');
            }

            const updatedRow: Device = {
                id: newRow.id,
                channelId: newRow.channelId || '',
                channelName: newRow.channelName || '',
                checkpoint_id: newRow.checkpoint_id || 0,
                type: newRow.type || '',
                zone_id: newRow.zone_id === '' || newRow.zone_id === null || newRow.zone_id === undefined ? null : parseInt(newRow.zone_id.toString(), 10),
                barrier_channel_id: newRow.barrier_channel_id === '' || newRow.barrier_channel_id === null || newRow.barrier_channel_id === undefined ? null : newRow.barrier_channel_id.toString(),
            };

            const response = await axios.post('/dss/dssdevices/update', updatedRow);
            
            if (response.data.status) {
                // Перезагружаем все устройства с сервера чтобы получить актуальные данные
                await fetchDevices();
                return updatedRow;
            } else {
                throw new Error(response.data.message || 'Failed to update device');
            }
        } catch (error) {
            console.error('Error updating device:', error);
            throw error;
        }
    };

     const handleProcessRowUpdateError = (error: any) => {
    console.error('Ошибка при обновлении строки:', error);
  };
       
    const columns: GridColDef<Device>[] = [
        { field: "id", headerName: "ИД", width: isMobile ? 50 : 80 },
        { field: "channelId", headerName: "channelId", flex: 1, minWidth: 120 },
        { field: "channelName", headerName: "channelName", flex: 1, minWidth: 120, editable: true },
        {
            field: "barrier_channel_id",
            headerName: "channelId шлагбаума",
            flex: 1,
            minWidth: 180,
            editable: true,
            renderCell: (params: any) => params.value || 'Не задано'
        },
        { 
            field: "checkpoint_id", 
            headerName: "КПП", 
            flex: 1, 
            minWidth: 150, 
            editable: true,
            type: 'singleSelect' as const,
            valueOptions: [
                { value: 0, label: 'Не выбрано' },
                ...checkpoints.map(checkpoint => ({ 
                    value: checkpoint.id, 
                    label: checkpoint.name
                }))
            ],
            renderCell: (params: any) => {
                if (!params.value || params.value === 0) return 'Не выбрано';
                const checkpoint = checkpoints.find(c => c.id === params.value);
                return checkpoint ? checkpoint.name : `КПП ID: ${params.value}`;
            }
        },
        { 
            field: "type", 
            headerName: "Тип", 
            flex: 1, 
            minWidth: 120, 
            editable: true,
            type: 'singleSelect' as const,
            valueOptions: ['Entry', 'Exit']
        },
        { 
            field: "zone_id", 
            headerName: "Зона", 
            flex: 1, 
            minWidth: 150, 
            editable: true,
            type: 'singleSelect' as const,
            valueOptions: [
                { value: '', label: 'Не выбрано' },
                ...zones.map(zone => ({ 
                    value: zone.id, 
                    label: zone.name
                }))
            ],
            renderCell: (params: any) => {
                if (!params.value) return 'Не выбрано';
                const zone = zones.find(z => z.id === params.value);
                return zone ? zone.name : `Зона ID: ${params.value}`;
            }
        },
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
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Камеры наблюдения" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min p-4">
                    <Box sx={{ width: "100%", maxWidth: "1200px", margin: "auto", padding: "10px" }}>
                        {loading ? (
                             <Box sx={{ display: "flex", justifyContent: "center", padding: 5 }}>
                                <CircularProgress />
                            </Box>
                        ) : (
                            <DataGrid
                                rows={devices}
                                columns={columns}
                                rowModesModel={rowModesModel}
                                onRowModesModelChange={(newModel) => setRowModesModel(newModel)}
                                processRowUpdate={processRowUpdate}
                                onProcessRowUpdateError={handleProcessRowUpdateError}
                                editMode="row"
                                getRowId={(row) => row.id}
                            />
                        )}
                    </Box>
                </div>
            </div>
        </AppLayout>
    );
}
