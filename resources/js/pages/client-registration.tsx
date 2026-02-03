import { Head } from '@inertiajs/react';
import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import shinLogo from '../../images/shin-line-logo.png';

interface FormData {
    full_name: string;
    iin: string;
    birth_date: string;
    phone: string;
    address: string;
}

interface FormErrors {
    full_name?: string[];
    iin?: string[];
    birth_date?: string[];
    phone?: string[];
    address?: string[];
}

export default function ClientRegistration() {
    // Получаем параметры из URL
    const urlParams = new URLSearchParams(window.location.search);
    const phoneFromUrl = urlParams.get('phone') || '';
    const isPhoneLocked = urlParams.get('locked') === '1';
    
    // Форматируем номер телефона из URL
    const formatPhoneFromUrl = (phone: string): string => {
        if (!phone) return '+7';
        // Убираем все кроме цифр
        const digits = phone.replace(/\D/g, '');
        // Добавляем + в начало если нужно
        return digits.startsWith('7') ? '+' + digits : '+7' + digits;
    };

    const [formData, setFormData] = useState<FormData>({
        full_name: '',
        iin: '',
        birth_date: '',
        phone: formatPhoneFromUrl(phoneFromUrl),
        address: '',
    });

    const [errors, setErrors] = useState<FormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        // Специальная обработка для ИИН - только цифры, максимум 12
        if (name === 'iin') {
            const numericValue = value.replace(/\D/g, '').slice(0, 12);
            setFormData(prev => ({ ...prev, [name]: numericValue }));
        }
        // Специальная обработка для телефона (если не заблокировано)
        else if (name === 'phone') {
            // Если телефон заблокирован, не меняем
            if (isPhoneLocked) return;
            
            // Удаляем все кроме цифр и +
            let phoneValue = value.replace(/[^\d+]/g, '');
            // Если начинается не с +, добавляем +7
            if (!phoneValue.startsWith('+')) {
                phoneValue = '+7' + phoneValue.replace(/^\+?7?/, '');
            }
            setFormData(prev => ({ ...prev, [name]: phoneValue }));
        }
        else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
        
        // Очищаем ошибку при изменении поля
        if (errors[name as keyof FormErrors]) {
            setErrors(prev => ({ ...prev, [name]: undefined }));
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrors({});

        try {
            const response = await fetch('/client-registration', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.errors) {
                    setErrors(data.errors);
                }
                return;
            }

            setIsSuccess(true);
            setSuccessMessage(data.message || 'Данные успешно сохранены!');
            setFormData({
                full_name: '',
                iin: '',
                birth_date: '',
                phone: '+7',
                address: '',
            });
        } catch (error) {
            console.error('Ошибка отправки:', error);
            setErrors({ full_name: ['Произошла ошибка при отправке. Попробуйте позже.'] });
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setIsSuccess(false);
        setSuccessMessage('');
        setErrors({});
    };

    return (
        <>
            <Head title="Регистрация клиента">
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600" rel="stylesheet" />
            </Head>
            
            <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-slate-900 flex flex-col">
                {/* Header */}
                <header className="w-full py-4 px-4 sm:px-6 bg-red-600 shadow-lg">
                    <div className="max-w-lg mx-auto flex items-center justify-center">
                        <img 
                            src={shinLogo} 
                            alt="Шин-Лайн" 
                            className="h-12 sm:h-14 object-contain brightness-0 invert"
                        />
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-6">
                    <div className="w-full max-w-lg">
                        {isSuccess ? (
                            /* Success Message */
                            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 sm:p-8 text-center animate-fade-in">
                                <div className="w-20 h-20 mx-auto mb-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                                    <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h2 className="text-2xl font-semibold text-slate-800 dark:text-white mb-3">
                                    Спасибо за регистрацию!
                                </h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">
                                    {successMessage}
                                </p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Ваши данные успешно сохранены. Мы свяжемся с вами в ближайшее время.
                                </p>
                            </div>
                        ) : (
                            /* Registration Form */
                            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
                                {/* Form Header */}
                                <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-5 sm:px-8 sm:py-6">
                                    <h1 className="text-xl sm:text-2xl font-semibold text-white">
                                        Регистрация кандидата
                                    </h1>
                                    <p className="text-red-100 text-sm sm:text-base mt-1">
                                        Заполните форму для регистрации
                                    </p>
                                </div>

                                {/* Form Body */}
                                <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
                                    {/* ФИО */}
                                    <div>
                                        <label 
                                            htmlFor="full_name" 
                                            className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2"
                                        >
                                            ФИО <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            id="full_name"
                                            name="full_name"
                                            value={formData.full_name}
                                            onChange={handleChange}
                                            placeholder="Иванов Иван Иванович"
                                            className={`w-full px-4 py-3.5 text-base border rounded-xl transition-all duration-200 
                                                bg-slate-50 dark:bg-slate-700 
                                                text-slate-900 dark:text-white 
                                                placeholder:text-slate-400 dark:placeholder:text-slate-500
                                                focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                                                ${errors.full_name ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-600'}`}
                                            autoComplete="name"
                                        />
                                        {errors.full_name && (
                                            <p className="mt-2 text-sm text-red-500">{errors.full_name[0]}</p>
                                        )}
                                    </div>

                                    {/* ИИН */}
                                    <div>
                                        <label 
                                            htmlFor="iin" 
                                            className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2"
                                        >
                                            ИИН <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            id="iin"
                                            name="iin"
                                            value={formData.iin}
                                            onChange={handleChange}
                                            placeholder="123456789012"
                                            inputMode="numeric"
                                            maxLength={12}
                                            className={`w-full px-4 py-3.5 text-base border rounded-xl transition-all duration-200 
                                                bg-slate-50 dark:bg-slate-700 
                                                text-slate-900 dark:text-white 
                                                placeholder:text-slate-400 dark:placeholder:text-slate-500
                                                focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                                                ${errors.iin ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-600'}`}
                                        />
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {formData.iin.length}/12 цифр
                                        </p>
                                        {errors.iin && (
                                            <p className="mt-1 text-sm text-red-500">{errors.iin[0]}</p>
                                        )}
                                    </div>

                                    {/* Дата рождения */}
                                    <div>
                                        <label 
                                            htmlFor="birth_date" 
                                            className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2"
                                        >
                                            Дата рождения <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            id="birth_date"
                                            name="birth_date"
                                            value={formData.birth_date}
                                            onChange={handleChange}
                                            max={new Date().toISOString().split('T')[0]}
                                            min="1900-01-01"
                                            className={`w-full px-4 py-3.5 text-base border rounded-xl transition-all duration-200 
                                                bg-slate-50 dark:bg-slate-700 
                                                text-slate-900 dark:text-white 
                                                placeholder:text-slate-400 dark:placeholder:text-slate-500
                                                focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                                                ${errors.birth_date ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-600'}`}
                                        />
                                        {errors.birth_date && (
                                            <p className="mt-2 text-sm text-red-500">{errors.birth_date[0]}</p>
                                        )}
                                    </div>

                                    {/* Телефон */}
                                    <div>
                                        <label 
                                            htmlFor="phone" 
                                            className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2"
                                        >
                                            Номер телефона <span className="text-red-500">*</span>
                                            {isPhoneLocked && (
                                                <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                                                    ✓ заполнен автоматически
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            type="tel"
                                            id="phone"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleChange}
                                            placeholder="+7 777 123 45 67"
                                            inputMode="tel"
                                            readOnly={isPhoneLocked}
                                            disabled={isPhoneLocked}
                                            className={`w-full px-4 py-3.5 text-base border rounded-xl transition-all duration-200 
                                                ${isPhoneLocked 
                                                    ? 'bg-slate-100 dark:bg-slate-600 cursor-not-allowed opacity-75' 
                                                    : 'bg-slate-50 dark:bg-slate-700'
                                                }
                                                text-slate-900 dark:text-white 
                                                placeholder:text-slate-400 dark:placeholder:text-slate-500
                                                focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                                                ${errors.phone ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-600'}`}
                                            autoComplete="tel"
                                        />
                                        {isPhoneLocked && (
                                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                🔒 Номер телефона получен из WhatsApp
                                            </p>
                                        )}
                                        {errors.phone && (
                                            <p className="mt-2 text-sm text-red-500">{errors.phone[0]}</p>
                                        )}
                                    </div>

                                    {/* Адрес */}
                                    <div>
                                        <label 
                                            htmlFor="address" 
                                            className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2"
                                        >
                                            Адрес проживания <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            id="address"
                                            name="address"
                                            value={formData.address}
                                            onChange={handleChange}
                                            placeholder="г. Алматы, ул. Абая, д. 10, кв. 5"
                                            rows={3}
                                            className={`w-full px-4 py-3.5 text-base border rounded-xl transition-all duration-200 resize-none
                                                bg-slate-50 dark:bg-slate-700 
                                                text-slate-900 dark:text-white 
                                                placeholder:text-slate-400 dark:placeholder:text-slate-500
                                                focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                                                ${errors.address ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-600'}`}
                                            autoComplete="street-address"
                                        />
                                        {errors.address && (
                                            <p className="mt-2 text-sm text-red-500">{errors.address[0]}</p>
                                        )}
                                    </div>

                                    {/* Submit Button */}
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full py-4 px-6 bg-red-600 hover:bg-red-700 disabled:bg-red-400 
                                            text-white font-medium text-lg rounded-xl 
                                            transition-all duration-200 
                                            active:scale-[0.98] disabled:cursor-not-allowed
                                            flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Отправка...
                                            </>
                                        ) : (
                                            'Отправить'
                                        )}
                                    </button>

                                    {/* Privacy Notice */}
                                    <p className="text-xs text-center text-slate-500 dark:text-slate-400 pt-2">
                                        Нажимая «Отправить», вы соглашаетесь с{' '}
                                        <a href="/privacy" target="_blank" className="text-red-600 hover:underline">
                                            политикой конфиденциальности
                                        </a>
                                    </p>
                                </form>
                            </div>
                        )}
                    </div>
                </main>

                {/* Footer */}
                <footer className="py-4 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
                    © {new Date().getFullYear()} ТОО «ШИН-ЛАЙН»
                </footer>
            </div>

            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                    animation: fade-in 0.3s ease-out;
                }
            `}</style>
        </>
    );
}
