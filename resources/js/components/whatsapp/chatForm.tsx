import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Message {
  id: number;
  sender: 'user' | 'company';
  senderName: string;
  text: string;
  time: string;
}

interface ChatFormProps {
  contactName: string;
  messages: Message[];
  onSendMessage: (message: string) => void;
}

const ChatForm: React.FC<ChatFormProps> = ({ contactName, messages, onSendMessage }) => {
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Автоматическая прокрутка вниз при изменении сообщений
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageText.trim()) {
      onSendMessage(messageText);
      setMessageText('');
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
                  {message.sender === 'company' && (
                    <span className="text-xs text-gray-500">Сотрудник: Асанов А</span>
                  )}
                </div>
                <div className="text-sm whitespace-pre-wrap text-gray-800">{message.text}</div>
                <div className="text-xs text-gray-500 mt-2 text-right">
                  {message.time}
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
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Введите сообщение"
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={!messageText.trim()}
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
