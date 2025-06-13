import React, { useEffect, useState } from 'react';
import axios, { AxiosError } from 'axios';

interface Yard {
  id: number;
  name: string;
}

interface Warehouse {
  id: number;
  name: string;
}

interface Gate {
  id: number;
  name: string;
}


interface WarehouseItem {
  name: string;
  sorting_order: number;
  gates: string[];
  plan_gate: string | null;
  description: string | null;
  barcode?: string | null;
  yard?: string | null;
  document?: string | null;
}

interface TaskFormData {
  task_id: null,
  name: string;
  login: string;
  user_name: string;
  user_phone: string;
  company: string;
  plate_number: string;
  trailer_plate_number: string;
  truck_model: string;
  truck_category: string;
  trailer_type: string;
  trailer_model: string;
  color: string;
  vin: string;
  avtor: string;
  phone: string;
  Yard: string;
  description: string;
  plan_date: string;
  end_date: string;
  weighing: boolean;
  create_user_id: string;
  one_permission: boolean;
  warehouse: WarehouseItem[];
}

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const initialWarehouseItem: WarehouseItem = {
  name: '',
  sorting_order: 1,
  gates: [],
  plan_gate: null,
  description: null,
};

interface UserOption {
  id: number;
  user_name: string;
  login: string;
  user_phone: string;
}

interface TruckSearchResult {
  id: number;
  plate_number: string;
  truck_model_name?: string;
  truck_category_name?: string;
  trailer_type_name?: string;
  trailer_model_name?: string;
  color?: string;
  vin?: string;
}


const initialFormState: TaskFormData = {
  task_id: null,
  name: '',
  login: '', 
  user_name: '',
  user_phone: '',
  company: '',
  plate_number: '',
  trailer_plate_number: '',
  truck_model: '',
  truck_category: '',
  trailer_type: '',
  trailer_model: '',
  color: '',
  vin: '',
  avtor: '',
  phone: '',
  Yard: '',
  description: '',
  plan_date: '',
  end_date: '',
  weighing: false,
  create_user_id:'',
  one_permission: false,
  warehouse: [{ ...initialWarehouseItem }],
};

