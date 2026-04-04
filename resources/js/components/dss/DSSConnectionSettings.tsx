import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import InputError from '@/components/input-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Settings2 } from 'lucide-react';

type DSSConfig = {
  id: number;
  base_url: string;
  user_name: string;
  password: string;
  client_type?: string;
  token?: string;
  keepalive?: string;
  credential?: string;
  secret_key?: string;
  secret_vector?: string;
  terminal_public_key?: string;
  platform_public_key?: string;
  subhour?: number;
};

type FormState = {
  base_url: string;
  user_name: string;
  password: string;
  subhour: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const DSSConnectionSettings = () => {
  const [config, setConfig] = useState<DSSConfig | null>(null);
  const [formData, setFormData] = useState<FormState>({
    base_url: '',
    user_name: '',
    password: '',
    subhour: '0',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoadError(null);
        const response = await axios.post('/dss/settings');
        const data = response.data.data;
        setConfig(data);
        setFormData({
          base_url: data.base_url,
          user_name: data.user_name,
          password: data.password,
          subhour: String(data.subhour ?? 0),
        });
      } catch (error) {
        console.error('Ошибка загрузки настроек:', error);
        setLoadError('Не удалось загрузить настройки DSS.');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};

    if (!formData.base_url.trim()) {
      nextErrors.base_url = 'Укажите базовый URL DSS.';
    } else {
      try {
        const url = new URL(formData.base_url);
        if (!['http:', 'https:'].includes(url.protocol)) {
          nextErrors.base_url = 'URL должен начинаться с http:// или https://';
        }
      } catch {
        nextErrors.base_url = 'Введите корректный URL.';
      }
    }

    if (!formData.user_name.trim()) {
      nextErrors.user_name = 'Укажите логин DSS.';
    }

    if (!formData.password.trim()) {
      nextErrors.password = 'Укажите пароль DSS.';
    }

    if (!/^\d+$/.test(formData.subhour.trim())) {
      nextErrors.subhour = 'Часы хранения должны быть целым неотрицательным числом.';
    }

    return nextErrors;
  };

  const handleSave = async () => {
    if (!config) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessage('Проверьте поля формы перед сохранением.');
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        id: config.id,
        ...formData,
        subhour: Number(formData.subhour),
      };

      const response = await axios.post('/dss/settings/update', payload);
      const freshConfig = response.data.data;

      setMessage('Настройки успешно сохранены');
      setConfig(freshConfig);
      setFormData({
        base_url: freshConfig.base_url,
        user_name: freshConfig.user_name,
        password: freshConfig.password,
        subhour: String(freshConfig.subhour ?? 0),
      });
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

  const connectionHealth = useMemo(() => {
    if (!config?.token) {
      return { label: 'Нет активного токена', variant: 'secondary' as const };
    }

    return { label: 'Подключение активно', variant: 'default' as const };
  }, [config?.token]);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">Загрузка настроек DSS...</CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <Settings2 className="h-4 w-4" />
            <AlertTitle>Конфигурация недоступна</AlertTitle>
            <AlertDescription>{loadError ?? 'Ошибка загрузки конфигурации DSS.'}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Настройки подключения к DSS</CardTitle>
          <CardDescription>
            Единая точка входа для подключения, учётных данных и базовых runtime-параметров.
          </CardDescription>
        </div>
        <Badge variant={connectionHealth.variant}>{connectionHealth.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        {message && (
          <Alert variant={Object.keys(errors).length > 0 ? 'destructive' : 'default'}>
            <Settings2 className="h-4 w-4" />
            <AlertTitle>{Object.keys(errors).length > 0 ? 'Проверьте форму' : 'Сохранение'}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="base_url">Базовый URL</Label>
              <Input id="base_url" name="base_url" value={formData.base_url} onChange={handleChange} placeholder="https://dss.example.local" />
              <InputError message={errors.base_url} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user_name">Логин</Label>
                <Input id="user_name" name="user_name" value={formData.user_name} onChange={handleChange} placeholder="operator" />
                <InputError message={errors.user_name} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input id="password" name="password" type="password" value={formData.password} onChange={handleChange} placeholder="••••••••" />
                <InputError message={errors.password} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subhour">Часы хранения</Label>
              <Input id="subhour" name="subhour" inputMode="numeric" value={formData.subhour} onChange={handleChange} placeholder="0" />
              <InputError message={errors.subhour} />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Сохранение...' : 'Сохранить настройки'}
            </Button>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4">
            <h3 className="mb-4 font-semibold">Текущее состояние</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Тип клиента</dt>
                <dd className="font-medium">{config.client_type ?? 'WINPC_V2'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Token</dt>
                <dd className="max-w-[220px] break-all text-right font-medium">{config.token || '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Credential</dt>
                <dd className="max-w-[220px] break-all text-right font-medium">{config.credential || '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Secret key</dt>
                <dd className="max-w-[220px] break-all text-right font-medium">{config.secret_key || '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Secret vector</dt>
                <dd className="max-w-[220px] break-all text-right font-medium">{config.secret_vector || '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Terminal public key</dt>
                <dd className="max-w-[220px] break-all text-right font-medium">{config.terminal_public_key || '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Platform public key</dt>
                <dd className="max-w-[220px] break-all text-right font-medium">{config.platform_public_key || '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Keepalive</dt>
                <dd className="font-medium">{config.keepalive ? timeAgo(new Date(config.keepalive)) : '—'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DSSConnectionSettings;
