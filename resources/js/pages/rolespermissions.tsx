import { useState, useEffect, useCallback, useMemo } from 'react';
import { Head } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useToast } from '@/hooks/use-toast';
import { cleanupDialogArtifacts } from '@/lib/dialog-cleanup';
import axios from 'axios';
import {
    Users,
    Shield,
    Key,
    Search,
    Plus,
    MoreVertical,
    Edit,
    Trash2,
    Save,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    UserCheck,
    UserMinus,
} from 'lucide-react';

// ============ Types ============
interface Permission {
    id: number;
    name: string;
    description: string;
    group: string;
}

interface Role {
    id: number;
    name: string;
    level: number;
    description: string | null;
    permissions: Permission[];
    users_count?: number;
}

interface User {
    id: number;
    name: string;
    email: string;
    phone?: string;
    login?: string;
    roles: Role[];
}

interface PaginationMeta {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number;
    to: number;
}

interface Stats {
    total_users: number;
    users_with_roles: number;
    users_without_roles: number;
    total_roles: number;
    total_permissions: number;
    role_stats: { id: number; name: string; users_count: number }[];
}

// ============ Permission Group Labels ============
const permissionGroupLabels: Record<string, string> = {
    visitors: 'Посетители',
    permits: 'Пропуска',
    weighing: 'Взвешивание',
    tasks: 'Задачи',
    trucks: 'Грузовики',
    warehouses: 'Склады',
    references: 'Справочники',
    statistics: 'Статистика',
    chat: 'Чат',
    integrations: 'Интеграции',
    admin: 'Администрирование',
};

