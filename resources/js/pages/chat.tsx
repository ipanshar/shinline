
import React from 'react';
import { type BreadcrumbItem } from '@/types';
import Chat from '@/components/chanel/chat'; 
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'WhatsApp business platform',
        href: '/chat',
    },
];
const App: React.FC = () => {
  return (
   <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Чат" />
      <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min">
           
      <Chat />                
        </div>
    </AppLayout>
  );
};

export default App;
