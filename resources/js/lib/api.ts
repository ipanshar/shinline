import { toast } from "sonner";


export interface Vehicle {
  id: string;
  plate_number: string;
  truck_model_name?: string;
  allowed: boolean;
}

const API_BASE_URL = '/api';

const handleApiError = (error: any) => {
  console.error('API Error:', error);
  toast.error('Произошла ошибка при запросе к серверу');
  throw error;
};

let vehicleDatabase: { [key: string]: Vehicle[] } = {
  '439': [
    { id: '1', plate_number: '439AWP02', truck_model_name: 'Toyota Camry', allowed: true },
    { id: '2', plate_number: '439QWE02', truck_model_name: 'Honda Civic', allowed: true },
    { id: '3', plate_number: '439ASD02', truck_model_name: 'Mazda 6', allowed: false }
  ],
  '123': [
    { id: '4', plate_number: '123ASD02', truck_model_name: 'Ford Focus', allowed: true },
    { id: '5', plate_number: '123XYZ02', truck_model_name: 'BMW 3 Series', allowed: false }
  ],
  '159': [
    { id: '6', plate_number: '159ZXC05', truck_model_name: 'Mercedes-Benz', allowed: true }
  ]
};

export const searchVehicles = async (pattern: string): Promise<Vehicle[]> => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    return vehicleDatabase[pattern] || [];
  } catch (error) {
    return handleApiError(error);
  }
};

export const addVehicle = async (vehicle: Omit<Vehicle, 'id'>): Promise<Vehicle> => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const id = Math.random().toString(36).substr(2, 9);
    const newVehicle = { ...vehicle, id };
    
    const pattern = vehicle.plate_number.match(/\d{3}/)?.[0];
    
    if (!pattern) {
      throw new Error('Invalid license plate format');
    }
    
    if (!vehicleDatabase[pattern]) {
      vehicleDatabase[pattern] = [];
    }
    
    vehicleDatabase[pattern].push(newVehicle);
    
    return newVehicle;
  } catch (error) {
    return handleApiError(error);
  }
};

export const updateVehicleStatus = async (id: string, allow: boolean): Promise<Vehicle> => {
  try {
    const endpoint = allow ? 'allow' : 'deny';
    
    await new Promise(resolve => setTimeout(resolve, 300)); 
    
    return {
      id,
      plate_number: 'Updated vehicle',
      truck_model_name: 'Mock response',
      allowed: allow
    };
  } catch (error) {
    return handleApiError(error);
  }
};
