import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher2: React.FC = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: 'ru' | 'kz') => {
    i18n.changeLanguage(lng);
    localStorage.setItem('i18nextLng', lng);
  };

  return (
    <div className="flex gap-1 px-2 py-1 text-sm text-gray-700">
      <button
        onClick={() => changeLanguage('ru')}
        className={`px-2 py-0.5 rounded ${
          i18n.language === 'ru' ? 'bg-gray-100 font-medium' : ''
        } hover:bg-gray-100`}
      >
        Рус
      </button>
      <span className="text-gray-400">/</span>
      <button
        onClick={() => changeLanguage('kz')}
        className={`px-2 py-0.5 rounded ${
          i18n.language === 'kz' ? 'bg-gray-100 font-medium' : ''
        } hover:bg-gray-100`}
      >
        Қаз
      </button>
    </div>
  );
};

export default LanguageSwitcher2;
