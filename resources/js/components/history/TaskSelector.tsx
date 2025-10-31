import { useState, useEffect } from 'react';
import axios from 'axios';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Task {
    id: number;
    name: string;
    plate_number?: string;
    truck_id?: number;
    status_name?: string;
}

interface TaskSelectorProps {
    onTaskSelect: (taskId: number | null) => void;
}

export default function TaskSelector({ onTaskSelect }: TaskSelectorProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTaskId, setSelectedTaskId] = useState<string>('');

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        try {
            const response = await axios.post('/task/gettasks');
            if (response.data.status) {
                setTasks(response.data.data);
            }
        } catch (error) {
            console.error('Ошибка загрузки задач:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleValueChange = (value: string) => {
        setSelectedTaskId(value);
        onTaskSelect(value ? parseInt(value) : null);
    };

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium">Выберите задачу</label>
            <Select value={selectedTaskId} onValueChange={handleValueChange} disabled={loading}>
                <SelectTrigger className="w-full">
                    <SelectValue placeholder={loading ? "Загрузка..." : "Выберите задачу"} />
                </SelectTrigger>
                <SelectContent>
                    {tasks.map((task) => (
                        <SelectItem key={task.id} value={task.id.toString()}>
                            <div className="flex flex-col">
                                <span className="font-medium">{task.name}</span>
                                {task.plate_number && (
                                    <span className="text-xs text-muted-foreground">
                                        {task.plate_number} • {task.status_name || 'Без статуса'}
                                    </span>
                                )}
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
