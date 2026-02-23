import { useState } from "react";
import { Head } from "@inertiajs/react";
import AppLayout from "@/layouts/app-layout";
import { type BreadcrumbItem } from "@/types";
import SecurityCheckMobile from "@/components/check/SecurityCheckMobile";
import VisitorHistory from "@/components/check/VisitorHistory";
import EntryPermitsManager from "@/components/check/EntryPermitsManager";
import { Shield, History, KeyRound } from "lucide-react";

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: "КПП",
    href: "/check",
  },
];

type TabType = 'checkpoint' | 'history' | 'permits';

export default function Check() {
  const [activeTab, setActiveTab] = useState<TabType>('checkpoint');

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="КПП - Охрана" />
      <div className="flex h-full flex-1 flex-col">
        {/* Вкладки */}
        <div className="bg-white dark:bg-gray-800 border-b sticky top-0 z-30">
          <div className="flex">
            <button
              onClick={() => setActiveTab('checkpoint')}
              className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 flex items-center justify-center gap-2 font-medium text-sm sm:text-base transition-colors ${
                activeTab === 'checkpoint'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50'
              }`}
            >
              <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>КПП</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 flex items-center justify-center gap-2 font-medium text-sm sm:text-base transition-colors ${
                activeTab === 'history'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50'
              }`}
            >
              <History className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>История</span>
            </button>
            <button
              onClick={() => setActiveTab('permits')}
              className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 flex items-center justify-center gap-2 font-medium text-sm sm:text-base transition-colors ${
                activeTab === 'permits'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50'
              }`}
            >
              <KeyRound className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Разрешения</span>
            </button>
          </div>
        </div>

        {/* Содержимое вкладок */}
        {activeTab === 'checkpoint' && <SecurityCheckMobile />}
        {activeTab === 'history' && <VisitorHistory />}
        {activeTab === 'permits' && <EntryPermitsManager />}
      </div>
    </AppLayout>
  );
}
