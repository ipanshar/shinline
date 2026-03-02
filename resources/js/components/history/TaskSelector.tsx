import { useState, useEffect } from 'react';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, X } from 'lucide-react';

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
    const [loading, setLoading] = useState(false);
    const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isOpen, setIsOpen] = useState(false);

    // Debounce поиск - ищем на сервере только после 2+ символов
    useEffect(() => {
        if (searchQuery.length < 2) {
            setTrucks([]);
            setIsOpen(false);
            return;
        }

        const timeoutId = setTimeout(() => {
            searchTrucks(searchQuery);
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const searchTrucks = async (query: string) => {
        setLoading(true);
        try {
            const response = await axios.post('/trucs/gettrucks', {
                plate_number: query,
                limit: 50
            });
            if (response.data.status) {
                setTrucks(response.data.data);
                setIsOpen(true);
            } else {
                setTrucks([]);
            }
        } catch (error) {
            console.error('Ошибка загрузки грузовиков:', error);
            setTrucks([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (truck: Truck) => {
        setSelectedTruck(truck);
        setSearchQuery('');
        setIsOpen(false);
        setTrucks([]);
        onTruckSelect(truck.id);
    };

    const handleClear = () => {
        setSelectedTruck(null);
        setSearchQuery('');
        setTrucks([]);
        onTruckSelect(null);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        if (selectedTruck) {
            setSelectedTruck(null);
            onTruckSelect(null);
        }
    };

    // Закрытие dropdown при клике вне
    useEffect(() => {
        const handleClickOutside = () => setIsOpen(false);
        if (isOpen) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [isOpen]);

    return (
        <div className="w-full space-y-2">
            <label className="block text-sm font-medium">
                🚛 Поиск транспортного средства по номеру
            </label>
            
            <div className="relative" onClick={(e) => e.stopPropagation()}>
                <div className="relative flex items-center">
                    <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Введите гос. номер (минимум 2 символа)..."
                        value={selectedTruck ? selectedTruck.plate_number : searchQuery}
                        onChange={handleInputChange}
                        onFocus={() => searchQuery.length >= 2 && setIsOpen(true)}
                        className={`pl-9 pr-10 ${selectedTruck ? 'bg-primary/10 font-medium' : ''}`}
                    />
                    {loading && (
                        <Loader2 className="absolute right-10 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {selectedTruck && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 h-7 w-7 p-0"
                            onClick={handleClear}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {/* Dropdown с результатами */}
                {isOpen && trucks.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-auto">
                        {trucks.map((truck) => (
                            <button
                                key={truck.id}
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none"
                                onClick={() => handleSelect(truck)}
                            >
                                <span className="font-medium">{truck.plate_number}</span>
                                {truck.truck_brand_name && (
                                    <span className="text-muted-foreground ml-2">
                                        {truck.truck_brand_name} {truck.truck_model_name}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Сообщение "не найдено" */}
                {isOpen && searchQuery.length >= 2 && trucks.length === 0 && !loading && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg p-3 text-sm text-muted-foreground text-center">
                        Транспортное средство не найдено
                    </div>
                )}
            </div>

            {/* Подсказка */}
            {!selectedTruck && searchQuery.length < 2 && (
                <p className="text-xs text-muted-foreground">
                    Начните вводить гос. номер для поиска
                </p>
            )}

            {/* Выбранный грузовик */}
            {selectedTruck && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border">
                    <span className="text-sm">✅ Выбран:</span>
                    <span className="font-medium">{selectedTruck.plate_number}</span>
                    {selectedTruck.truck_brand_name && (
                        <span className="text-sm text-muted-foreground">
                            ({selectedTruck.truck_brand_name} {selectedTruck.truck_model_name})
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
