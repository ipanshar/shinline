import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AppLayout from '@/layouts/app-layout';

interface WhatsAppNumber {
    id?: string; // local id for React lists or DB id from backend
    phone_number_id?: string;
    business_account_id?: string;
    bearer_token?: string;
    waba_id?: string;
    is_active?: boolean;
    label?: string; // Метка назначения номера
}

interface WhatsAppSettings {
    host?: string;
    version?: string;
    numbers?: WhatsAppNumber[];
}

const WhatsAppBusinessSettings: React.FC = () => {
    const [settings, setSettings] = useState<WhatsAppSettings>({ numbers: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const response = await axios.get('/whatsapp/business-settings');
            const data = response.data || {};
            // backward compatibility: if API returned single object for number, convert to array
            let numbers: WhatsAppNumber[] = [];
            if (Array.isArray(data.numbers)) {
                // Новый формат с массивом numbers
                numbers = data.numbers.map((n: any) => ({ 
                    ...n, 
                    id: String(n.id) // Конвертируем DB id в строку для React
                }));
            } else if (data.phone_number_id || data.waba_id || data.business_account_id || data.bearer_token) {
                // Старый формат - один объект на верхнем уровне
                numbers = [{
                    id: data.id ? String(data.id) : '0',
                    phone_number_id: data.phone_number_id,
                    waba_id: data.waba_id,
                    business_account_id: data.business_account_id,
                    bearer_token: data.bearer_token,
                    is_active: data.is_active ?? true,
                    label: data.label,
                }];
            }

            setSettings({
                host: data.host || '',
                version: data.version || '',
                numbers
            });
            setLoading(false);
        } catch (err) {
            setError('Failed to load settings');
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // send full settings payload; backend should accept `numbers` array
            await axios.post('/whatsapp/business-settings', settings);
            alert('Settings saved successfully');
        } catch (err) {
            setError('Failed to save settings');
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings({
            ...settings,
            [name]: value
        });
    };

    const addNumber = () => {
        const next = settings.numbers ? [...settings.numbers] : [];
        // Новые номера не имеют is_active, бэкенд установит для первого
        next.push({ id: 'new_' + String(Date.now()) });
        setSettings({ ...settings, numbers: next });
    };

    const removeNumber = (id?: string) => {
        if (!settings.numbers) return;
        
        // Находим номер для отображения в диалоге
        const numberToRemove = settings.numbers.find(n => n.id === id);
        const phoneNumberId = numberToRemove?.phone_number_id || 'этот номер';
        const label = numberToRemove?.label;
        
        // Формируем сообщение с учетом метки
        let message = `Вы действительно хотите удалить номер ${phoneNumberId}?`;
        if (label) {
            message = `Вы действительно хотите удалить номер "${label}" (${phoneNumberId})?`;
        }
        message += '\n\nЭто действие нельзя будет отменить.';
        
        // Показываем диалог подтверждения
        const confirmed = window.confirm(message);
        
        if (!confirmed) {
            return; // Пользователь отменил удаление
        }
        
        const next = settings.numbers.filter(n => n.id !== id);
        setSettings({ ...settings, numbers: next });
    };

    const handleNumberChange = (id: string | undefined, e: React.ChangeEvent<HTMLInputElement>) => {
        if (!settings.numbers) return;
        const { name, value } = e.target;
        const next = settings.numbers.map(n => {
            if (n.id !== id) return n;
            return { ...n, [name]: value };
        });
        setSettings({ ...settings, numbers: next });
    };

    if (loading) return <div>Загрузка...</div>;

    return (
        <AppLayout>
        <div className="container mx-auto p-4">
            <h1 className="text-2xl mb-4">Настройки WhatsApp Business</h1>
            {error && <div className="text-red-500 mb-4">{error}</div>}
            
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block mb-2">Host</label>
                    <input
                        type="text"
                        name="host"
                        value={settings.host || ''}
                        onChange={handleChange}
                        className="w-full p-2 border rounded"
                    />
                </div>
                <div>
                    <label className="block mb-2">Version</label>
                    <input
                        type="text"
                        name="version"
                        value={settings.version || ''}
                        onChange={handleChange}
                        className="w-full p-2 border rounded"
                    />
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-lg">Номера</h2>
                        <button type="button" onClick={addNumber} className="bg-green-500 text-white px-3 py-1 rounded">Добавить номер</button>
                    </div>

                    {(!settings.numbers || settings.numbers.length === 0) && (
                        <div className="text-gray-500 mb-2">Нет добавленных номеров</div>
                    )}

                    {settings.numbers && settings.numbers.map((num, index) => (
                        <div key={num.id} className={`p-3 mb-2 border rounded ${num.is_active ? 'border-green-500 bg-green-50' : ''}`}>
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <strong>Номер #{index + 1}</strong>
                                    {num.is_active && <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">Активен</span>}
                                    {num.label && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{num.label}</span>}
                                </div>
                                <button type="button" onClick={() => removeNumber(num.id)} className="text-red-500 hover:text-red-700">Удалить</button>
                            </div>

                            <div className="mt-2">
                                <label className="block mb-1 font-medium">Метка / Назначение</label>
                                <input
                                    type="text"
                                    name="label"
                                    value={num.label || ''}
                                    onChange={(e) => handleNumberChange(num.id, e)}
                                    placeholder="Например: Переписка с поставщиками, Сотрудники, Прием документов"
                                    className="w-full p-2 border rounded"
                                />
                                <p className="text-xs text-gray-500 mt-1">Укажите для чего используется этот номер</p>
                            </div>

                            <div className="mt-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="is_active"
                                        checked={num.is_active || false}
                                        onChange={(e) => {
                                            const newNumbers = settings.numbers?.map(n => {
                                                if (n.id === num.id) {
                                                    return { ...n, is_active: e.target.checked };
                                                }
                                                return n;
                                            });
                                            setSettings({ ...settings, numbers: newNumbers });
                                        }}
                                        className="w-4 h-4"
                                    />
                                    <span className="text-sm">Использовать этот номер как активный</span>
                                </label>
                            </div>

                            <div className="mt-2">
                                <label className="block mb-1">ИД номера WhatsApp</label>
                                <input
                                    type="text"
                                    name="phone_number_id"
                                    value={num.phone_number_id || ''}
                                    onChange={(e) => handleNumberChange(num.id, e)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>

                            <div className="mt-2">
                                <label className="block mb-1">WABA ID</label>
                                <input
                                    type="text"
                                    name="waba_id"
                                    value={num.waba_id || ''}
                                    onChange={(e) => handleNumberChange(num.id, e)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>

                            <div className="mt-2">
                                <label className="block mb-1">Номер бизнес аккаунта</label>
                                <input
                                    type="text"
                                    name="business_account_id"
                                    value={num.business_account_id || ''}
                                    onChange={(e) => handleNumberChange(num.id, e)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>

                            <div className="mt-2">
                                <label className="block mb-1">Bearer Token</label>
                                <input
                                    type="text"
                                    name="bearer_token"
                                    value={num.bearer_token || ''}
                                    onChange={(e) => handleNumberChange(num.id, e)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    type="submit"
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                    Сохранить настройки
                </button>
            </form>
        </div>
        </AppLayout>
    );
};

export default WhatsAppBusinessSettings;