import React, { useEffect, useState } from "react";
import AppLayout from '@/layouts/app-layout';
import DSSLayout from '@/layouts/dss-layout';
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
        title: 'Устройства DSS',
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
}

interface Zone {
    id: number;
    name: string;
}

export default function Integration_dss() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [zones, setZones] = useState<Zone[]>([]);
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
            };

            const response = await axios.post('/dss/dssdevices/update', updatedRow);
            
            if (response.data.status) {
                setDevices(devices.map(device => device.id === updatedRow.id ? updatedRow : device));
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
        { field: "checkpoint_id", headerName: "Checkpoint ID", flex: 1, minWidth: 120, editable: true },
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
                    value: zone.id ? zone.id.toString() : '', 
                    label: zone.name || 'Без названия'
                }))
            ],
            valueGetter: (params: any) => {
                try {
                    if (!params) return '';
                    if (params.value === null || params.value === undefined) return '';
                    if (typeof params.value === 'number') return params.value.toString();
                    return params.value;
                } catch (error) {
                    console.error('Error in valueGetter:', error);
                    return '';
                }
            },
            valueFormatter: (params: any) => {
                try {
                    if (!params) return 'Не выбрано';
                    if (!params.value || params.value === '') return 'Не выбрано';
                    
                    const zoneId = typeof params.value === 'string' 
                        ? parseInt(params.value, 10) 
                        : params.value;
                    
                    if (isNaN(zoneId)) return 'Не выбрано';
                    
                    const zone = zones.find(z => z.id === zoneId);
                    return zone?.name || 'Не выбрано';
                } catch (error) {
                    console.error('Error in valueFormatter:', error);
                    return 'Не выбрано';
                }
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
            <Head title="Устройства DSS" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min p-4">
                    <DSSLayout>
                        {/* <DSSConnectionSettings /> */}
                        <h2 className="text-xl font-semibold mb-4">Управление устройствами DSS</h2>
                        <Box sx={{ width: "100%", maxWidth: "1200px", margin: "auto", padding: "10px" }}>
                             <h2 style={{ textAlign: "center" }}>Управление устройствами DSS</h2>
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
                    </DSSLayout>
                </div>
            </div>
        </AppLayout>
    );
}
