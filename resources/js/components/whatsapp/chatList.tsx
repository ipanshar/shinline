import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Contact {
  id: number;
  name: string;
  phone: string;
  lastMessage: string;
  time: string;
  isOnline: boolean;
  unread?: number;
}

interface ChatListProps {
  contacts: Contact[];
  selectedContactId: number | null;
  onSelectContact: (contactId: number) => void;
}

const ChatList: React.FC<ChatListProps> = ({ contacts, selectedContactId, onSelectContact }) => {
  return (
    <div className="w-64 border-r bg-white flex flex-col h-full">
      {/* Заголовок */}
      <div className="bg-red-600 text-white p-4 border-b shadow-sm">
        <div className="font-bold text-lg">WhatsApp Business</div>
        <div className="text-sm mt-1 opacity-90">+77022630436</div>
      </div>

      {/* Список контактов */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-2 space-y-1">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              onClick={() => onSelectContact(contact.id)}
              className={cn(
                'p-3 rounded-lg cursor-pointer transition-colors hover:bg-blue-50 border',
                selectedContactId === contact.id 
                  ? 'bg-blue-50 border-blue-200' 
                  : 'bg-white border-gray-200'
              )}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2 flex-1">
                  <span className="font-semibold text-sm text-gray-900">{contact.name}</span>
                  {contact.isOnline && (
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  )}
                </div>
                <span className="text-xs text-gray-500">{contact.time}</span>
              </div>
              
              <div className="text-xs text-gray-600 mb-1">{contact.phone}</div>
              
              {contact.lastMessage && (
                <div className="text-sm text-gray-500 truncate">
                  {contact.lastMessage}
                </div>
              )}
              
              {contact.unread && contact.unread > 0 && (
                <div className="mt-2">
                  <Badge variant="default" className="bg-red-600 hover:bg-red-700">
                    {contact.unread}
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatList;