// ============ Main Component ============
export default function RolesPermissions() {
    const { toast } = useToast();

    // Data state
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [permissionGroups, setPermissionGroups] = useState<string[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);

    // UI state
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('users');

    // Users tab state
    const [userSearch, setUserSearch] = useState('');
    const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
    const [userPagination, setUserPagination] = useState<PaginationMeta | null>(null);
    const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editUserRoles, setEditUserRoles] = useState<number[]>([]);

    // Roles tab state
    const [roleDialogOpen, setRoleDialogOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [roleForm, setRoleForm] = useState({ name: '', level: 50, description: '' });
    const [deleteRoleId, setDeleteRoleId] = useState<number | null>(null);
    const [editingRolePermissions, setEditingRolePermissions] = useState<Role | null>(null);
    const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);

    // Bulk action state
    const [bulkActionRole, setBulkActionRole] = useState<string>('');
    const [bulkDialogOpen, setBulkDialogOpen] = useState<'assign' | 'revoke' | null>(null);

    // ============ Data Loading ============
    const loadRbacData = useCallback(async () => {
        try {
            const response = await axios.get('/rbac');
            setRoles(response.data.roles);
            setPermissions(response.data.permissions);
            setPermissionGroups(response.data.permissionGroups);
        } catch (error) {
            toast({ title: 'Ошибка', description: 'Не удалось загрузить данные RBAC', variant: 'destructive' });
        }
    }, [toast]);

    const loadUsers = useCallback(async (page = 1) => {
        try {
            const params: Record<string, any> = { page, per_page: 25 };
            if (userSearch) params.search = userSearch;
            if (userRoleFilter === 'none') {
                params.no_role = true;
            } else if (userRoleFilter !== 'all') {
                params.role_id = userRoleFilter;
            }

            const response = await axios.get('/rbac/users', { params });
            setUsers(response.data.data);
            setUserPagination({
                current_page: response.data.current_page,
                last_page: response.data.last_page,
                per_page: response.data.per_page,
                total: response.data.total,
                from: response.data.from,
                to: response.data.to,
            });
        } catch (error) {
            toast({ title: 'Ошибка', description: 'Не удалось загрузить пользователей', variant: 'destructive' });
        }
    }, [userSearch, userRoleFilter, toast]);

    const loadStats = useCallback(async () => {
        try {
            const response = await axios.get('/rbac/stats');
            setStats(response.data);
        } catch (error) {
            console.error('Failed to load stats', error);
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await Promise.all([loadRbacData(), loadUsers(), loadStats()]);
            setLoading(false);
        };
        init();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadUsers(1);
            setSelectedUsers([]);
        }, 300);
        return () => clearTimeout(timer);
    }, [userSearch, userRoleFilter]);

    // ============ User Actions ============
    const handleEditUser = (user: User) => {
        setEditingUser(user);
        setEditUserRoles(user.roles.map(r => r.id));
    };

    const handleSaveUserRoles = async () => {
        if (!editingUser) return;
        try {
            await axios.put(`/rbac/users/${editingUser.id}/roles`, { role_ids: editUserRoles });
            toast({ title: 'Успешно', description: 'Роли пользователя обновлены' });
            setEditingUser(null);
            setTimeout(cleanupDialogArtifacts, 150);
            loadUsers(userPagination?.current_page || 1);
            loadStats();
        } catch (error) {
            toast({ title: 'Ошибка', description: 'Не удалось обновить роли', variant: 'destructive' });
        }
    };

    const handleBulkAssign = async () => {
        if (!bulkActionRole || selectedUsers.length === 0) return;
        try {
            await axios.post('/rbac/users/bulk-assign', {
                user_ids: selectedUsers,
                role_id: parseInt(bulkActionRole),
            });
            toast({ title: 'Успешно', description: `Роль назначена ${selectedUsers.length} пользователям` });
            setBulkDialogOpen(null);
            setTimeout(cleanupDialogArtifacts, 150);
            setBulkActionRole('');
            setSelectedUsers([]);
            loadUsers(userPagination?.current_page || 1);
            loadStats();
        } catch (error) {
            toast({ title: 'Ошибка', description: 'Не удалось назначить роль', variant: 'destructive' });
        }
    };

    const handleBulkRevoke = async () => {
        if (!bulkActionRole || selectedUsers.length === 0) return;
        try {
            await axios.post('/rbac/users/bulk-revoke', {
                user_ids: selectedUsers,
                role_id: parseInt(bulkActionRole),
            });
            toast({ title: 'Успешно', description: `Роль удалена у ${selectedUsers.length} пользователей` });
            setBulkDialogOpen(null);
            setTimeout(cleanupDialogArtifacts, 150);
            setBulkActionRole('');
            setSelectedUsers([]);
            loadUsers(userPagination?.current_page || 1);
            loadStats();
        } catch (error) {
            toast({ title: 'Ошибка', description: 'Не удалось удалить роль', variant: 'destructive' });
        }
    };

    // ============ Role Actions ============
    const handleCreateRole = () => {
        setEditingRole(null);
        setRoleForm({ name: '', level: 50, description: '' });
        setRoleDialogOpen(true);
    };

    const handleEditRole = (role: Role) => {
        setEditingRole(role);
        setRoleForm({ name: role.name, level: role.level, description: role.description || '' });
        setRoleDialogOpen(true);
    };

    const handleSaveRole = async () => {
        try {
            if (editingRole) {
                await axios.put(`/rbac/roles/${editingRole.id}`, roleForm);
                toast({ title: 'Успешно', description: 'Роль обновлена' });
            } else {
                await axios.post('/rbac/roles', roleForm);
                toast({ title: 'Успешно', description: 'Роль создана' });
            }
            setRoleDialogOpen(false);
            setTimeout(cleanupDialogArtifacts, 150);
            loadRbacData();
            loadStats();
        } catch (error: any) {
            const message = error.response?.data?.message || 'Не удалось сохранить роль';
            toast({ title: 'Ошибка', description: message, variant: 'destructive' });
        }
    };

    const handleDeleteRole = async () => {
        if (!deleteRoleId) return;
        try {
            await axios.delete(`/rbac/roles/${deleteRoleId}`);
            toast({ title: 'Успешно', description: 'Роль удалена' });
            setDeleteRoleId(null);
            setTimeout(cleanupDialogArtifacts, 150);
            loadRbacData();
            loadStats();
        } catch (error: any) {
            const message = error.response?.data?.message || 'Не удалось удалить роль';
            toast({ title: 'Ошибка', description: message, variant: 'destructive' });
        }
    };

    // ============ Permission Actions ============
    const handleEditPermissions = (role: Role) => {
        setEditingRolePermissions(role);
        setSelectedPermissions(role.permissions.map(p => p.id));
    };

    const handleSavePermissions = async () => {
        if (!editingRolePermissions) return;
        try {
            await axios.put(`/rbac/roles/${editingRolePermissions.id}/permissions`, {
                permission_ids: selectedPermissions,
            });
            toast({ title: 'Успешно', description: 'Разрешения роли обновлены' });
            setEditingRolePermissions(null);
            setTimeout(cleanupDialogArtifacts, 150);
            loadRbacData();
        } catch (error) {
            toast({ title: 'Ошибка', description: 'Не удалось сохранить разрешения', variant: 'destructive' });
        }
    };

    const togglePermission = (permissionId: number) => {
        setSelectedPermissions(prev =>
            prev.includes(permissionId)
                ? prev.filter(id => id !== permissionId)
                : [...prev, permissionId]
        );
    };

    const togglePermissionGroup = (group: string) => {
        const groupPermissions = permissions.filter(p => p.group === group).map(p => p.id);
        const allSelected = groupPermissions.every(id => selectedPermissions.includes(id));
        
        if (allSelected) {
            setSelectedPermissions(prev => prev.filter(id => !groupPermissions.includes(id)));
        } else {
            setSelectedPermissions(prev => [...new Set([...prev, ...groupPermissions])]);
        }
    };

    // ============ Permission Groups by Group ============
    const permissionsByGroup = useMemo(() => {
        const groups: Record<string, Permission[]> = {};
        permissions.forEach(p => {
            if (!groups[p.group]) groups[p.group] = [];
            groups[p.group].push(p);
        });
        return groups;
    }, [permissions]);

    // ============ Render ============
    if (loading) {
        return (
            <AppLayout>
                <Head title="Роли и разрешения" />
                <div className="flex items-center justify-center h-96">
                    <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <Head title="Роли и разрешения" />
            
            <div className="flex flex-col gap-4 p-4 md:p-6">
                {/* Header with Stats */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold">Управление доступом</h1>
                        <p className="text-muted-foreground">Роли, разрешения и пользователи системы</p>
                    </div>
                    
                    {stats && (
                        <div className="flex gap-4">
                            <Card className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                    <div className="text-sm">
                                        <span className="font-semibold">{stats.total_users}</span>
                                        <span className="text-muted-foreground ml-1">пользователей</span>
                                    </div>
                                </div>
                            </Card>
                            <Card className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-muted-foreground" />
                                    <div className="text-sm">
                                        <span className="font-semibold">{stats.total_roles}</span>
                                        <span className="text-muted-foreground ml-1">ролей</span>
                                    </div>
                                </div>
                            </Card>
                            <Card className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                    <Key className="h-4 w-4 text-muted-foreground" />
                                    <div className="text-sm">
                                        <span className="font-semibold">{stats.total_permissions}</span>
                                        <span className="text-muted-foreground ml-1">разрешений</span>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>

                {/* Main Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
                    <TabsList className="grid w-full md:w-[400px] grid-cols-3">
                        <TabsTrigger value="users" className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Пользователи
                        </TabsTrigger>
                        <TabsTrigger value="roles" className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            Роли
                        </TabsTrigger>
                        <TabsTrigger value="permissions" className="flex items-center gap-2">
                            <Key className="h-4 w-4" />
                            Разрешения
                        </TabsTrigger>
                    </TabsList>

                    {/* ============ Users Tab ============ */}
                    <TabsContent value="users" className="mt-4">
                        <Card>
                            <CardHeader className="pb-4">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex flex-col md:flex-row gap-4 flex-1">
                                        <div className="relative flex-1 max-w-md">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Поиск по имени, email, телефону..."
                                                value={userSearch}
                                                onChange={(e) => setUserSearch(e.target.value)}
                                                className="pl-9"
                                            />
                                        </div>
                                        <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                                            <SelectTrigger className="w-[200px]">
                                                <SelectValue placeholder="Фильтр по роли" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Все пользователи</SelectItem>
                                                <SelectItem value="none">Без роли</SelectItem>
                                                <Separator className="my-1" />
                                                {roles.map(role => (
                                                    <SelectItem key={role.id} value={role.id.toString()}>
                                                        {role.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    
                                    {selectedUsers.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground">
                                                Выбрано: {selectedUsers.length}
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setBulkDialogOpen('assign')}
                                            >
                                                <UserCheck className="h-4 w-4 mr-1" />
                                                Назначить роль
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setBulkDialogOpen('revoke')}
                                            >
                                                <UserMinus className="h-4 w-4 mr-1" />
                                                Удалить роль
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12">
                                                <Checkbox
                                                    checked={users.length > 0 && selectedUsers.length === users.length}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setSelectedUsers(users.map(u => u.id));
                                                        } else {
                                                            setSelectedUsers([]);
                                                        }
                                                    }}
                                                />
                                            </TableHead>
                                            <TableHead>Имя</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Телефон</TableHead>
                                            <TableHead>Роли</TableHead>
                                            <TableHead className="w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {users.map(user => (
                                            <TableRow key={user.id}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedUsers.includes(user.id)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedUsers([...selectedUsers, user.id]);
                                                            } else {
                                                                setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                                                            }
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium">{user.name}</TableCell>
                                                <TableCell>{user.email}</TableCell>
                                                <TableCell>{user.phone || '—'}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {user.roles.length === 0 ? (
                                                            <Badge variant="outline" className="text-muted-foreground">
                                                                Нет роли
                                                            </Badge>
                                                        ) : (
                                                            user.roles.map(role => (
                                                                <Badge key={role.id} variant="secondary">
                                                                    {role.name}
                                                                </Badge>
                                                            ))
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleEditUser(user)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>

                                {/* Pagination */}
                                {userPagination && userPagination.last_page > 1 && (
                                    <div className="flex items-center justify-between mt-4">
                                        <div className="text-sm text-muted-foreground">
                                            Показано {userPagination.from}–{userPagination.to} из {userPagination.total}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={userPagination.current_page === 1}
                                                onClick={() => loadUsers(userPagination.current_page - 1)}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <span className="text-sm">
                                                Страница {userPagination.current_page} из {userPagination.last_page}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={userPagination.current_page === userPagination.last_page}
                                                onClick={() => loadUsers(userPagination.current_page + 1)}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ============ Roles Tab ============ */}
                    <TabsContent value="roles" className="mt-4">
                        <div className="flex justify-end mb-4">
                            <Button onClick={handleCreateRole}>
                                <Plus className="h-4 w-4 mr-2" />
                                Создать роль
                            </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {roles.map(role => (
                                <Card key={role.id}>
                                    <CardHeader className="pb-2">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <CardTitle className="flex items-center gap-2">
                                                    <Shield className="h-5 w-5" />
                                                    {role.name}
                                                </CardTitle>
                                                <CardDescription className="mt-1">
                                                    Уровень: {role.level}
                                                </CardDescription>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleEditRole(role)}>
                                                        <Edit className="h-4 w-4 mr-2" />
                                                        Редактировать
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleEditPermissions(role)}>
                                                        <Key className="h-4 w-4 mr-2" />
                                                        Разрешения
                                                    </DropdownMenuItem>
                                                    {role.name !== 'Администратор' && (
                                                        <DropdownMenuItem
                                                            className="text-destructive"
                                                            onClick={() => setDeleteRoleId(role.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            Удалить
                                                        </DropdownMenuItem>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {role.description && (
                                            <p className="text-sm text-muted-foreground mb-3">
                                                {role.description}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-4 text-sm">
                                            <div className="flex items-center gap-1">
                                                <Users className="h-4 w-4 text-muted-foreground" />
                                                <span>
                                                    {stats?.role_stats.find(r => r.id === role.id)?.users_count ?? 0} польз.
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Key className="h-4 w-4 text-muted-foreground" />
                                                <span>{role.permissions.length} разр.</span>
                                            </div>
                                        </div>
                                        <Separator className="my-3" />
                                        <div className="flex flex-wrap gap-1">
                                            {role.permissions.slice(0, 5).map(p => (
                                                <Badge key={p.id} variant="outline" className="text-xs">
                                                    {p.name}
                                                </Badge>
                                            ))}
                                            {role.permissions.length > 5 && (
                                                <Badge variant="outline" className="text-xs">
                                                    +{role.permissions.length - 5}
                                                </Badge>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>

                    {/* ============ Permissions Tab ============ */}
                    <TabsContent value="permissions" className="mt-4">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {permissionGroups.map(group => (
                                <Card key={group}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-lg">
                                            {permissionGroupLabels[group] || group}
                                        </CardTitle>
                                        <CardDescription>
                                            {permissionsByGroup[group]?.length || 0} разрешений
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            {permissionsByGroup[group]?.map(permission => (
                                                <div
                                                    key={permission.id}
                                                    className="flex items-start justify-between p-2 rounded-md bg-muted/50"
                                                >
                                                    <div>
                                                        <div className="font-medium text-sm">{permission.name}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {permission.description}
                                                        </div>
                                                    </div>
                                                    <Badge variant="outline" className="ml-2 shrink-0">
                                                        {roles.filter(r => r.permissions.some(p => p.id === permission.id)).length} ролей
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* ============ Edit User Roles Dialog ============ */}
            <Dialog open={!!editingUser} onOpenChange={(open) => {
                if (!open) {
                    setEditingUser(null);
                    setTimeout(cleanupDialogArtifacts, 150);
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Редактирование ролей</DialogTitle>
                        <DialogDescription>
                            {editingUser?.name} ({editingUser?.email})
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="space-y-2">
                            {roles.map(role => (
                                <div
                                    key={role.id}
                                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted"
                                >
                                    <Checkbox
                                        id={`role-${role.id}`}
                                        checked={editUserRoles.includes(role.id)}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                setEditUserRoles([...editUserRoles, role.id]);
                                            } else {
                                                setEditUserRoles(editUserRoles.filter(id => id !== role.id));
                                            }
                                        }}
                                    />
                                    <Label htmlFor={`role-${role.id}`} className="flex-1 cursor-pointer">
                                        <div className="font-medium">{role.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            Уровень: {role.level} | {role.permissions.length} разрешений
                                        </div>
                                    </Label>
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setEditingUser(null);
                            setTimeout(cleanupDialogArtifacts, 150);
                        }}>
                            Отмена
                        </Button>
                        <Button onClick={handleSaveUserRoles}>
                            <Save className="h-4 w-4 mr-2" />
                            Сохранить
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ============ Create/Edit Role Dialog ============ */}
            <Dialog open={roleDialogOpen} onOpenChange={(open) => {
                if (!open) {
                    setRoleDialogOpen(false);
                    setTimeout(cleanupDialogArtifacts, 150);
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingRole ? 'Редактирование роли' : 'Создание роли'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingRole ? 'Измените параметры роли' : 'Заполните параметры новой роли'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="role-name">Название</Label>
                            <Input
                                id="role-name"
                                value={roleForm.name}
                                onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                                placeholder="Например: Менеджер"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="role-level">
                                Уровень доступа: {roleForm.level}
                            </Label>
                            <Input
                                id="role-level"
                                type="range"
                                min="0"
                                max="100"
                                value={roleForm.level}
                                onChange={(e) => setRoleForm({ ...roleForm, level: parseInt(e.target.value) })}
                                className="cursor-pointer"
                            />
                            <p className="text-xs text-muted-foreground">
                                0 = минимальный, 100 = максимальный (как у Администратора)
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="role-description">Описание</Label>
                            <Input
                                id="role-description"
                                value={roleForm.description}
                                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                                placeholder="Краткое описание роли"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setRoleDialogOpen(false);
                            setTimeout(cleanupDialogArtifacts, 150);
                        }}>
                            Отмена
                        </Button>
                        <Button onClick={handleSaveRole} disabled={!roleForm.name}>
                            <Save className="h-4 w-4 mr-2" />
                            {editingRole ? 'Сохранить' : 'Создать'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ============ Edit Role Permissions Dialog ============ */}
            <Dialog open={!!editingRolePermissions} onOpenChange={(open) => {
                if (!open) {
                    setEditingRolePermissions(null);
                    setTimeout(cleanupDialogArtifacts, 150);
                }
            }}>
                <DialogContent className="max-w-3xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle>
                            Разрешения роли: {editingRolePermissions?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Выберите разрешения, которые будут доступны для этой роли
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[50vh] pr-4">
                        <div className="space-y-6">
                            {permissionGroups.map(group => {
                                const groupPerms = permissionsByGroup[group] || [];
                                const allSelected = groupPerms.every(p => selectedPermissions.includes(p.id));
                                const someSelected = groupPerms.some(p => selectedPermissions.includes(p.id));

                                return (
                                    <div key={group} className="space-y-2">
                                        <div className="flex items-center space-x-2 p-2 bg-muted rounded-md">
                                            <Checkbox
                                                id={`group-${group}`}
                                                checked={allSelected}
                                                onCheckedChange={() => togglePermissionGroup(group)}
                                            />
                                            <Label
                                                htmlFor={`group-${group}`}
                                                className="font-semibold cursor-pointer"
                                            >
                                                {permissionGroupLabels[group] || group}
                                            </Label>
                                            <Badge variant="outline" className="ml-auto">
                                                {groupPerms.filter(p => selectedPermissions.includes(p.id)).length}/{groupPerms.length}
                                            </Badge>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 pl-4">
                                            {groupPerms.map(permission => (
                                                <div
                                                    key={permission.id}
                                                    className="flex items-start space-x-2 p-2 rounded-md hover:bg-muted/50"
                                                >
                                                    <Checkbox
                                                        id={`perm-${permission.id}`}
                                                        checked={selectedPermissions.includes(permission.id)}
                                                        onCheckedChange={() => togglePermission(permission.id)}
                                                    />
                                                    <Label htmlFor={`perm-${permission.id}`} className="cursor-pointer">
                                                        <div className="text-sm">{permission.name}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {permission.description}
                                                        </div>
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setEditingRolePermissions(null);
                            setTimeout(cleanupDialogArtifacts, 150);
                        }}>
                            Отмена
                        </Button>
                        <Button onClick={handleSavePermissions}>
                            <Save className="h-4 w-4 mr-2" />
                            Сохранить ({selectedPermissions.length} разрешений)
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ============ Delete Role Confirmation ============ */}
            <AlertDialog open={!!deleteRoleId} onOpenChange={(open) => {
                if (!open) {
                    setDeleteRoleId(null);
                    setTimeout(cleanupDialogArtifacts, 150);
                }
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Удалить роль?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Это действие нельзя отменить. Все пользователи потеряют эту роль.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteRole} className="bg-destructive">
                            Удалить
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ============ Bulk Assign Role Dialog ============ */}
            <Dialog open={bulkDialogOpen === 'assign'} onOpenChange={(open) => {
                if (!open) {
                    setBulkDialogOpen(null);
                    setTimeout(cleanupDialogArtifacts, 150);
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Назначить роль</DialogTitle>
                        <DialogDescription>
                            Выберите роль для назначения {selectedUsers.length} пользователям
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Select value={bulkActionRole} onValueChange={setBulkActionRole}>
                            <SelectTrigger>
                                <SelectValue placeholder="Выберите роль" />
                            </SelectTrigger>
                            <SelectContent>
                                {roles.map(role => (
                                    <SelectItem key={role.id} value={role.id.toString()}>
                                        {role.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setBulkDialogOpen(null);
                            setTimeout(cleanupDialogArtifacts, 150);
                        }}>
                            Отмена
                        </Button>
                        <Button onClick={handleBulkAssign} disabled={!bulkActionRole}>
                            <UserCheck className="h-4 w-4 mr-2" />
                            Назначить
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ============ Bulk Revoke Role Dialog ============ */}
            <Dialog open={bulkDialogOpen === 'revoke'} onOpenChange={(open) => {
                if (!open) {
                    setBulkDialogOpen(null);
                    setTimeout(cleanupDialogArtifacts, 150);
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Удалить роль</DialogTitle>
                        <DialogDescription>
                            Выберите роль для удаления у {selectedUsers.length} пользователей
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Select value={bulkActionRole} onValueChange={setBulkActionRole}>
                            <SelectTrigger>
                                <SelectValue placeholder="Выберите роль" />
                            </SelectTrigger>
                            <SelectContent>
                                {roles.map(role => (
                                    <SelectItem key={role.id} value={role.id.toString()}>
                                        {role.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setBulkDialogOpen(null);
                            setTimeout(cleanupDialogArtifacts, 150);
                        }}>
                            Отмена
                        </Button>
                        <Button onClick={handleBulkRevoke} disabled={!bulkActionRole} variant="destructive">
                            <UserMinus className="h-4 w-4 mr-2" />
                            Удалить роль
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
