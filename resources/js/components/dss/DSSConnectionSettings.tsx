import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { colors } from '@mui/material';

type DSSConfig = {
  id: number;
  base_url: string;
  user_name: string;
  password: string;
  client_type?: string;
  token?: string;
  keepalive?: string;
  credential?: string;
  subhour?: number;
};

const DSSConnectionSettings = () => {
  const [config, setConfig] = useState<DSSConfig | null>(null);
  const [formData, setFormData] = useState({
    base_url: '',
    user_name: '',
    password: '',
    subhour: 0,
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
          subhour: data.subhour || 0,
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
  const timeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return `${diffSeconds} сек. назад`;
    if (diffMinutes < 60) return `${diffMinutes} мин. назад`;
    if (diffHours < 24) return `${diffHours} ч. назад`;
    return `${diffDays} дн. назад`;
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
            <td style={styles.td}><strong>Базовый URL</strong></td>
            <td style={styles.td}>
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
            <td style={styles.td}><strong>Логин</strong></td>
            <td style={styles.td}>
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
            <td style={styles.td}><strong>Пароль</strong></td>
            <td style={styles.td}>
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
            <td style={styles.td}><strong>Часы хранения</strong></td>
            <td style={styles.td}>
              {isEditing ? (
                <input
                  name="subhour"
                  value={formData.subhour}
                  onChange={handleChange}
                  style={styles.input}
                />
              ) : (
                config.subhour || '—'
              )}
            </td>
          </tr>
          <tr>
            <td style={styles.td}><strong>Тип клиента</strong></td>
            <td style={styles.td}>{config.client_type}</td>
          </tr>
          <tr>
            <td style={styles.td}><strong>Токен</strong></td>
            <td style={styles.td}>{config.token || '—'}</td>
          </tr>
          <tr>
            <td style={styles.td}><strong>Токен учета</strong></td>
            <td style={styles.td}>{config.credential || '—'}</td>
          </tr>
          <tr>
            <td style={styles.td}><strong>Активность</strong></td>
            <td style={styles.td}>{config.keepalive ? timeAgo(new Date(config.keepalive)) : '—'}</td>
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
  td: {
    padding: '10px',
    borderBottom: '1px solid #ddd',
  },

  input: {
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: colors.common.white,
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
