import React, { useState, useEffect, useRef } from 'react';
import { Send, Search, Check, CheckCheck, Clock, AlertCircle, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import axios from 'axios';

interface Message {
  id: number;
  sender: 'user' | 'company';
  senderName: string;
  text: string;
  time: string;
  created_at?: string; // Raw ISO timestamp for calculations
  user_name: string;
  user_id?: number;
  status?: string; // processing, sent, delivered, read, failed
  response_to_message_id?: string;
  original_message?: {
    message: string;
    created_at: string;
    direction: string;
    user_name?: string;
  };
}

interface Task {
  id: number;
  name: string;
  description: string;
  status_name: string;
  user_name: string;
  truck_plate_number: string;
}

interface ChatFormProps {
  contactName: string;
  messages: Message[];
  onSendMessage: (message: string) => void;
  user_whatsapp?: string; // WhatsApp номер пользователя, с которым ведется чат
  currentUserId?: number; // ID текущего пользователя (сотрудника)
  onTaskSent?: () => void; // Callback для обновления сообщений после отправки задания
}

const ChatForm: React.FC<ChatFormProps> = ({ contactName, messages, onSendMessage, user_whatsapp, currentUserId, onTaskSent }) => {
  const [messageText, setMessageText] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);
  const [isSendingTemplate, setIsSendingTemplate] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Функция для отображения иконки статуса сообщения
  const renderMessageStatus = (status?: string) => {
    if (!status) return null;
    
    switch (status) {
      case 'processing':
        return <span title="Обрабатывается"><Clock className="h-3 w-3 text-gray-400" /></span>;
      case 'sent':
        return <span title="Отправлено"><Check className="h-3 w-3 text-gray-500" /></span>;
      case 'delivered':
        return <span title="Доставлено"><CheckCheck className="h-3 w-3 text-gray-500" /></span>;
      case 'read':
        return <span title="Прочитано"><CheckCheck className="h-3 w-3 text-blue-500" /></span>;
      case 'failed':
        return <span title="Ошибка отправки"><AlertCircle className="h-3 w-3 text-red-500" /></span>;
      default:
        return null;
    }
  };

  // Автоматическая прокрутка вниз при изменении сообщений
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Загрузка задач при монтировании компонента
  useEffect(() => {
    loadTasks();
  }, []);

  // Фильтрация задач по поисковому запросу
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredTasks(tasks);
    } else {
      const filtered = tasks.filter(task =>
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.truck_plate_number?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredTasks(filtered);
    }
  }, [searchQuery, tasks]);

  // Закрытие dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTaskDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Загрузка задач с сервера
  const loadTasks = async () => {
    try {
      const response = await axios.post('/task/gettasks', {
        // Можно добавить фильтры, например только активные задачи
      });
      if (response.data.status) {
        setTasks(response.data.data);
        setFilteredTasks(response.data.data);
      }
    } catch (error) {
      console.error('Ошибка при загрузке задач:', error);
    }
  };

  // Проверяем, прошло ли более 24 часов с последнего сообщения от клиента
  const isInputDisabled = () => {
    if (messages.length === 0) {
      return true; // Блокируем, если нет сообщений - нужно начать с выбора задания
    }

    // Ищем последнее сообщение от клиента (sender === 'user')
    // Массив messages обычно отсортирован по времени, поэтому ищем с конца
    let lastUserMessage = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === 'user') {
        lastUserMessage = messages[i];
        break;
      }
    }

    // Если нет сообщений от клиента, окно диалога закрыто
    if (!lastUserMessage) {
      return true;
    }

    // Используем created_at если есть (ISO формат), иначе пытаемся парсить time (может быть ненадежно)
    const messageTimeStr = lastUserMessage.created_at || lastUserMessage.time;
    const lastMessageTime = new Date(messageTimeStr);
    const now = new Date();
    
    // Вычисляем разницу в часах
    const diffInHours = (now.getTime() - lastMessageTime.getTime()) / (1000 * 60 * 60);
    
    return diffInHours > 24;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageText.trim()) {
      let finalMessage = messageText;
      
      // Если выбрана задача, добавляем информацию о ней в сообщение
      if (selectedTask) {
        finalMessage = `📦 Задание №${selectedTask.name}\n${selectedTask.description ? selectedTask.description + '\n' : ''}🚛 ТС: ${selectedTask.truck_plate_number || 'Не указано'}\n\n${messageText}`;
      }
      
      onSendMessage(finalMessage);
      setMessageText('');
      setSelectedTask(null);
      setSearchQuery('');
    }
  };

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task);
    setShowTaskDropdown(false);
    setSearchQuery('');
  };

  // Отправка шаблона задания через WhatsApp
  const handleSendTaskTemplate = async () => {
    if (!selectedTask) {
      console.error('Задание не выбрано');
      return;
    }

    // Используем WhatsApp номер напрямую
    const whatsappNumber = user_whatsapp;
    let senderUserId = currentUserId;

    // Если currentUserId не передан, используем ID из последнего исходящего сообщения
    if (!senderUserId && messages.length > 0) {
      const lastOutgoingMessage = messages.find(m => m.sender === 'company');
      if (lastOutgoingMessage) {
        senderUserId = lastOutgoingMessage.user_id;
      }
    }

    if (!whatsappNumber || !senderUserId) {
      console.error('Не удалось определить данные пользователей', {
        whatsappNumber,
        senderUserId,
        user_whatsapp,
        currentUserId
      });
      return;
    }

    setIsSendingTemplate(true);
    try {
      console.log('Отправка шаблона задания:', {
        task_id: selectedTask.id,
        whatsapp_number: whatsappNumber,
        user_id: senderUserId
      });
      
      const response = await axios.post('/whatsapp/send-task', {
        task_id: selectedTask.id,
        whatsapp_number: whatsappNumber,
        user_id: senderUserId
      });

      console.log('Ответ от сервера:', response.data);

      if (response.data.status) {
        if (response.data.error_count > 0) {
          console.error('Ошибки при отправке:', response.data.message);
          alert(`Внимание: ${response.data.message}`);
        } else {
          console.log('Шаблон успешно отправлен');
        }
        
        // Успешно отправлено
        setSelectedTask(null);
        setSearchQuery('');
        
        // Вызываем callback для обновления списка сообщений
        if (onTaskSent) {
          onTaskSent();
        }
      }
    } catch (error) {
      console.error('Ошибка при отправке шаблона задания:', error);
      alert('Ошибка при отправке шаблона задания');
    } finally {
      setIsSendingTemplate(false);
    }
  };

  // Обработка выбора файла
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Проверка размера (16MB максимум)
      if (file.size > 16 * 1024 * 1024) {
        alert('Файл слишком большой. Максимальный размер: 16 МБ');
        return;
      }
      setSelectedFile(file);
    }
  };

  // Отправка файла
  const handleSendFile = async () => {
    if (!selectedFile || !user_whatsapp) {
      return;
    }

    let senderUserId = currentUserId;
    if (!senderUserId && messages.length > 0) {
      const lastOutgoingMessage = messages.find(m => m.sender === 'company');
      if (lastOutgoingMessage) {
        senderUserId = lastOutgoingMessage.user_id;
      }
    }

    if (!senderUserId) {
      alert('Не удалось определить пользователя');
      return;
    }

    setIsSendingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('whatsapp_number', user_whatsapp);
      formData.append('user_id', senderUserId.toString());
      
      // Добавляем подпись если есть текст
      if (messageText.trim()) {
        formData.append('caption', messageText.trim());
      }

      const response = await axios.post('/whatsapp/send-media', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.status) {
        console.log('Файл успешно отправлен');
        setSelectedFile(null);
        setMessageText('');
        
        // Обновляем список сообщений
        if (onTaskSent) {
          onTaskSent();
        }
      } else {
        alert('Ошибка при отправке файла: ' + response.data.message);
      }
    } catch (error) {
      console.error('Ошибка при отправке файла:', error);
      alert('Ошибка при отправке файла');
    } finally {
      setIsSendingFile(false);
      // Сбрасываем input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full">
      {/* Заголовок чата */}
      <div className="border-b p-4 bg-white shadow-sm">
        <h2 className="font-semibold text-lg text-gray-900">{contactName}</h2>
      </div>

      {/* Сообщения */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex',
                message.sender === 'company' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-md p-3 rounded-lg shadow-sm border',
                  message.sender === 'company'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-white border-gray-200'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm text-gray-900">{message.senderName}</span>
                  {message.user_name && message.sender === 'company' && (
                    <span className="text-xs text-gray-500">Отправитель: {message.user_name}</span>
                  )}
                  {message.user_name && message.sender === 'user' && (
                    <span className="text-xs text-gray-500">Ответственный: {message.user_name}</span>
                  )}
                </div>
                
                {/* Отображение исходного сообщения, если это ответ */}
                {message.original_message && (
                  <div className="mb-2 p-2 bg-gray-100 border-l-4 border-blue-500 rounded text-xs">
                    <div className="font-semibold text-gray-700 mb-1">
                      ↩️ В ответ на {message.original_message.direction === 'outgoing' ? 'сообщение компании' : 'ваше сообщение'}:
                    </div>
                    <div 
                      className="text-gray-600 italic overflow-hidden"
                      style={{ 
                        display: '-webkit-box', 
                        WebkitLineClamp: 3, 
                        WebkitBoxOrient: 'vertical',
                        maxHeight: '4.5em'
                      }}
                      dangerouslySetInnerHTML={{ __html: message.original_message.message }}
                    />
                    <div className="text-gray-500 mt-1">
                      {new Date(message.original_message.created_at).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                )}
                
                <div 
                  className="text-sm text-gray-800"
                  dangerouslySetInnerHTML={{ __html: message.text }}
                />
                <div className="text-xs text-gray-500 mt-2 flex items-center justify-end gap-1">
                  <span>{message.time}</span>
                  {message.sender === 'company' && renderMessageStatus(message.status)}
                </div>
              </div>
            </div>
          ))}
          {/* Якорь для автопрокрутки */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Поле ввода */}
      <div className="border-t p-4 bg-white shadow-sm">
        {isInputDisabled() && (
          <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            {messages.length === 0 ? (
              <>⚠️ Начните диалог с отправки задания. Выберите задание выше и нажмите "Отправить задание".</>
            ) : (
              <>⚠️ Чат закрыт. Прошло более 24 часов с последнего ответа клиента. Начните новый диалог с отправки задания.</>
            )}
          </div>
        )}
        
        {/* Отображение выбранного файла */}
        {selectedFile && (
          <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-blue-600" />
                <div>
                  <div className="text-sm font-semibold text-blue-900">{selectedFile.name}</div>
                  <div className="text-xs text-blue-600">
                    {(selectedFile.size / 1024).toFixed(1)} КБ
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSendFile}
                  disabled={isSendingFile}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSendingFile ? 'Отправка...' : 'Отправить'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {/* Выбор задачи */}
        <div className="mb-3 relative" ref={dropdownRef}>
          {selectedTask ? (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-2">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <span className="text-sm font-semibold text-blue-900">
                    📦 Задание №{selectedTask.name}
                  </span>
                  {selectedTask.description && (
                    <p className="text-xs text-blue-700 mt-1">{selectedTask.description}</p>
                  )}
                  {selectedTask.truck_plate_number && (
                    <p className="text-xs text-blue-600 mt-1">
                      🚛 ТС: {selectedTask.truck_plate_number}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSendTaskTemplate}
                    disabled={isSendingTemplate}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isSendingTemplate ? 'Отправка...' : 'Отправить задание'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTask(null)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowTaskDropdown(true);
                    }}
                    onFocus={() => setShowTaskDropdown(true)}
                    placeholder="Найти задание..."
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Dropdown со списком задач */}
              {showTaskDropdown && filteredTasks.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => handleTaskSelect(task)}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-semibold text-sm text-gray-900">
                        №{task.name}
                      </div>
                      {task.description && (
                        <div className="text-xs text-gray-600 mt-1">
                          {task.description}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {task.truck_plate_number && (
                          <span>🚛 {task.truck_plate_number}</span>
                        )}
                        {task.status_name && (
                          <span className="px-2 py-0.5 bg-gray-100 rounded">
                            {task.status_name}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showTaskDropdown && searchQuery && filteredTasks.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500 text-sm">
                  Задачи не найдены
                </div>
              )}
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isInputDisabled() || isSendingFile}
            title="Прикрепить файл"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={
              isInputDisabled() 
                ? (messages.length === 0 ? "Начните с выбора задания" : "Чат закрыт") 
                : selectedFile
                ? "Добавьте подпись к файлу (необязательно)"
                : "Введите сообщение"
            }
            className="flex-1"
            disabled={isInputDisabled()}
          />
          <Button
            type="submit"
            disabled={!messageText.trim() || isInputDisabled()}
            size="icon"
            className="bg-red-600 hover:bg-red-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatForm;
