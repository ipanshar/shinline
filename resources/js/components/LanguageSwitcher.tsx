import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: 'ru' | 'kz') => {
    i18n.changeLanguage(lng);
    localStorage.setItem('i18nextLng', lng);
  };

  return (
    <div className="flex gap-2 justify-end p-2">
      <button
        onClick={() => changeLanguage('ru')}
        className={`px-3 py-1 rounded border cursor-pointer ${
          i18n.language === 'ru' ? 'bg-gray-300 ' : 'bg-white'
        } `}
      >
        Рус
      </button>
      <button
        onClick={() => changeLanguage('kz')}
        className={`px-3 py-1 rounded border cursor-pointer ${
          i18n.language === 'kz' ? 'bg-gray-300' : 'bg-white'
        }`}
      >
        Қаз
      </button>
    </div>
  );
};

export default LanguageSwitcher;
