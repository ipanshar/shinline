import React, { useState, useEffect } from 'react';
import { type BreadcrumbItem } from '@/types';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import ChatList from '@/components/whatsapp/chatList';
import ChatForm from '@/components/whatsapp/chatForm';
import ContactInfo from '@/components/whatsapp/contactInfo';
import axios from 'axios';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'WhatsApp Business',
        href: '/chat',
    },
];

// Моковые данные для транспорта
const mockVehicles = [
  {
    type: 'Большой грузовик',
    number: '660 AQS 01',
    model: 'HyundaiHD120',
  },
  {
    type: 'Рефрижератор',
    number: '560 FDS 03',
    model: 'MERCedes BENZ ACTROS',
  },
];

// Моковые данные для выполненных заданий
const mockCompletedTasks = [
  {
    route: 'Алматы - Астана',
    taskNumber: '0005656',
    date: '20.10.2025',
  },
  {
    route: 'Алматы - Караганда',
    taskNumber: '0005458',
    date: '18.10.2025',
  },
];

const App: React.FC = () => {
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Загрузка списка чатов (контрагентов)
  useEffect(() => {
    loadChatLists();
    
    // Проверяем, есть ли chat_id в URL параметрах
    const urlParams = new URLSearchParams(window.location.search);
    const chatIdParam = urlParams.get('chat_id');
    if (chatIdParam) {
      setSelectedChatId(parseInt(chatIdParam));
    }
  }, []);

  // Загрузка сообщений при выборе чата
  useEffect(() => {
    if (selectedChatId) {
      loadMessages(selectedChatId);
    }
  }, [selectedChatId]);

  const loadChatLists = async () => {
    try {
      const response = await axios.post('/counterparty/chat/getlists');
      if (response.data.status) {
        // Преобразуем данные в формат для ChatList компонента
        const formattedContacts = response.data.data.map((chat: any) => ({
          id: chat.id,
          name: chat.counterparty_name || chat.user_name || chat.user_whatsapp,
          phone: chat.user_whatsapp,
          lastMessage: '',
          time: chat.last_time_message ? new Date(chat.last_time_message).toLocaleString('ru-RU') : '',
          isOnline: false,
          user_id: chat.user_id || null,
        }));
        setContacts(formattedContacts);
      }
    } catch (error) {
      console.error('Ошибка загрузки чатов:', error);
    }
  };

  const loadMessages = async (chatId: number) => {
    setLoading(true);
    try {
      const response = await axios.post('/counterparty/chat/getmessages', {
        chat_list_id: chatId
      });
      if (response.data.status) {
        // Преобразуем данные в формат для ChatForm компонента
        const formattedMessages = response.data.data.map((msg: any) => ({
          id: msg.id,
          sender: msg.direction === 'outgoing' ? 'company' : 'user',
          senderName: msg.direction === 'outgoing' ? 'Shin Line cargo' : (msg.user_name || 'Контрагент'),
          text: msg.message,
          time: new Date(msg.created_at).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
          user_name: msg.user_name || '',
          user_id: msg.user_id || null,
        }));
        setMessages(formattedMessages);
      }
    } catch (error) {
      console.error('Ошибка загрузки сообщений:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedContact = contacts.find((c) => c.id === selectedChatId);

  const handleSendMessage = async (messageText: string) => {
    if (!selectedChatId) return;

    try {
      const response = await axios.post('/counterparty/chat/sendmessage', {
        chat_list_id: selectedChatId,
        message: messageText
      });

      if (response.data.status) {
        // Добавляем новое сообщение в список
        const newMessage = {
          id: response.data.data.id,
          sender: 'company' as const,
          senderName: 'Shin Line cargo',
          text: messageText,
          time: new Date().toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
          user_name: response.data.data.user?.name || 'Оператор',
          user_id: response.data.data.user_id || null,
        };
        setMessages([...messages, newMessage]);
      }
    } catch (error) {
      console.error('Ошибка отправки сообщения:', error);
      alert('Ошибка при отправке сообщения');
    }
  };

  return (
   <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="WhatsApp Business" />
      <div className="h-[calc(100vh-8rem)] flex border rounded-lg overflow-hidden">
        {/* Левая панель - список контактов */}
        <ChatList
          contacts={contacts}
          selectedContactId={selectedChatId}
          onSelectContact={setSelectedChatId}
        />

        {/* Центральная панель - чат */}
        {selectedContact ? (
          <ChatForm
            contactName={selectedContact.name}
            messages={messages}
            onSendMessage={handleSendMessage}
            user_whatsapp={selectedContact.phone}
            currentUserId={1} // TODO: Получить из auth.user.id
            onTaskSent={() => loadMessages(selectedChatId!)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="text-center text-muted-foreground">
              <p className="text-lg">
                {contacts.length === 0 
                  ? 'Нет чатов. Добавьте контрагента с WhatsApp номером в разделе "Справочники"'
                  : 'Выберите контакт для начала общения'
                }
              </p>
            </div>
          </div>
        )}

        {/* Правая панель - информация о контакте */}
        {selectedContact && (
          <ContactInfo vehicles={mockVehicles} completedTasks={mockCompletedTasks} />
        )}
      </div>
    </AppLayout>
  );
};

export default App;
