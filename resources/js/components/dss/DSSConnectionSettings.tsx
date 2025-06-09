import React, { useEffect, useState } from 'react';
import axios from 'axios';

type DSSConfig = {
  id: number;
  base_url: string;
  user_name: string;
  password: string;
  client_type?: string;
  token?: string;
  begin_session?: string;
  created_at: string;
  updated_at: string;
};

const DSSConnectionSettings = () => {
  const [config, setConfig] = useState<DSSConfig | null>(null);
  const [formData, setFormData] = useState({
    base_url: '',
    user_name: '',
    password: '',
  });

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Получение настроек с сервера
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await axios.post('/dss/settings');
        const data = response.data;
        setConfig(data);
        setFormData({
          base_url: data.base_url,
          user_name: data.user_name,
          password: data.password,
        });
      } catch (error) {
        console.error('Ошибка загрузки настроек:', error);
        setMessage('Не удалось загрузить настройки.');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setMessage('');

    try {
      await axios.post('/dss/settings/update', {
        id: config.id,
        ...formData
      });

      setMessage('Настройки успешно сохранены');
      setIsEditing(false);

      // Обновим отображаемые данные
      setConfig(prev => prev ? {
        ...prev,
        ...formData,
        updated_at: new Date().toISOString(),
      } : prev);
    } catch (error) {
      console.error('Ошибка при сохранении:', error);
      setMessage('Ошибка при сохранении настроек');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={styles.container}>Загрузка настроек...</div>;
  }

  if (!config) {
    return <div style={styles.container}>Ошибка загрузки конфигурации.</div>;
  }

  return (
    <div style={styles.container}>
      <strong>Настройки подключения к серверу DSS</strong>

      <table style={styles.table}>
        <tbody>
          <tr>
            <td><strong>Базовый URL</strong></td>
            <td>
              {isEditing ? (
                <input
                  name="base_url"
                  value={formData.base_url}
                  onChange={handleChange}
                  style={styles.input}
                />
              ) : (
                config.base_url
              )}
            </td>
          </tr>
          <tr>
            <td><strong>Логин</strong></td>
            <td>
              {isEditing ? (
                <input
                  name="user_name"
                  value={formData.user_name}
                  onChange={handleChange}
                  style={styles.input}
                />
              ) : (
                config.user_name
              )}
            </td>
          </tr>
          <tr>
            <td><strong>Пароль</strong></td>
            <td>
              {isEditing ? (
                <input
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  style={styles.input}
                />
              ) : (
                '********'
              )}
            </td>
          </tr>
          <tr>
            <td><strong>Тип клиента</strong></td>
            <td>{config.client_type}</td>
          </tr>
          <tr>
            <td><strong>Токен</strong></td>
            <td>{config.token || '—'}</td>
          </tr>
          <tr>
            <td><strong>Сессия началась</strong></td>
            <td>{config.begin_session || '—'}</td>
          </tr>
          <tr>
            <td><strong>Создано</strong></td>
            <td>{new Date(config.created_at).toLocaleString()}</td>
          </tr>
          <tr>
            <td><strong>Обновлено</strong></td>
            <td>{new Date(config.updated_at).toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <div style={styles.buttonRow}>
        {isEditing ? (
          <>
            <button onClick={handleSave} disabled={saving} style={styles.button}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={() => setIsEditing(false)} style={styles.cancelButton}>
              Отмена
            </button>
          </>
        ) : (
          <button onClick={() => setIsEditing(true)} style={styles.button}>
            Редактировать
          </button>
        )}
      </div>

      {message && <div style={styles.message}>{message}</div>}
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    maxWidth: '600px',
    margin: 'auto',
    marginTop: '40px',
    boxShadow: '0 0 10px rgba(0,0,0,0.1)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginBottom: '20px'
  },
  input: {
    width: '100%',
    padding: '6px',
    fontSize: '14px',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px'
  },
  button: {
    padding: '8px 16px',
    backgroundColor: '#1976d2',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  cancelButton: {
    padding: '8px 16px',
    backgroundColor: '#777',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  message: {
    marginTop: '10px',
    color: '#007700',
    fontWeight: 'bold'
  }
};

export default DSSConnectionSettings;
