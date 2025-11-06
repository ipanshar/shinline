import React, { useEffect, useState } from 'react';
import axios, { AxiosError } from 'axios';
import { Button } from '@mui/material';

interface Truck {
  id: number;
  name: string | undefined;
  user_id: number | undefined;
  plate_number: string | undefined;
  truck_brand_id: number | undefined;
  truck_model_id: number | undefined;
  color: string | undefined;
  trailer_model_id: number | undefined;
  trailer_type_id: number | undefined;
  trailer_number: string | undefined;
  trailer_height: number | undefined;
  trailer_width: number | undefined;
  trailer_length: number | undefined;
  own: boolean | undefined;
  trailer_load_capacity: number | undefined;
}

interface TruckModel {
  id: number;
  name: string | undefined;
  truck_category_name: string | undefined;
  truck_brand_name: string | undefined;
}
interface TruckBrand {
  id: number;
  name: string | undefined;
}
interface TruckCategory {
  id: number;
  name: string | undefined;
}
interface TrailerModel {
  id: number;
  name: string | undefined;
}
interface TrailerType {
  id: number;
  name: string | undefined;
}
const AddTruckModal: React.FC<{ isOpen: boolean; onClose: () => void; onTruckAdded: (truck: Truck) => void }> = ({ isOpen, onClose, onTruckAdded }) => {
  const [truckModels, setTruckModels] = useState<TruckModel[]>([]);
  const [truckBrands, setTruckBrands] = useState<TruckBrand[]>([]);
  const [truckCategories, setTruckCategories] = useState<TruckCategory[]>([]);
  const [trailerModels, setTrailerModels] = useState<TrailerModel[]>([]);
  const [trailerTypes, setTrailerTypes] = useState<TrailerType[]>([]);  
  
    const [formData, setFormData] = useState({
    name: '',
    user_id: 1,
    plate_number: '',
    vin: '',
    truck_model_id: undefined,
    truck_brand_id: undefined,
    truck_category_id: undefined,
    trailer_model_id: undefined,
    trailer_type_id: undefined,
    trailer_number: '',
    trailer_height: undefined,
    trailer_width: undefined,
    trailer_length: undefined,
    own: 'не указано',
    vip_level: 0,
    trailer_load_capacity: undefined,
  });   
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Функция для загрузки справочных данных
    const fetchReferenceData = async () => {
      try { 
        const [modelsRes, brandsRes, categoriesRes, trailerModelsRes, trailerTypesRes] = await Promise.all([
          axios.post('/trucks/gettruckmodels'),
          axios.post('/trucks/gettruckbrands'),
          axios.post('/trucs/getcategories'),
          axios.post('/trailer/gettrailermodels'),
          axios.post('/trailer/gettrailertypes'),
        ]);

        setTruckModels(modelsRes.data.data);
        setTruckBrands(brandsRes.data.data);
        setTruckCategories(categoriesRes.data.data);
        setTrailerModels(trailerModelsRes.data.data);
        setTrailerTypes(trailerTypesRes.data.data);
      } catch (error) {
        setError('Ошибка при загрузке данных');
      }
    };

    fetchReferenceData();
  }, []);   
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target as HTMLInputElement & HTMLSelectElement;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Отправляем все поля, заменяя undefined на null
      const dataToSend: any = {};
      Object.entries(formData).forEach(([key, value]) => {
        dataToSend[key] = value === undefined ? null : value;
      });
      
      console.log('Отправляемые данные:', dataToSend);
      const response = await axios.post('/trucs/addtruck', dataToSend);
      console.log('Ответ сервера:', response.data);
      onTruckAdded(response.data);
      onClose();
    } catch (error: any) {
      console.error('Ошибка при добавлении:', error);
      console.error('Ответ сервера:', error.response?.data);
      setError(error.response?.data?.message || 'Ошибка при добавлении грузовика');
    } finally {
      setLoading(false);
    }
  };
    if (!isOpen) return null;
    return (    
    <div className="fixed inset-0 bg-gray-400/20 bg-opacity-10 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-auto" onClick={onClose}>
  <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl p-6 relative max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
   <div className='absolute top-2 right-2'>
   <Button variant="contained" color="error" onClick={onClose}>Закрыть</Button>
   </div>
    <h2 className="text-2xl font-semibold mb-4">Добавить грузовик</h2>
    {error && <div className="mb-4 text-red-600">{error}</div>}
    <form onSubmit={handleSubmit} className="space-y-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div>
        <label className="block mb-1 font-medium">Название</label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium">Номер</label>
        <input
          type="text"
          name="plate_number"
          value={formData.plate_number}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium">VIN</label>
        <input
          type="text"
          name="vin"
          value={formData.vin}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium">Марка</label>
        <select
          name="truck_brand_id"
          value={formData.truck_brand_id}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        >
          <option value="">Выберите марку</option>
          {truckBrands.map(brand => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block mb-1 font-medium">Модель</label>
        <select
          name="truck_model_id"
          value={formData.truck_model_id}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        >
          <option value="">Выберите модель</option>
          {truckModels.map(model => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block mb-1 font-medium">Категория</label>
        <select
          name="truck_category_id"
          value={formData.truck_category_id}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        >
          <option value="">Выберите категорию</option>
          {truckCategories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block mb-1 font-medium">Прицеп - Модель</label>
        <select
          name="trailer_model_id"
          value={formData.trailer_model_id}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        >
          <option value="">Выберите модель прицепа</option>
          {trailerModels.map(model => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block mb-1 font-medium">Прицеп - Тип</label>
        <select
          name="trailer_type_id"
          value={formData.trailer_type_id}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        >
          <option value="">Выберите тип прицепа</option>
          {trailerTypes.map(type => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block mb-1 font-medium">Прицеп - Номер</label>
        <input
          type="text"
          name="trailer_number"
          value={formData.trailer_number}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium">Прицеп - Высота (м)</label>
        <input
          type="number"
          name="trailer_height"
          value={formData.trailer_height}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium">Прицеп - Ширина (м)</label>
        <input
          type="number"
          name="trailer_width"
          value={formData.trailer_width}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium">Прицеп - Длина (м)</label>
        <input
          type="number"
          name="trailer_length"
          value={formData.trailer_length}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium">Прицеп - Грузоподъемность (т)</label>
        <input
          type="number"
          name="trailer_load_capacity"
          value={formData.trailer_load_capacity}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium">Собственность</label>
        <select
          name="own"
          value={formData.own}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        >
          <option value="не указано">Не указано</option>
          <option value="собственный">Собственный</option>
          <option value="арендованный">Арендованный</option>
          <option value="личный">Личный</option>
          <option value="государственный">Государственный</option>
        </select>
      </div>
      <div>
        <label className="block mb-1 font-medium">VIP статус</label>
        <select
          name="vip_level"
          value={formData.vip_level}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-2"
        >
          <option value={0}>Обычный</option>
          <option value={1}>⭐ VIP (золотой)</option>
          <option value={2}>👤 Руководство (серебристый)</option>
          <option value={3}>🚒 Зд обход (зеленый)</option>
        </select>
      </div>
      <div className="flex justify-end col-span-2">
        <button
          type="submit"
          className="bg-blue-500 text-white rounded px-4 py-2"
        >
          Добавить
        </button>
      </div>
    </form>
  </div>
</div>

  );
}
export default AddTruckModal;