const AddTaskModal: React.FC<AddTaskModalProps> = ({ isOpen, onClose }) => {
  const [yards, setYards] = useState<Yard[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [gatesMap, setGatesMap] = useState<Record<number, Gate[]>>({});
  const [formData, setFormData] = useState<TaskFormData>(initialFormState);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [plateSearch, setPlateSearch] = useState('');  
  const [isSearching, setIsSearching] = useState(false);
  const [truckSearchResult, setTruckSearchResult] = useState<TruckSearchResult | null>(null);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [selectedTruck, setSelectedTruck] = useState<TruckSearchResult | null>(null);
  const [userId, serUserId] = useState();
  
  useEffect(() => {
      const userFromSession = sessionStorage.getItem('user');
      if (userFromSession) {
        const user = JSON.parse(userFromSession);
        serUserId(user.id);
      }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    axios.get<UserOption[]>('/users/without-roles')
      .then(res => setUsers(res.data))
      .catch(() => setUsers([]));
  }, [isOpen]);



  useEffect(() => {
    if (!isOpen) return;

    // Fetch yards
    axios
      .post('/yard/getyards')
      .then((res) => {
        const data = res.data.data;
        if (Array.isArray(data)) {
          setYards(data);
        } else {
          setYards([]);
        }
      })
      .catch(() => setYards([]));

    // Fetch warehouses
    axios
      .post('/warehouse/getwarehouses')
      .then((res) => {
        const data = res.data.data;
        if (Array.isArray(data)) {
          setWarehouses(data);
        } else {
          setWarehouses([]);
        }
      })
      .catch(() => setWarehouses([]));
        
  }, [isOpen]);

  useEffect(() => {
    if (!plateSearch.trim()) {
      setTruckSearchResult(null);
      return;
    }

    if (searchTimeout) clearTimeout(searchTimeout);

    const timeout = setTimeout(() => {
      handleSearchTruck();
    }, 600); // задержка 600мс

    setSearchTimeout(timeout);
  }, [plateSearch]);



  const handleSearchTruck = async () => {
    if (!plateSearch.trim()) return;
    setIsSearching(true);
    try {
      const res = await axios.get<{ found: boolean; data?: TruckSearchResult }>(
        '/trucs/search',
        { params: { plate_number: plateSearch } }
      );
      setTruckSearchResult(res.data.found ? res.data.data! : null);
    } catch (e) {
      console.error(e);
      setTruckSearchResult(null);
    } finally {
      setIsSearching(false);
    }
  };

const handleCreateTruck = () => {
    // Здесь вызовете POST /api/trucks/add с нужными полями
    alert('Создание ТС пока не реализовано');
  };


  const handleSelectTruck = () => {
    if (!truckSearchResult) return;
    setFormData(prev => ({
      ...prev,
      plate_number: truckSearchResult.plate_number,
      truck_model: truckSearchResult.truck_model_name || '',
      truck_category: truckSearchResult.truck_category_name || '',
      trailer_type: truckSearchResult.trailer_type_name || '',
      trailer_model: truckSearchResult.trailer_model_name || '',
      color: truckSearchResult.color || '',
      vin: truckSearchResult.vin || '',
    }));
  setSelectedTruck(truckSearchResult); // или то, как ты его назвал

  };

 const loadGatesForWarehouse = (warehouseName: string, index: number) => {
  const warehouseObj = warehouses.find((w) => w.name === warehouseName);
  if (!warehouseObj) {
    setGatesMap((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    setFormData((prev) => {
      const arr = [...prev.warehouse];
      arr[index].plan_gate = null;
      arr[index].gates = [];
      return { ...prev, warehouse: arr };
    });
    return;
  }

  axios
    .post('/warehouse/getgates', { warehouse_id: warehouseObj.id })
    .then((res) => {
      const data = res.data.data;
      if (Array.isArray(data)) {
        setGatesMap((prev) => ({ ...prev, [index]: data }));
        setFormData((prev) => {
          const arr = [...prev.warehouse];
          arr[index].gates = data.map((g: Gate) => g.name);
          if (!data.some((g: Gate) => g.name === arr[index].plan_gate)) {
            arr[index].plan_gate = null;
          }
          return { ...prev, warehouse: arr };
        });
      } else {
        // Очистка, если данные невалидны
        setGatesMap((prev) => {
          const copy = { ...prev };
          delete copy[index];
          return copy;
        });
        setFormData((prev) => {
          const arr = [...prev.warehouse];
          arr[index].plan_gate = null;
          arr[index].gates = [];
          return { ...prev, warehouse: arr };
        });
      }
    })
    .catch(() => {
      // Обработка ошибок
      setGatesMap((prev) => {
        const copy = { ...prev };
        delete copy[index];
        return copy;
      });
      setFormData((prev) => {
        const arr = [...prev.warehouse];
        arr[index].plan_gate = null;
        arr[index].gates = [];
        return { ...prev, warehouse: arr };
      });
    });
};


const handleUserSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const userId = Number(e.target.value);
    const user = users.find(u => u.id === userId)!;

    setFormData(prev => ({
      ...prev,
      user_name: user.user_name,
      login: user.login,
      user_phone: user.user_phone,
    }));
  };


  

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, type, value, checked, dataset } = e.target as HTMLInputElement & HTMLSelectElement;
    if (dataset.index !== undefined) {
      // Nested warehouse item
      const index = Number(dataset.index);
      setFormData((prev) => {
        const arr = [...prev.warehouse];
        const item = { ...arr[index] };
        if (name === 'sorting_order') {
          item.sorting_order = Number(value);
        } else if (name === 'plan_gate') {
          item.plan_gate = value || null;
        } else if (name === 'description') {
          item.description = value || null;
        } else {
          item.name = value;
        }
        arr[index] = item;
        return { ...prev, warehouse: arr };
      });
      if (name === 'name') {
        loadGatesForWarehouse(value, index);
      }
    } else {
      // Top-level fields
      if (type === 'checkbox') {
        setFormData((prev) => ({
          ...prev,
          [name]: checked,
        } as Pick<TaskFormData, keyof TaskFormData>));
      } else {
        setFormData((prev) => ({
          ...prev,
          [name]: value,
        } as Pick<TaskFormData, keyof TaskFormData>));
      }
    }
  };

  const addWarehouse = () => {
    setFormData((prev) => {
      const arr = [...prev.warehouse];
      arr.push({
        name: '',
        sorting_order: arr.length + 1,
        gates: [],
        plan_gate: null,
        description: null,
      });
      return { ...prev, warehouse: arr };
    });
  };

  const removeWarehouse = (index: number) => {
    setFormData((prev) => {
      const arr = prev.warehouse.filter((_, i) => i !== index);
      arr.forEach((item, i) => (item.sorting_order = i + 1));
      return { ...prev, warehouse: arr };
    });
    setGatesMap((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
  };

  const formatDateForAPI = (date: string | Date) => {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};


  const handleSubmit = async () => {
  try {
    const normalizedWarehouse = formData.warehouse.map((item) => ({
      name: item.name,
      sorting_order: item.sorting_order,
      gates: item.gates,
      plan_gate: item.plan_gate,
      description: item.description,
      barcode: item.barcode ?? null,
      yard: item.yard ?? null,
      document: item.document ?? null,
    }));


    const payload = {
      ...formData,
      task_id: formData.task_id ?? null,
      plan_date: formatDateForAPI(formData.plan_date),
      end_date: formatDateForAPI(formData.end_date),
      warehouse: normalizedWarehouse,
      create_user_id: userId,
    };
    console.log('Payload:', payload);

    await axios.post('/api/task/addapitask', payload);

    alert('Задача успешно добавлена');
    onClose();
    setFormData(initialFormState);
    setGatesMap({});
  } catch (err) {
    const error = err as AxiosError<any>;

    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      alert('Ошибка сервера: ' + (error.response.data?.message || 'Неизвестная ошибка'));
    } else {
      console.error('Unexpected error:', err);
      alert('Произошла неизвестная ошибка');
    }
  }
};


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-400/20 bg-opacity-10 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-3">
          <h2 className="text-xl font-bold text-gray-800">Добавить задачу</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-red-600 text-2xl">
            &times;
          </button>
        </div>  
        {/* Top-level form fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-sm font-medium text-gray-700">
            Название задачи (name) *
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Автор (автор) *
            <input
              type="text"
              name="avtor"
              value={formData.avtor}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Выберите пользователя
            <select
              name="user_id"
              value={formData.login ? users.find(u => u.login === formData.login)?.id ?? '' : ''}
              onChange={handleUserSelect}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            >
              <option value="">— Выберите —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.user_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Компания (company)
            <input
              type="text"
              name="company"
              value={formData.company}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

           <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Поиск ТС по номеру23
          <div className="flex mt-1">
            <input
              type="text"
              value={plateSearch}
              onChange={(e) => setPlateSearch(e.target.value)}
              placeholder="Введите номер машины"
              className="flex-1 border border-gray-300 rounded-l px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200"
            />
            <button
              type="button"
              onClick={handleSearchTruck}
              disabled={isSearching}
              className="bg-blue-600 text-white px-4 py-2 rounded-r hover:bg-blue-700 disabled:opacity-50"
            >
              {isSearching ? 'Поиск...' : 'Найти'}
            </button>
          </div>
        </label>

        {truckSearchResult !== null ? (
          <div className="p-3 bg-green-50 rounded border border-green-200">
            <p className="text-green-800">ТС найдено:</p>
            <ul className="text-gray-700">
              <li><strong>Номер:</strong> {truckSearchResult.plate_number}</li>
              <li><strong>Модель:</strong> {truckSearchResult.truck_model_name}</li>
              <li><strong>Прицеп:</strong> {truckSearchResult.trailer_model_name}</li>
              <li><strong>Цвет:</strong> {truckSearchResult.color}</li>
              <li><strong>VIN:</strong> {truckSearchResult.vin}</li>
            </ul>
              {selectedTruck ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTruck(null);
                    setTruckSearchResult(null);
                    setPlateSearch('');
                  }}
                  className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  Отвязать ТС
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSelectTruck}
                  className="mt-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Выбрать ТС
                </button>
              )}
          </div>
        ) : (
          !isSearching && plateSearch && (
            <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
              <p className="text-yellow-800">ТС с таким номером не найдено.</p>
              <button
                type="button"
                onClick={handleCreateTruck}
                className="mt-2 bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
              >
                Создать ТС
              </button>
            </div>
          )
        )}
      </div>


       <label className="block text-sm font-medium text-gray-700">
            Описание (description)
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={2}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

<label className="block text-sm font-medium text-gray-700">
            Дата планирования (plan_date)
            <input
              type="datetime-local"
              name="plan_date"
              value={formData.plan_date}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Телефон (phone)
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

         
          
          <label className="block text-sm font-medium text-gray-700">
            Крайний срок (end_date)
            <input
              type="datetime-local"
              name="end_date"
              value={formData.end_date}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Двор (Yard) *
            <select
              name="Yard"
              value={formData.Yard}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            >
              <option value="">Выберите двор</option>
              {yards.map((yard) => (
                <option key={yard.id} value={yard.name}>
                  {yard.name}
                </option>
              ))}
            </select>
          </label>
        </div>

          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              name="weighing"
              checked={formData.weighing}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  weighing: e.target.checked,
                }))
              }
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span>Весовой контроль (weighing)</span>
          </label>
          

          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              name="weighing"
              checked={formData.one_permission}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  one_permission: e.target.checked,
                }))
              }
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span>Одноразовый заезд</span>
          </label>


          

          

        {/* Склады и ворота */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Склады и ворота</h3>
          {formData.warehouse.map((wh, index) => (
            <div key={index} className="border rounded p-4 mb-4 relative bg-gray-50">
              <button
                type="button"
                onClick={() => removeWarehouse(index)}
                className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-lg font-bold"
                title="Удалить склад"
              >
                &times;
              </button>

              <label className="block text-sm font-medium text-gray-700 mb-1">
                Склад {index + 1}
                <select
                  name="name"
                  data-index={index}
                  value={wh.name}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200 mt-1"
                >
                  <option value="">Выберите склад</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-gray-700 mb-1">
                Порядок сортировки
                <input
                  type="number"
                  name="sorting_order"
                  data-index={index}
                  value={wh.sorting_order}
                  min={1}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200 mt-1"
                />
              </label>

              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ворота (plan_gate)
                <select
                  name="plan_gate"
                  data-index={index}
                  value={wh.plan_gate || ''}
                  onChange={handleChange}
                  disabled={!Array.isArray(gatesMap[index]) || gatesMap[index].length === 0}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200 mt-1"
                >
                  <option value="">Выберите ворота</option>
                  {Array.isArray(gatesMap[index]) &&
                    gatesMap[index].map((gate) => (
                      <option key={gate.id} value={gate.name}>
                        {gate.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Описание
                <textarea
                  name="description"
                  data-index={index}
                  value={wh.description || ''}
                  onChange={handleChange}
                  rows={2}
                  className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
                />
              </label>
            </div>
          ))}

          <button
            type="button"
            onClick={addWarehouse}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
          >
            Добавить склад
          </button>
        </div>

        {/* Кнопки Отмена/Сохранить */}
        <div className="flex justify-end space-x-4 pt-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border border-gray-400 hover:border-gray-600 transition"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTaskModal;
