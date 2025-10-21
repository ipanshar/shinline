import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

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
  truck_own: any;
  trailer_load_capacity: number | undefined;
  truck_category_id: number | undefined;
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

interface EditTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTruckUpdated: () => void;
  truck: Truck;
}

const EditTruckModal: React.FC<EditTruckModalProps> = ({ isOpen, onClose, onTruckUpdated, truck }) => {
  const [truckModels, setTruckModels] = useState<TruckModel[]>([]);
  const [truckBrands, setTruckBrands] = useState<TruckBrand[]>([]);
  const [truckCategories, setTruckCategories] = useState<TruckCategory[]>([]);
  const [trailerModels, setTrailerModels] = useState<TrailerModel[]>([]);
  const [trailerTypes, setTrailerTypes] = useState<TrailerType[]>([]);
  
  const [formData, setFormData] = useState({
    id: truck.id,
    name: truck.name || '',
    user_id: truck.user_id || 1,
    plate_number: truck.plate_number || '',
    vin: truck.vin || '',
    truck_model_id: truck.truck_model_id,
    truck_brand_id: truck.truck_brand_id,
    truck_category_id: truck.truck_category_id,
    color: truck.color || '',
    trailer_model_id: truck.trailer_model_id,
    trailer_type_id: truck.trailer_type_id,
    trailer_number: truck.trailer_number || '',
    trailer_height: truck.trailer_height,
    trailer_width: truck.trailer_width,
    trailer_length: truck.trailer_length,
    own: truck.truck_own ? true : false,
    trailer_load_capacity: truck.trailer_load_capacity,
  });
  
  // Логирование для диагностики
  console.log('EditTruckModal - Полученный truck:', truck);
  console.log('EditTruckModal - truck.truck_own:', truck.truck_own);
  console.log('EditTruckModal - Начальный formData:', formData);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

    if (isOpen) {
      fetchReferenceData();
    }
  }, [isOpen]);

  useEffect(() => {
    // Обновляем formData при изменении truck
    setFormData({
      id: truck.id,
      name: truck.name || '',
      user_id: truck.user_id || 1,
      plate_number: truck.plate_number || '',
      vin: truck.vin || '',
      truck_model_id: truck.truck_model_id,
      truck_brand_id: truck.truck_brand_id,
      truck_category_id: truck.truck_category_id,
      color: truck.color || '',
      trailer_model_id: truck.trailer_model_id,
      trailer_type_id: truck.trailer_type_id,
      trailer_number: truck.trailer_number || '',
      trailer_height: truck.trailer_height,
      trailer_width: truck.trailer_width,
      trailer_length: truck.trailer_length,
      own: truck.truck_own ? true : false,
      trailer_load_capacity: truck.trailer_load_capacity,
    });
  }, [truck]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
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
      const response = await axios.post('/trucs/updatetruck', dataToSend);
      console.log('Ответ сервера:', response.data);
      onTruckUpdated();
      onClose();
    } catch (error: any) {
      console.error('Ошибка при обновлении:', error);
      console.error('Ответ сервера:', error.response?.data);
      setError(error.response?.data?.message || 'Ошибка при обновлении грузовика');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-auto" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-lg w-full max-w-4xl p-6 relative max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="absolute top-4 right-4">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <h2 className="text-2xl font-semibold mb-6">Редактировать грузовик</h2>
        
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block mb-2 text-sm font-medium">Название</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          
          <div>
            <label className="block mb-2 text-sm font-medium">Номер *</label>
            <input
              type="text"
              name="plate_number"
              value={formData.plate_number}
              onChange={handleChange}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          
          <div>
            <label className="block mb-2 text-sm font-medium">VIN</label>
            <input
              type="text"
              name="vin"
              value={formData.vin}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          
          <div>
            <label className="block mb-2 text-sm font-medium">Марка</label>
            <select
              name="truck_brand_id"
              value={formData.truck_brand_id || ''}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <label className="block mb-2 text-sm font-medium">Модель</label>
            <select
              name="truck_model_id"
              value={formData.truck_model_id || ''}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <label className="block mb-2 text-sm font-medium">Категория</label>
            <select
              name="truck_category_id"
              value={formData.truck_category_id || ''}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <label className="block mb-2 text-sm font-medium">Цвет</label>
            <input
              type="text"
              name="color"
              value={formData.color}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          
          <div>
            <label className="block mb-2 text-sm font-medium">Прицеп - Модель</label>
            <select
              name="trailer_model_id"
              value={formData.trailer_model_id || ''}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <label className="block mb-2 text-sm font-medium">Прицеп - Тип</label>
            <select
              name="trailer_type_id"
              value={formData.trailer_type_id || ''}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <label className="block mb-2 text-sm font-medium">Прицеп - Номер</label>
            <input
              type="text"
              name="trailer_number"
              value={formData.trailer_number}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          
          <div>
            <label className="block mb-2 text-sm font-medium">Прицеп - Высота (м)</label>
            <input
              type="number"
              name="trailer_height"
              value={formData.trailer_height || ''}
              onChange={handleChange}
              step="0.01"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          
          <div>
            <label className="block mb-2 text-sm font-medium">Прицеп - Ширина (м)</label>
            <input
              type="number"
              name="trailer_width"
              value={formData.trailer_width || ''}
              onChange={handleChange}
              step="0.01"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          
          <div>
            <label className="block mb-2 text-sm font-medium">Прицеп - Длина (м)</label>
            <input
              type="number"
              name="trailer_length"
              value={formData.trailer_length || ''}
              onChange={handleChange}
              step="0.01"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          
          <div>
            <label className="block mb-2 text-sm font-medium">Прицеп - Грузоподъемность (т)</label>
            <input
              type="number"
              name="trailer_load_capacity"
              value={formData.trailer_load_capacity || ''}
              onChange={handleChange}
              step="0.01"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          
          <div className="flex items-center col-span-2">
            <input
              type="checkbox"
              name="own"
              checked={formData.own}
              onChange={handleChange}
              className="mr-2 h-4 w-4 rounded border-input"
            />
            <label className="text-sm font-medium">Собственный</label>
          </div>
          
          <div className="flex justify-end gap-3 col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditTruckModal;
