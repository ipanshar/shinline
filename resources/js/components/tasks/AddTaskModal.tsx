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
  weighing: boolean;
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
  weighing: false,
  warehouse: [{ ...initialWarehouseItem }],
};

const AddTaskModal: React.FC<AddTaskModalProps> = ({ isOpen, onClose }) => {
  const [yards, setYards] = useState<Yard[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [gatesMap, setGatesMap] = useState<Record<number, Gate[]>>({});
  const [formData, setFormData] = useState<TaskFormData>(initialFormState);

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
      .post('/warehouse/getwarehouses', { warehouse_id: warehouseObj.id })
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
    const payload = {
      ...formData,
      task_id: formData.task_id ?? null,
      plan_date: formatDateForAPI(formData.plan_date),
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
            Пользователь (user_name)
            <input
              type="text"
              name="user_name"
              value={formData.user_name}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

            <label className="block text-sm font-medium text-gray-700">
            Логин пользователя (login)
            <input
              type="text"
              name="login"
              value={formData.login}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Телефон пользователя (user_phone)
            <input
              type="text"
              name="user_phone"
              value={formData.user_phone}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
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

          <label className="block text-sm font-medium text-gray-700">
            Номер машины (plate_number)
            <input
              type="text"
              name="plate_number"
              value={formData.plate_number}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Номер прицепа (trailer_plate_number)
            <input
              type="text"
              name="trailer_plate_number"
              value={formData.trailer_plate_number}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Модель грузовика (truck_model)
            <input
              type="text"
              name="truck_model"
              value={formData.truck_model}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Категория грузовика (truck_category)
            <input
              type="text"
              name="truck_category"
              value={formData.truck_category}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Тип прицепа (trailer_type)
            <input
              type="text"
              name="trailer_type"
              value={formData.trailer_type}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Модель прицепа (trailer_model)
            <input
              type="text"
              name="trailer_model"
              value={formData.trailer_model}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Цвет (color)
            <input
              type="text"
              name="color"
              value={formData.color}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            VIN (vin)
            <input
              type="text"
              name="vin"
              value={formData.vin}
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
