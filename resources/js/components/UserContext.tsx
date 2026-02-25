import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
    id: number;
    name: string;
    roles: string[];
    permissions?: string[]; // Разрешения пользователя
    email?: string;
    avatar?: string;
    isAdmin?: boolean;
}

interface UserContextType {
    user: User | null;
    setUser: (user: User | null) => void;
    hasPermission: (permission: string) => boolean;
    hasAnyPermission: (permissions: string[]) => boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUserState] = useState<User | null>(null);

    // Обновляем состояние и записываем в сессию
    const setUser = (user: User | null) => {
        if (user) {
            sessionStorage.setItem('user', JSON.stringify(user));
        } else {
            sessionStorage.removeItem('user');
        }
        setUserState(user);
    };

    // Проверка разрешения
    const hasPermission = (permission: string): boolean => {
        if (!user) return false;
        if (user.isAdmin || user.roles.includes('Администратор')) return true;
        return user.permissions?.includes(permission) ?? false;
    };

    // Проверка любого из разрешений
    const hasAnyPermission = (permissions: string[]): boolean => {
        if (!user) return false;
        if (user.isAdmin || user.roles.includes('Администратор')) return true;
        return permissions.some(p => user.permissions?.includes(p));
    };

    // Загружаем данные из сессии при монтировании
    useEffect(() => {
        const userFromSession = sessionStorage.getItem('user');
        if (userFromSession) {
            setUserState(JSON.parse(userFromSession));
        }
    }, []);

    return (
        <UserContext.Provider value={{ user, setUser, hasPermission, hasAnyPermission }}>
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