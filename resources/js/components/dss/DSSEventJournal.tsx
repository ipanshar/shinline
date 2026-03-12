import { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertCircle, FileText, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type JournalEntry = {
    timestamp?: string | null;
    level: 'info' | 'warning' | 'error' | 'critical' | string;
    event: string;
    message?: string | null;
    context?: Record<string, unknown>;
};

const levelLabel: Record<string, string> = {
    info: 'Info',
    warning: 'Warning',
    error: 'Error',
    critical: 'Critical',
};

export default function DSSEventJournal() {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [level, setLevel] = useState<string>('all');

    const loadJournal = async (nextLevel = level) => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.post('/dss/events-journal', {
                limit: 100,
                level: nextLevel === 'all' ? null : nextLevel,
            });

            setEntries(response.data.data ?? []);
        } catch (loadError) {
            console.error('Ошибка загрузки журнала DSS:', loadError);
            setError('Не удалось загрузить журнал DSS.');
            setEntries([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadJournal();
        const timerId = window.setInterval(() => void loadJournal(), 30000);

        return () => window.clearInterval(timerId);
    }, []);

    const formatDate = (value?: string | null) => {
        if (!value) {
            return '—';
        }

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
    };

    const badgeVariant = (entryLevel: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
        if (entryLevel === 'error' || entryLevel === 'critical') {
            return 'destructive';
        }

        if (entryLevel === 'warning') {
            return 'secondary';
        }

        return 'outline';
    };

    return (
        <Card>
            <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Журнал событий DSS
                    </CardTitle>
                    <CardDescription>
                        Последние structured events и ошибки из выделенного DSS log channel.
                    </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Select
                        value={level}
                        onValueChange={(value) => {
                            setLevel(value);
                            void loadJournal(value);
                        }}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Уровень" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Все уровни</SelectItem>
                            <SelectItem value="info">Info</SelectItem>
                            <SelectItem value="warning">Warning</SelectItem>
                            <SelectItem value="error">Error</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => void loadJournal()} disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Обновить
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Ошибка загрузки</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <ScrollArea className="h-[480px] rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[160px]">Время</TableHead>
                                <TableHead className="w-[110px]">Уровень</TableHead>
                                <TableHead className="w-[220px]">Событие</TableHead>
                                <TableHead>Сообщение / контекст</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {!loading && entries.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                                        Журнал пока пуст.
                                    </TableCell>
                                </TableRow>
                            )}

                            {entries.map((entry, index) => (
                                <TableRow key={`${entry.timestamp ?? 'row'}-${index}`}>
                                    <TableCell className="align-top text-xs text-muted-foreground">
                                        {formatDate(entry.timestamp)}
                                    </TableCell>
                                    <TableCell className="align-top">
                                        <Badge variant={badgeVariant(entry.level)}>
                                            {levelLabel[entry.level] ?? entry.level}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="align-top font-medium">{entry.event}</TableCell>
                                    <TableCell className="align-top text-sm">
                                        <div>{entry.message ?? '—'}</div>
                                        {entry.context && Object.keys(entry.context).length > 0 && (
                                            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                                                {JSON.stringify(entry.context, null, 2)}
                                            </pre>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}