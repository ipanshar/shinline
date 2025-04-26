import React, { useEffect, useState } from "react";
import axios from "axios";
import TruckCard from "@/components/trucks/truckCard";
import Pagination from "@/components/pagination"

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
}

const TruckList: React.FC = () => {
    const [trucks, setTrucks] = useState<Truck[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [lastPage, setLastPage] = useState<number>(1);

    useEffect(() => {
        setLoading(true);
        axios
            .post("/trucs/gettrucks", { page: currentPage })
            .then((response) => {
                if (response.data && response.data.status && Array.isArray(response.data.data)) {
                    setTrucks(response.data.data);
                    if (typeof response.data.last_page === "number") {
                        setLastPage(response.data.last_page);
                    }
                }
            })
            .catch((error) => {
            })
            .finally(() => setLoading(false));
    }, [currentPage]);

    const setPage = (page: number) => {
        setCurrentPage(page);
    };

    if (loading) return <div>Загрузка...</div>;

    return (
        <div>
             <div className="grid auto-rows-min gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {trucks.map((truck) => (
                <TruckCard key={truck.id} truck={truck} />
            ))}
            <div className="col-span-full flex justify-center mt-4">
           <Pagination currentPage={currentPage} lastPage={lastPage} setPage={setPage}/>
            </div>
            </div>
        </div>
    );
};

export default TruckList;