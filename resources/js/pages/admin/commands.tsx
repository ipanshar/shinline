import { useState, useEffect } from 'react';
import { Head } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { useUser } from '@/components/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Scale,
    Ticket,
    UserX,
    Archive,
    HeartPulse,
    RefreshCcwDot,
    Play,
    Loader2,
    CheckCircle2,
    XCircle,
    Terminal,
    ShieldAlert,
} from 'lucide-react';
import axios from 'axios';

// ============ Types ============
interface CommandDef {
    key: string;
    label: string;
    description: string;
    icon: string;
    danger: boolean;
}

interface RunResult {
    success: boolean;
    exit_code: number;
    output: string;
}

// ============ Icon mapping ============
const iconMap: Record<string, React.ElementType> = {
    Scale,
    Ticket,
    UserX,
    Archive,
    HeartPulse,
    RefreshCcwDot,
    Terminal,
};

const CommandIcon = ({ name }: { name: string }) => {
    const Icon = iconMap[name] ?? Terminal;
    return <Icon className="h-5 w-5" />;
};

// ============ Main Component ============
const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Главная', href: '/dashboard' },
    { title: 'Система', href: '#' },
    { title: 'Команды', href: '/admin/commands' },
];

export default function AdminCommandsPage() {
    const { user } = useUser();
    const [commands, setCommands] = useState<CommandDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState<Record<string, boolean>>({});
    const [results, setResults] = useState<Record<string, RunResult>>({});
    const [confirmKey, setConfirmKey] = useState<string | null>(null);

    useEffect(() => {
        axios.get<{ commands: CommandDef[] }>('/admin/commands/list')
            .then(res => setCommands(res.data.commands))
            .catch(() => setCommands([]))
            .finally(() => setLoading(false));
    }, []);

    const handleRun = (key: string) => {
        const cmd = commands.find(c => c.key === key);
        if (!cmd) return;
        if (cmd.danger) {
            setConfirmKey(key);
        } else {
            runCommand(key);
        }
    };

    const runCommand = async (key: string) => {
        setRunning(prev => ({ ...prev, [key]: true }));
        setResults(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
        try {
            const res = await axios.post<RunResult>('/admin/commands/run', { key });
            setResults(prev => ({ ...prev, [key]: res.data }));
        } catch (err) {
            const message = axios.isAxiosError(err)
                ? (err.response?.data?.error ?? err.message)
                : 'Неизвестная ошибка';
            setResults(prev => ({
                ...prev,
                [key]: { success: false, exit_code: 1, output: message },
            }));
        } finally {
            setRunning(prev => ({ ...prev, [key]: false }));
        }
    };

    if (!user?.isAdmin) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title="Команды" />
                <div className="flex h-full items-center justify-center p-8">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <ShieldAlert className="h-12 w-12" />
                        <p className="text-lg font-medium">Доступ запрещён</p>
                        <p className="text-sm">Эта страница доступна только администраторам.</p>
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Команды системы" />

            <div className="flex flex-col gap-6 p-4 md:p-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Terminal className="h-6 w-6 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold">Команды системы</h1>
                        <p className="text-sm text-muted-foreground">
                            Ручной запуск служебных команд обслуживания. Все действия выполняются немедленно.
                        </p>
                    </div>
                </div>

                <Separator />

                {/* Commands grid */}
                {loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Загрузка команд…</span>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {commands.map(cmd => {
                            const isRunning = running[cmd.key] ?? false;
                            const result = results[cmd.key];

                            return (
                                <Card key={cmd.key} className="flex flex-col">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="rounded-md bg-muted p-2">
                                                    <CommandIcon name={cmd.icon} />
                                                </div>
                                                <CardTitle className="text-base leading-snug">
                                                    {cmd.label}
                                                </CardTitle>
                                            </div>
                                            {cmd.danger && (
                                                <Badge variant="destructive" className="shrink-0 text-xs">
                                                    Опасно
                                                </Badge>
                                            )}
                                        </div>
                                        <CardDescription className="mt-2 text-xs leading-relaxed">
                                            {cmd.description}
                                        </CardDescription>
                                    </CardHeader>

                                    <CardContent className="flex flex-col gap-3 mt-auto">
                                        <Button
                                            size="sm"
                                            variant={cmd.danger ? 'destructive' : 'default'}
                                            disabled={isRunning}
                                            onClick={() => handleRun(cmd.key)}
                                            className="w-full"
                                        >
                                            {isRunning ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Выполняется…
                                                </>
                                            ) : (
                                                <>
                                                    <Play className="mr-2 h-4 w-4" />
                                                    Запустить
                                                </>
                                            )}
                                        </Button>

                                        {result && (
                                            <div className="rounded-md border bg-muted/50 p-3">
                                                <div className="flex items-center gap-2 mb-2">
                                                    {result.success ? (
                                                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                                    ) : (
                                                        <XCircle className="h-4 w-4 text-destructive shrink-0" />
                                                    )}
                                                    <span className="text-xs font-medium">
                                                        {result.success ? 'Успешно' : `Ошибка (код ${result.exit_code})`}
                                                    </span>
                                                </div>
                                                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                                                    {result.output}
                                                </pre>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Danger confirm dialog */}
            <AlertDialog open={confirmKey !== null} onOpenChange={open => { if (!open) setConfirmKey(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Подтвердите опасное действие</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmKey && (
                                <>
                                    Команда <strong>{commands.find(c => c.key === confirmKey)?.label}</strong> может
                                    необратимо изменить данные. Продолжить?
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (confirmKey) runCommand(confirmKey);
                                setConfirmKey(null);
                            }}
                        >
                            Запустить
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
