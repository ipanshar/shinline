import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AppLayout from '@/layouts/app-layout';

interface WhatsAppSettings {
    phone_number_id?: string;
    business_account_id?: string;
    bearer_token?: string;
    host?: string;
    version?: string;   
    waba_id?: string;
    // Add other settings fields as needed
}

const WhatsAppBusinessSettings: React.FC = () => {
    const [settings, setSettings] = useState<WhatsAppSettings>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const response = await axios.get('/whatsapp/business-settings');
            setSettings(response.data);
            setLoading(false);
        } catch (err) {
            setError('Failed to load settings');
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post('/whatsapp/business-settings', settings);
            alert('Settings saved successfully');
        } catch (err) {
            setError('Failed to save settings');
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSettings({
            ...settings,
            [e.target.name]: e.target.value
        });
    };

    if (loading) return <div>Загрузка...</div>;

    return (
        <AppLayout>
        <div className="container mx-auto p-4">
            <h1 className="text-2xl mb-4">Настройки WhatsApp Business</h1>
            {error && <div className="text-red-500 mb-4">{error}</div>}
            
            <form onSubmit={handleSubmit} className="space-y-4">
           
             <div>
                    <label className="block mb-2">ИД номера WhatsApp</label>
                    <input
                        type="text"
                        name="phone_number_id"
                        value={settings.phone_number_id || ''}
                        onChange={handleChange}
                        className="w-full p-2 border rounded"
                    />
                </div>
                
                <div>
                    <label className="block mb-2">WABA ID</label>
                    <input
                        type="text"
                        name="waba_id"
                        value={settings.waba_id || ''}
                        onChange={handleChange}
                        className="w-full p-2 border rounded"
                    />
                </div>
                <div>
                    <label className="block mb-2">ИД бизнес аккаунта</label>
                    <input
                        type="text"
                        name="business_account_id"
                        value={settings.business_account_id || ''}
                        onChange={handleChange}
                        className="w-full p-2 border rounded"
                    />
                </div>
                <div>
                    <label className="block mb-2">Bearer Token</label>
                    <input
                        type="text"
                        name="bearer_token"
                        value={settings.bearer_token || ''}
                        onChange={handleChange}
                        className="w-full p-2 border rounded"
                    />
                </div>
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