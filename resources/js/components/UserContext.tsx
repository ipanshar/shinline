import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
    id: number;
    name: string;
    roles: string[];
    email?: string;
    avatar?: string; // Аватар пользователя (если требуется)
}

interface UserContextType {
    user: User | null;
    setUser: (user: User | null) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUserState] = useState<User | null>(null);

    // Обновляем состояние и записываем в сессию
    const setUser = (user: User | null) => {
        if (user) {
            sessionStorage.setItem('user', JSON.stringify(user)); // Сохраняем в сессии
        } else {
            sessionStorage.removeItem('user'); // Удаляем из сессии, если пользователь сбрасывается
        }
        setUserState(user); // Обновляем состояние
    };

    // Загружаем данные из сессии при монтировании
    useEffect(() => {
        const userFromSession = sessionStorage.getItem('user');
        if (userFromSession) {
            setUserState(JSON.parse(userFromSession)); // Устанавливаем пользователя из сессии
        }
    }, []);

    return (
        <UserContext.Provider value={{ user, setUser }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = (): UserContextType => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
};