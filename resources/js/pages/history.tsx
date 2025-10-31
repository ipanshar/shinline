import { useState } from 'react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import TaskSelector from '@/components/history/TaskSelector';
import TruckLocationMap from '@/components/history/TruckLocationMap';
import MovementTimeline from '@/components/history/MovementTimeline';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'История',
        href: '/history',
    },
];

export default function History() {
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
    const [truckId, setTruckId] = useState<number | null>(null);

    const handleTaskSelect = async (taskId: number | null) => {
        setSelectedTaskId(taskId);
        
        if (taskId) {
            // Получаем информацию о задаче чтобы узнать truck_id
            try {
                const response = await fetch('/task/gettasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                const data = await response.json();
                
                if (data.status) {
                    const task = data.data.find((t: any) => t.id === taskId);
                    if (task && task.truck_id) {
                        setTruckId(task.truck_id);
                    } else {
                        setTruckId(null);
                    }
                }
            } catch (error) {
                console.error('Ошибка получения задачи:', error);
                setTruckId(null);
            }
        } else {
            setTruckId(null);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="История" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                {/* Селектор задачи */}
                <div className="bg-card border rounded-lg p-4">
                    <TaskSelector onTaskSelect={handleTaskSelect} />
                </div>

                {/* Основной контент */}
                <div className="grid gap-4 md:grid-cols-2 flex-1">
                    {/* Карта с местоположением */}
                    <div className="border rounded-lg overflow-hidden min-h-[400px]">
                        <TruckLocationMap truckId={truckId} />
                    </div>
                    
                    {/* История передвижений */}
                    <div className="border rounded-lg overflow-hidden min-h-[400px]">
                        <MovementTimeline truckId={truckId} />
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
