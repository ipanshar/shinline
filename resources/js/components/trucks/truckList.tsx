import React, { useEffect, useState } from "react";
import axios from "axios";
import TruckCard from "@/components/trucks/truckCard";
import Pagination from "@/components/pagination"
import AddTruckModal from "./AddTruckModal";
import EditTruckModal from "./EditTruckModal";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface Truck {
    id: number;
    name: string | undefined;
    user_id: number | undefined;
    plate_number: string;
    vin: string | undefined;
    truck_brand_id: number | undefined;
    truck_model_id: number | undefined;
    color: string | undefined;
    trailer_model_id: number | undefined;
    trailer_type_id: number | undefined;
    trailer_number: string | undefined;
    trailer_height: number | undefined;
    trailer_width: number | undefined;
    trailer_length: number | undefined;
    trailer_load_capacity: number | undefined;
    truck_category_id: number | undefined;
    created_at: string;
    updated_at: string;
    user_name: string | undefined;
    truck_brand_name: string | undefined;
    truck_model_name: string | undefined;
    truck_categories_name: string | undefined;
    trailer_type_name: string | undefined;
    trailer_model_name: string | undefined;
    truck_own: any;
}

const TruckList: React.FC = () => {
    const [trucks, setTrucks] = useState<Truck[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [lastPage, setLastPage] = useState<number>(1);
    const [plate_number, setPlate_number] = useState<string>('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
    const fetchTrucksData = async () => {
        setLoading(true); // Начинаем загрузку
        try {
            const response = await axios.post("/trucs/gettrucks", { 
                page: currentPage, 
                plate_number: plate_number 
            });
            
            if (response.data && response.data.status && Array.isArray(response.data.data)) {
                setTrucks(response.data.data); 
                if (typeof response.data.last_page === "number") {
                    setLastPage(response.data.last_page); 
                }
            }
        } catch (error) {
           console.error("Error fetching trucks:", error);
        } finally {
            setLoading(false); // Завершаем загрузку
        }
    };

    useEffect(() => {
        fetchTrucksData();
    }, [currentPage]);

       

    const setPage = (page: number) => {
        setCurrentPage(page);
    };

    const handleEdit = (truck: Truck) => {
        setSelectedTruck(truck);
        setIsEditModalOpen(true);
    };

    const handleTruckUpdated = () => {
        setIsEditModalOpen(false);
        setSelectedTruck(null);
        fetchTrucksData();
    };

    if (loading) return <div className="flex items-center justify-center p-8 text-muted-foreground">Загрузка...</div>;

    return (
        <div>
            <div className="mb-6">
                <input
                    type="text"
                    value={plate_number}
                    onChange={(e) => setPlate_number(e.target.value)}
                    placeholder="Поиск по номеру..."
                    className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            fetchTrucksData();
                        }
                    }}
                />
            </div>
            {trucks.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">Грузовики не найдены.</div>
            ) : null}
             <div className="grid auto-rows-min gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div className="col-span-full flex justify-end mb-4">
            <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Добавить грузовик
            </Button>
            <AddTruckModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onTruckAdded={() => {
                    setIsModalOpen(false);
                    fetchTrucksData();
                }} 
            />
            </div>
            {trucks.map((truck) => (
                <TruckCard key={truck.id} truck={truck} onEdit={handleEdit} />
            ))}
            {selectedTruck && (
                <EditTruckModal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setSelectedTruck(null);
                    }}
                    onTruckUpdated={handleTruckUpdated}
                    truck={selectedTruck}
                />
            )}
            <div className="col-span-full flex justify-center mt-4">
           <Pagination currentPage={currentPage} lastPage={lastPage} setPage={setPage}/>
            </div>
            </div>
        </div>
    );
};

export default TruckList;