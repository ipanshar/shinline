import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { AlertCircle, Bell, MessageSquare, Plus, Save, Send, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type TelegramChat = {
  id: number;
  name: string;
  chat_id: string;
  description?: string | null;
  message_thread_id?: number | null;
  is_enabled: boolean;
  send_silently_default: boolean;
  sort_order: number;
};

type TelegramEventDefinition = {
  key: string;
  title: string;
  description: string;
  category: string;
  default_enabled: boolean;
  default_cooldown_minutes: number;
  default_send_silently: boolean;
};

type TelegramNotificationRule = {
  id: number;
  telegram_chat_id: number;
  event_key: string;
  is_enabled: boolean;
  send_silently: boolean;
  cooldown_minutes: number;
  last_sent_at?: string | null;
  last_error?: string | null;
  last_error_at?: string | null;
};

type TelegramWebhookConfig = {
  url: string;
  configured: boolean;
};

type TelegramWebhookInfo = {
  url?: string | null;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number | string | null;
  last_error_message?: string | null;
  max_connections?: number | null;
  ip_address?: string | null;
};

type ChatForm = {
  id?: number;
  name: string;
  chat_id: string;
  description: string;
  message_thread_id: string;
  is_enabled: boolean;
  send_silently_default: boolean;
  sort_order: string;
};

type RuleForm = Record<string, {
  is_enabled: boolean;
  send_silently: boolean;
  cooldown_minutes: string;
}>;

const emptyChatForm: ChatForm = {
  name: '',
  chat_id: '',
  description: '',
  message_thread_id: '',
  is_enabled: true,
  send_silently_default: false,
  sort_order: '0',
};

export default function DSSTelegramSettings() {
  const [definitions, setDefinitions] = useState<TelegramEventDefinition[]>([]);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [rules, setRules] = useState<TelegramNotificationRule[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [chatForm, setChatForm] = useState<ChatForm>(emptyChatForm);
  const [ruleForm, setRuleForm] = useState<RuleForm>({});
  const [webhook, setWebhook] = useState<TelegramWebhookConfig>({ url: '', configured: false });
  const [loading, setLoading] = useState(true);
  const [savingChat, setSavingChat] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [deletingWebhook, setDeletingWebhook] = useState(false);
  const [checkingWebhook, setCheckingWebhook] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<TelegramWebhookInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const loadConfig = async (preferredChatId?: number | null) => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post('/dss/telegram/config');
      const payload = response.data.data;
      const nextDefinitions: TelegramEventDefinition[] = payload.definitions ?? [];
      const nextChats: TelegramChat[] = payload.chats ?? [];
      const nextRules: TelegramNotificationRule[] = payload.notifications ?? [];
      const nextWebhook: TelegramWebhookConfig = payload.webhook ?? { url: '', configured: false };
      const nextSelectedChatId = preferredChatId ?? selectedChatId ?? nextChats[0]?.id ?? null;

      setDefinitions(nextDefinitions);
      setChats(nextChats);
      setRules(nextRules);
      setWebhook(nextWebhook);
      setSelectedChatId(nextSelectedChatId);

      const chat = nextChats.find((item) => item.id === nextSelectedChatId) ?? null;
      setChatForm(chat ? mapChatToForm(chat) : emptyChatForm);
      setRuleForm(buildRuleForm(nextDefinitions, nextRules, nextSelectedChatId));
    } catch (loadError) {
      console.error('Не удалось загрузить настройки Telegram DSS:', loadError);
      setError('Не удалось загрузить настройки Telegram.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  useEffect(() => {
    setChatForm(selectedChat ? mapChatToForm(selectedChat) : emptyChatForm);
    setRuleForm(buildRuleForm(definitions, rules, selectedChatId));
  }, [selectedChatId, definitions, rules, selectedChat]);

  const handleChatFieldChange = (field: keyof ChatForm, value: string | boolean) => {
    setChatForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRuleFieldChange = (
    eventKey: string,
    field: 'is_enabled' | 'send_silently' | 'cooldown_minutes',
    value: boolean | string,
  ) => {
    setRuleForm((prev) => ({
      ...prev,
      [eventKey]: {
        ...prev[eventKey],
        [field]: value,
      },
    }));
  };

  const handleSaveChat = async () => {
    if (!chatForm.name.trim() || !chatForm.chat_id.trim()) {
      toast.error('Укажите название чата и chat_id.');
      return;
    }

    try {
      setSavingChat(true);
      const response = await axios.post('/dss/telegram/chats/save', {
        id: chatForm.id,
        name: chatForm.name.trim(),
        chat_id: chatForm.chat_id.trim(),
        description: chatForm.description.trim() || null,
        message_thread_id: chatForm.message_thread_id.trim() ? Number(chatForm.message_thread_id) : null,
        is_enabled: chatForm.is_enabled,
        send_silently_default: chatForm.send_silently_default,
        sort_order: Number(chatForm.sort_order || 0),
      });

      const chatId = response.data.data?.id ?? chatForm.id ?? null;
      toast.success('Чат Telegram сохранён');
      await loadConfig(chatId);
    } catch (saveError: any) {
      toast.error(saveError.response?.data?.message || saveError.response?.data?.error || 'Не удалось сохранить чат');
    } finally {
      setSavingChat(false);
    }
  };

  const handleDeleteChat = async () => {
    if (!selectedChat) {
      return;
    }

    try {
      setSavingChat(true);
      await axios.post('/dss/telegram/chats/delete', { id: selectedChat.id });
      toast.success('Чат Telegram удалён');
      await loadConfig(null);
    } catch (deleteError: any) {
      toast.error(deleteError.response?.data?.message || deleteError.response?.data?.error || 'Не удалось удалить чат');
    } finally {
      setSavingChat(false);
    }
  };

  const handleTestChat = async () => {
    if (!selectedChat) {
      toast.error('Выберите чат для тестовой отправки');
      return;
    }

    try {
      setSendingTest(true);
      await axios.post('/dss/telegram/chats/test', { id: selectedChat.id });
      toast.success('Тестовое сообщение отправлено');
      await loadConfig(selectedChat.id);
    } catch (testError: any) {
      toast.error(testError.response?.data?.message || testError.response?.data?.error || 'Не удалось отправить тест');
    } finally {
      setSendingTest(false);
    }
  };

  const handleSaveRules = async () => {
    if (!selectedChat) {
      toast.error('Сначала выберите или создайте чат');
      return;
    }

    try {
      setSavingRules(true);
      await axios.post('/dss/telegram/notifications/save', {
        chat_id: selectedChat.id,
        notifications: definitions.map((definition) => ({
          event_key: definition.key,
          is_enabled: ruleForm[definition.key]?.is_enabled ?? definition.default_enabled,
          send_silently: ruleForm[definition.key]?.send_silently ?? definition.default_send_silently,
          cooldown_minutes: Number(ruleForm[definition.key]?.cooldown_minutes ?? definition.default_cooldown_minutes),
        })),
      });

      toast.success('Правила уведомлений сохранены');
      await loadConfig(selectedChat.id);
    } catch (saveError: any) {
      toast.error(saveError.response?.data?.message || saveError.response?.data?.error || 'Не удалось сохранить правила');
    } finally {
      setSavingRules(false);
    }
  };

  const handleSetWebhook = async () => {
    try {
      setSettingWebhook(true);
      const response = await axios.post('/dss/telegram/webhook/set');
      toast.success(response.data?.message || 'Webhook Telegram установлен');
      await loadConfig(selectedChatId);
    } catch (setWebhookError: any) {
      toast.error(setWebhookError.response?.data?.message || setWebhookError.response?.data?.error || 'Не удалось установить webhook');
    } finally {
      setSettingWebhook(false);
    }
  };

  const handleDeleteWebhook = async () => {
    try {
      setDeletingWebhook(true);
      const response = await axios.delete('/dss/telegram/webhook');
      toast.success(response.data?.message || 'Webhook Telegram удалён');
      await loadConfig(selectedChatId);
    } catch (deleteWebhookError: any) {
      toast.error(deleteWebhookError.response?.data?.message || deleteWebhookError.response?.data?.error || 'Не удалось удалить webhook');
    } finally {
      setDeletingWebhook(false);
    }
  };

  const handleCheckWebhook = async () => {
    try {
      setCheckingWebhook(true);
      const response = await axios.get('/dss/telegram/webhook/info');
      setWebhookInfo(response.data?.data ?? null);
      toast.success('Информация о webhook обновлена');
    } catch (webhookInfoError: any) {
      toast.error(webhookInfoError.response?.data?.message || webhookInfoError.response?.data?.error || 'Не удалось получить состояние webhook');
    } finally {
      setCheckingWebhook(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">Загрузка Telegram настроек...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Telegram уведомления DSS
          </CardTitle>
          <CardDescription>
            Чаты и правила доставки для всех Telegram-событий DSS и смежных операционных уведомлений.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Ошибка загрузки</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mb-6 rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">Webhook Telegram</div>
                <div className="text-sm text-muted-foreground">
                  Для Bot API будет использоваться адрес из TELEGRAM_WEBHOOK_URL.
                </div>
              </div>
              <Badge variant={webhook.configured ? 'default' : 'secondary'}>
                {webhook.configured ? 'URL настроен' : 'URL не настроен'}
              </Badge>
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="telegram-webhook-url">Webhook URL</Label>
              <Input id="telegram-webhook-url" value={webhook.url || 'TELEGRAM_WEBHOOK_URL не задан'} readOnly />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={handleSetWebhook} disabled={settingWebhook || !webhook.configured}>
                <Send className="mr-2 h-4 w-4" />
                {settingWebhook ? 'Установка...' : 'Установить webhook'}
              </Button>
              <Button variant="secondary" onClick={handleCheckWebhook} disabled={checkingWebhook}>
                <Bell className="mr-2 h-4 w-4" />
                {checkingWebhook ? 'Проверка...' : 'Проверить webhook'}
              </Button>
              <Button variant="outline" onClick={handleDeleteWebhook} disabled={deletingWebhook}>
                <Trash2 className="mr-2 h-4 w-4" />
                {deletingWebhook ? 'Удаление...' : 'Удалить webhook'}
              </Button>
            </div>

            {webhookInfo && (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Активный URL</div>
                  <div className="mt-1 break-all text-sm">{webhookInfo.url || 'Не задан'}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Pending updates</div>
                  <div className="mt-1 text-sm font-medium">{webhookInfo.pending_update_count ?? 0}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">IP Telegram</div>
                  <div className="mt-1 text-sm">{webhookInfo.ip_address || '—'}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Сертификат</div>
                  <div className="mt-1 text-sm">{webhookInfo.has_custom_certificate ? 'Пользовательский' : 'Стандартный'}</div>
                </div>
                <div className="rounded-lg border p-3 md:col-span-2 xl:col-span-4">
                  <div className="text-xs text-muted-foreground">Последняя ошибка</div>
                  <div className="mt-1 text-sm">{webhookInfo.last_error_message || 'Нет ошибок'}</div>
                  {webhookInfo.last_error_date != null && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(webhookInfo.last_error_date)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Чаты назначения</div>
                  <div className="text-sm text-muted-foreground">Один event можно отправлять в несколько чатов через отдельные правила.</div>
                </div>
                <Button variant="outline" onClick={() => { setSelectedChatId(null); setChatForm(emptyChatForm); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Новый чат
                </Button>
              </div>

              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Chat ID</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          Чаты ещё не настроены.
                        </TableCell>
                      </TableRow>
                    ) : chats.map((chat) => (
                      <TableRow
                        key={chat.id}
                        className={`cursor-pointer ${selectedChatId === chat.id ? 'bg-muted/50' : ''}`}
                        onClick={() => setSelectedChatId(chat.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{chat.name}</div>
                          {chat.description && <div className="text-xs text-muted-foreground">{chat.description}</div>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{chat.chat_id}</TableCell>
                        <TableCell>
                          <Badge variant={chat.is_enabled ? 'default' : 'secondary'}>
                            {chat.is_enabled ? 'Активен' : 'Отключён'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Параметры чата</div>
                  <div className="text-sm text-muted-foreground">Чат, topic и базовый режим тихой отправки.</div>
                </div>
                {selectedChat && (
                  <Badge variant="outline">ID {selectedChat.id}</Badge>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="telegram-name">Название</Label>
                <Input id="telegram-name" value={chatForm.name} onChange={(event) => handleChatFieldChange('name', event.target.value)} placeholder="Операторы КПП" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telegram-chat-id">Chat ID</Label>
                <Input id="telegram-chat-id" value={chatForm.chat_id} onChange={(event) => handleChatFieldChange('chat_id', event.target.value)} placeholder="-1001234567890" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="telegram-thread-id">Message thread ID</Label>
                  <Input id="telegram-thread-id" value={chatForm.message_thread_id} onChange={(event) => handleChatFieldChange('message_thread_id', event.target.value)} placeholder="Для topic в forum chat" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telegram-sort-order">Порядок</Label>
                  <Input id="telegram-sort-order" value={chatForm.sort_order} onChange={(event) => handleChatFieldChange('sort_order', event.target.value)} placeholder="0" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="telegram-description">Описание</Label>
                <Textarea id="telegram-description" value={chatForm.description} onChange={(event) => handleChatFieldChange('description', event.target.value)} placeholder="Например, общий чат операторов и службы безопасности" />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  <Checkbox checked={chatForm.is_enabled} onCheckedChange={(checked) => handleChatFieldChange('is_enabled', checked === true)} />
                  <span>Чат активен</span>
                </label>
                <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  <Checkbox checked={chatForm.send_silently_default} onCheckedChange={(checked) => handleChatFieldChange('send_silently_default', checked === true)} />
                  <span>Тихая отправка по умолчанию</span>
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSaveChat} disabled={savingChat}>
                  <Save className="mr-2 h-4 w-4" />
                  {savingChat ? 'Сохранение...' : 'Сохранить чат'}
                </Button>
                <Button variant="outline" onClick={handleTestChat} disabled={!selectedChat || sendingTest}>
                  <Send className="mr-2 h-4 w-4" />
                  {sendingTest ? 'Отправка...' : 'Тест'}
                </Button>
                <Button variant="destructive" onClick={handleDeleteChat} disabled={!selectedChat || savingChat}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Удалить
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Правила уведомлений
            </CardTitle>
            <CardDescription>
              Для каждого чата можно отдельно включать типы событий, тихую доставку и cooldown.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">
              {selectedChat ? `Чат: ${selectedChat.name}` : 'Чат не выбран'}
            </Badge>
            <Button onClick={handleSaveRules} disabled={!selectedChat || savingRules}>
              <Save className="mr-2 h-4 w-4" />
              {savingRules ? 'Сохранение...' : 'Сохранить правила'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedChat ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Нет выбранного чата</AlertTitle>
              <AlertDescription>Создайте новый чат или выберите существующий, чтобы настроить уведомления.</AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Событие</TableHead>
                    <TableHead>Категория</TableHead>
                    <TableHead>Вкл.</TableHead>
                    <TableHead>Тихо</TableHead>
                    <TableHead>Cooldown, мин</TableHead>
                    <TableHead>Последняя отправка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {definitions.map((definition) => {
                    const currentRule = rules.find((rule) => rule.telegram_chat_id === selectedChat.id && rule.event_key === definition.key);
                    const formRule = ruleForm[definition.key];

                    return (
                      <TableRow key={definition.key}>
                        <TableCell>
                          <div className="font-medium">{definition.title}</div>
                          <div className="text-xs text-muted-foreground">{definition.description}</div>
                          {currentRule?.last_error && (
                            <div className="mt-1 text-xs text-destructive">Последняя ошибка: {currentRule.last_error}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{definition.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={formRule?.is_enabled ?? definition.default_enabled}
                            onCheckedChange={(checked) => handleRuleFieldChange(definition.key, 'is_enabled', checked === true)}
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={formRule?.send_silently ?? definition.default_send_silently}
                            onCheckedChange={(checked) => handleRuleFieldChange(definition.key, 'send_silently', checked === true)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={formRule?.cooldown_minutes ?? String(definition.default_cooldown_minutes)}
                            onChange={(event) => handleRuleFieldChange(definition.key, 'cooldown_minutes', event.target.value.replace(/[^\d]/g, ''))}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(currentRule?.last_sent_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function mapChatToForm(chat: TelegramChat): ChatForm {
  return {
    id: chat.id,
    name: chat.name,
    chat_id: chat.chat_id,
    description: chat.description ?? '',
    message_thread_id: chat.message_thread_id ? String(chat.message_thread_id) : '',
    is_enabled: chat.is_enabled,
    send_silently_default: chat.send_silently_default,
    sort_order: String(chat.sort_order ?? 0),
  };
}

function buildRuleForm(
  definitions: TelegramEventDefinition[],
  rules: TelegramNotificationRule[],
  selectedChatId: number | null,
): RuleForm {
  const form: RuleForm = {};

  for (const definition of definitions) {
    const rule = rules.find((item) => item.telegram_chat_id === selectedChatId && item.event_key === definition.key);
    form[definition.key] = {
      is_enabled: rule?.is_enabled ?? definition.default_enabled,
      send_silently: rule?.send_silently ?? definition.default_send_silently,
      cooldown_minutes: String(rule?.cooldown_minutes ?? definition.default_cooldown_minutes),
    };
  }

  return form;
}

function formatDateTime(value?: string | number | null): string {
  if (!value) {
    return '—';
  }

  const normalizedValue = typeof value === 'number' && value < 1_000_000_000_000 ? value * 1000 : value;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('ru-RU');
}