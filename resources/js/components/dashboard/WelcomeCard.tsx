import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/components/UserContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Shield, User as UserIcon, Mail, LogIn } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const WelcomeCard: React.FC = () => {
    const { user } = useUser();

    const getGreeting = (): string => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return 'Доброе утро';
        if (hour >= 12 && hour < 17) return 'Добрый день';
        if (hour >= 17 && hour < 22) return 'Добрый вечер';
        return 'Доброй ночи';
    };

    const getInitials = (name: string): string => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const today = format(new Date(), 'EEEE, d MMMM yyyy', { locale: ru });

    return (
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
            <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <Avatar className="h-16 w-16 border-2 border-primary/20">
                        <AvatarImage src={user?.avatar} alt={user?.name} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                            {user?.name ? getInitials(user.name) : <UserIcon className="h-8 w-8" />}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <p className="text-muted-foreground text-sm capitalize">{today}</p>
                        <h2 className="text-2xl font-bold mt-1">
                            {getGreeting()}, {user?.name || 'Пользователь'}!
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                            {user?.roles && user.roles.length > 0 && (
                                <Badge variant="secondary" className="flex items-center gap-1">
                                    <Shield className="h-3 w-3" />
                                    {user.roles[0]}
                                </Badge>
                            )}
                            {user?.isAdmin && (
                                <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">
                                    Администратор
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default WelcomeCard;
