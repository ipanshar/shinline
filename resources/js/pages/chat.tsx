import React, { useState } from 'react';
import { type BreadcrumbItem } from '@/types';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import ChatList from '@/components/whatsapp/chatList';
import ChatForm from '@/components/whatsapp/chatForm';
import ContactInfo from '@/components/whatsapp/contactInfo';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'WhatsApp Business',
        href: '/chat',
    },
];

// Моковые данные для контактов
const mockContacts = [
  {
    id: 1,
    name: 'Шестеряков Дмитрий',
    phone: '+7(747) 115 64 62',
    lastMessage: '',
    time: '25.10.2025 15:55',
    isOnline: true,
  },
  {
    id: 2,
    name: 'Иван Гринок',
    phone: '+7(702) 306 75 22',
    lastMessage: 'Согласен',
    time: '25.10.2025 16:40',
    isOnline: false,
  },
  {
    id: 3,
    name: 'Абдуллаев Алихан',
    phone: '+7(705) 386 85 16',
    lastMessage: '',
    time: '25.10.2025 16:10',
    isOnline: false,
  },
  {
    id: 4,
    name: 'Касымов Муса',
    phone: '+7(707) 175 47 80',
    lastMessage: '',
    time: '25.10.2025 15:00',
    isOnline: true,
  },
];

// Моковые данные для сообщений
const mockMessages: { [key: number]: any[] } = {
  2: [
    {
      id: 1,
      sender: 'company',
      senderName: 'Shin Line cargo',
      text: `Уведомление о согласии на перевозку груза

Информация о перевозке:

Задание №: 12345
Маршрут: Алматы — Караганда
Особенности транспортировки груза: Нужен рефрижератор
Транспортное средство: B123ABC
Планируемая дата: 2025-11-01
Вознаграждение: 150 000 ₸

Если готовы выполнить заказ, просим нажать согласен
Заявка актуальна 20 часов с момента получения уведомления`,
      time: '25.10.2025 16:30',
    },
    {
      id: 2,
      sender: 'user',
      senderName: 'Иван Гринок',
      text: 'Согласен',
      time: '25.10.2025 16:39',
    },
    {
      id: 3,
      sender: 'company',
      senderName: 'Shin Line cargo',
      text: 'Спасибо, мы зарегистрировали ваше согласие',
      time: '25.10.2025 16:40',
    },
  ],
};

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
  const [selectedContactId, setSelectedContactId] = useState<number | null>(2);
  const [messages, setMessages] = useState(mockMessages);

  const selectedContact = mockContacts.find((c) => c.id === selectedContactId);
  const currentMessages = selectedContactId ? messages[selectedContactId] || [] : [];

  const handleSendMessage = (messageText: string) => {
    if (!selectedContactId) return;

    const newMessage = {
      id: Date.now(),
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
    };

    setMessages({
      ...messages,
      [selectedContactId]: [...(messages[selectedContactId] || []), newMessage],
    });
  };

  return (
   <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="WhatsApp Business" />
      <div className="h-[calc(100vh-8rem)] flex border rounded-lg overflow-hidden">
        {/* Левая панель - список контактов */}
        <ChatList
          contacts={mockContacts}
          selectedContactId={selectedContactId}
          onSelectContact={setSelectedContactId}
        />

        {/* Центральная панель - чат */}
        {selectedContact ? (
          <ChatForm
            contactName={selectedContact.name}
            messages={currentMessages}
            onSendMessage={handleSendMessage}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="text-center text-muted-foreground">
              <p className="text-lg">Выберите контакт для начала общения</p>
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
