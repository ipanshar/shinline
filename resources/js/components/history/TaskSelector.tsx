import { useState, useEffect } from 'react';
import axios from 'axios';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Truck {
    id: number;
    plate_number: string;
    truck_brand_name?: string;
    truck_model_name?: string;
    name?: string;
}

interface TruckSelectorProps {
    onTruckSelect: (truckId: number | null) => void;
}

export default function TruckSelector({ onTruckSelect }: TruckSelectorProps) {
    const [trucks, setTrucks] = useState<Truck[]>([]);
    const [filteredTrucks, setFilteredTrucks] = useState<Truck[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedTruckId, setSelectedTruckId] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');

    useEffect(() => {
        fetchTrucks();
    }, []);

    useEffect(() => {
        if (searchQuery.trim() === '') {
            setFilteredTrucks(trucks);
        } else {
            const query = searchQuery.toLowerCase();
            const filtered = trucks.filter(truck => 
                truck.plate_number.toLowerCase().includes(query) ||
                truck.truck_brand_name?.toLowerCase().includes(query) ||
                truck.truck_model_name?.toLowerCase().includes(query)
            );
            setFilteredTrucks(filtered);
        }
    }, [searchQuery, trucks]);

    const fetchTrucks = async () => {
        setLoading(true);
        try {
            const response = await axios.post('/trucs/gettrucks', {
                limit: 200 // Загружаем только 200 последних грузовиков
            });
            if (response.data.status) {
                setTrucks(response.data.data);
            }
        } catch (error) {
            console.error('Ошибка загрузки грузовиков:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleValueChange = (value: string) => {
        setSelectedTruckId(value);
        if (value === 'all') {
            onTruckSelect(null);
        } else {
            onTruckSelect(parseInt(value));
        }
    };

    return (
        <div className="w-full space-y-3">
            <div>
                <label className="block text-sm font-medium mb-2">
                    🚛 Выберите грузовик
                </label>
                <input
                    type="text"
                    placeholder="🔍 Поиск по номеру, марке или модели..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full mb-2 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Select value={selectedTruckId} onValueChange={handleValueChange}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder={loading ? "Загрузка..." : "Выберите грузовик"} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Все грузовики</SelectItem>
                        {filteredTrucks.map((truck) => (
                            <SelectItem key={truck.id} value={truck.id.toString()}>
                                {truck.plate_number} {truck.truck_brand_name && `- ${truck.truck_brand_name}`} {truck.truck_model_name && truck.truck_model_name}
                            </SelectItem>
                        ))}
                        {filteredTrucks.length === 0 && searchQuery && (
                            <div className="p-2 text-sm text-muted-foreground text-center">
                                Грузовики не найдены
                            </div>
                        )}
                    </SelectContent>
                </Select>
                {searchQuery && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Найдено: {filteredTrucks.length} из {trucks.length}
                    </p>
                )}
            </div>
        </div>
    );
}
