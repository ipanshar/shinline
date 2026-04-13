import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import DSSConnectionSettings from '@/components/dss/DSSConnectionSettings';
import DSSTechnicalOverview from '@/components/dss/DSSTechnicalOverview';
import DSSEventJournal from '@/components/dss/DSSEventJournal';
import DSSTelegramSettings from '@/components/dss/DSSTelegramSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Camera, FileText, MapPinned, Settings2 } from 'lucide-react';



const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Интеграция DSS',
        href: '/integration_dss',
    },
];

export default function Integration_dss() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Интеграция DSS" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min p-4">
                        <div className="flex flex-col gap-6">
                            <Tabs defaultValue="settings" className="flex-1">
                                <TabsList className="grid w-full grid-cols-2 gap-2 md:w-[920px] md:grid-cols-5">
                                    <TabsTrigger value="settings" className="flex items-center gap-2">
                                        <Settings2 className="h-4 w-4" />
                                        Настройки
                                    </TabsTrigger>
                                    <TabsTrigger value="telegram" className="flex items-center gap-2">
                                        <Bell className="h-4 w-4" />
                                        Telegram
                                    </TabsTrigger>
                                    <TabsTrigger value="devices" className="flex items-center gap-2">
                                        <Camera className="h-4 w-4" />
                                        Устройства
                                    </TabsTrigger>
                                    <TabsTrigger value="zones" className="flex items-center gap-2">
                                        <MapPinned className="h-4 w-4" />
                                        Зоны
                                    </TabsTrigger>
                                    <TabsTrigger value="journal" className="flex items-center gap-2">
                                        <FileText className="h-4 w-4" />
                                        Журнал
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="settings" className="space-y-6">
                                    <DSSConnectionSettings />
                                    <DSSTechnicalOverview />
                                </TabsContent>

                                <TabsContent value="telegram" className="space-y-6">
                                    <DSSTelegramSettings />
                                </TabsContent>

                                <TabsContent value="devices">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Справочник устройств DSS</CardTitle>
                                            <CardDescription>
                                                Управление камерами, типами вход/выход, привязкой к КПП и зонам.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                            <div className="text-sm text-muted-foreground">
                                                Для изменения справочника используется отдельная рабочая страница с таблицей и inline-редактированием.
                                            </div>
                                            <Button asChild>
                                                <Link href="/integration_dss/devices">Открыть устройства</Link>
                                            </Button>
                                        </CardContent>
                                    </Card>
                                </TabsContent>

                                <TabsContent value="zones">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Справочник зон DSS</CardTitle>
                                            <CardDescription>
                                                Геозоны, полигоны и привязка к дворам остаются в отдельной специализированной странице.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                            <div className="text-sm text-muted-foreground">
                                                Используйте карту и редактор зон для поддержания корректной модели `truck_zone_history`.
                                            </div>
                                            <Button asChild>
                                                <Link href="/integration_dss/zones">Открыть зоны</Link>
                                            </Button>
                                        </CardContent>
                                    </Card>
                                </TabsContent>

                                <TabsContent value="journal">
                                    <DSSEventJournal />
                                </TabsContent>
                            </Tabs>
                        </div>
                </div>
            </div>
        </AppLayout>
    );
}
