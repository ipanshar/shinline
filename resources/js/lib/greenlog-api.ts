import axios from 'axios';

const baseURL = import.meta.env.VITE_GREENLOG_API_URL || '/api/greenlog';
const csrfToken = document.head.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

const greenlogApi = axios.create({
    baseURL,
    withCredentials: true,
    headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
    },
});

const getErrorMessage = (error: unknown): string => {
    if (axios.isAxiosError(error)) {
        const responseMessage = error.response?.data?.message;

        if (typeof responseMessage === 'string' && responseMessage.trim() !== '') {
            return responseMessage;
        }

        if (error.code === 'ERR_NETWORK') {
            return 'Shin Line Flora API недоступен';
        }

        if (error.response) {
            return `Shin Line Flora API вернул ошибку ${error.response.status}`;
        }

        if (error.message) {
            return error.message;
        }
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return 'Неизвестная ошибка Shin Line Flora API';
};

export interface GreenlogLocation {
    id: number;
    building: string | null;
    floor: string | null;
    room: string | null;
    factory_zone: string | null;
    sector: string | null;
    description: string | null;
    map_x: number | null;
    map_y: number | null;
    marker_size: number | null;
    map_shape: 'point' | 'rectangle' | 'polygon' | null;
    map_width: number | null;
    map_height: number | null;
    map_polygon: Array<{ x: number; y: number }> | null;
    position_x: number | null;
    position_y: number | null;
    type: string | null;
    map_image_path: string | null;
    parent_id: number | null;
    plants_count?: number;
    company_key: string | null;
    created_by_user_id: number | null;
    created_at: string;
    updated_at: string;
}

export interface GreenlogPlantSpecies {
    id: number;
    name: string;
    category: string | null;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface GreenlogPlant {
    id: number;
    inventory_number: string;
    name: string;
    biological_name: string | null;
    category: string;
    status: string;
    location_id: number | null;
    species_id: number | null;
    quantity: number;
    unit_cost: string | number | null;
    total_cost: string | number | null;
    cost_source: string | null;
    branch: string | null;
    office: string | null;
    room: string | null;
    responsible_person: string | null;
    plant_type: string | null;
    height_value: string | number | null;
    height_unit: string | null;
    trunk_diameter_value: string | number | null;
    trunk_diameter_unit: string | null;
    condition_text: string | null;
    gps_coordinates: string | null;
    last_inspection_date: string | null;
    condition_notes: string | null;
    acquisition_date: string | null;
    last_inventory_date: string | null;
    watering_frequency_days: number | null;
    fertilizing_frequency_days: number | null;
    notes: string | null;
    company_key: string | null;
    created_by_user_id: number | null;
    created_at: string;
    updated_at: string;
    location?: GreenlogLocation | null;
    species?: GreenlogPlantSpecies | null;
    photos?: GreenlogPlantPhoto[];
    expenses?: GreenlogExpense[];
    care_tasks?: GreenlogCareTask[];
}

export interface GreenlogPlantPhoto {
    id: number;
    plant_id: number;
    url: string | null;
    path: string;
    disk: string;
    original_name: string | null;
    mime_type: string | null;
    size: number | null;
    type: 'plant' | 'location';
    description: string | null;
    company_key: string | null;
    created_by_user_id: number | null;
    created_at: string;
    updated_at: string;
}

export interface GreenlogExpense {
    id: number;
    plant_id: number | null;
    location_id: number | null;
    category: string;
    amount: string;
    expense_date: string;
    description: string;
    document_number: string | null;
    company_key: string | null;
    created_by_user_id: number | null;
    created_at: string;
    updated_at: string;
    plant?: Pick<GreenlogPlant, 'id' | 'name'> | null;
    location?: Pick<GreenlogLocation, 'id' | 'building' | 'floor' | 'room' | 'factory_zone'> | null;
}

export interface GreenlogCareTask {
    id: number;
    plant_id: number | null;
    type: string;
    due_at: string;
    status: string;
    completed_at: string | null;
    comment: string | null;
    company_key: string | null;
    created_by_user_id: number | null;
    created_at: string;
    updated_at: string;
    plant?: Pick<GreenlogPlant, 'id' | 'name'> | null;
}

export interface GreenlogExpensesSummary {
    totalCount: number;
    totalAmount: string;
    byCategory: Array<{
        category: string;
        count: number;
        amount: string;
    }>;
}

export interface GreenlogDashboardSummary {
    plantSpeciesCount: number;
    totalPlants: number;
    locationsCount: number;
    fundValue: string | number;
    plantsByStatus: Array<{
        status: string;
        count: number;
    }>;
    todayTasksCount: number;
    todayTasks: GreenlogCareTask[];
    overdueTasksCount: number;
    overdueTasks: GreenlogCareTask[];
    currentMonthExpensesTotal: string;
    latestPlants: GreenlogPlant[];
}

export interface GreenlogPlantsInventoryReport {
    items: GreenlogPlant[];
    totalCount: number;
    totalCost: string;
    byLocation: Array<{
        location_id: number | null;
        label: string;
        count: number;
        totalCost: string;
    }>;
    byCategory: Array<{
        category: string;
        label: string;
        count: number;
        totalCost: string;
    }>;
}

export interface GreenlogExpensesFinancialReport {
    items: GreenlogExpense[];
    totalCount: number;
    totalAmount: string;
    byCategory: Array<{
        category: string;
        count: number;
        amount: string;
    }>;
}

interface GreenlogResponse<T> {
    status: boolean;
    data: T;
    message?: string;
}

export const GREENLOG_PHOTO_PREVIEW_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const GREENLOG_PHOTO_PREVIEW_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export const GREENLOG_PHOTO_HEIC_MESSAGE = 'Формат HEIC/HEIF пока не поддерживается. Загрузите JPG, PNG или WEBP.';

export const GREENLOG_PHOTO_FILE_MESSAGE = 'Поддерживаются только JPG, PNG и WEBP до 10 МБ';

export function isPreviewableGreenlogPhoto(photo: Pick<GreenlogPlantPhoto, 'mime_type' | 'original_name' | 'url'>): boolean {
    const mimeType = (photo.mime_type ?? '').toLowerCase();
    const extension = (photo.original_name ?? photo.url ?? '').split('.').pop()?.toLowerCase() ?? '';

    return GREENLOG_PHOTO_PREVIEW_MIME_TYPES.includes(mimeType as (typeof GREENLOG_PHOTO_PREVIEW_MIME_TYPES)[number])
        || GREENLOG_PHOTO_PREVIEW_EXTENSIONS.includes(extension as (typeof GREENLOG_PHOTO_PREVIEW_EXTENSIONS)[number]);
}

export function validateGreenlogPlantPhotoFile(file: File): string | null {
    const sizeMb = file.size / 1024 / 1024;
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = file.type.toLowerCase();

    if (sizeMb > 10) {
        return GREENLOG_PHOTO_FILE_MESSAGE;
    }

    if (['heic', 'heif'].includes(extension) || mimeType.includes('heic') || mimeType.includes('heif')) {
        return GREENLOG_PHOTO_HEIC_MESSAGE;
    }

    if (!GREENLOG_PHOTO_PREVIEW_EXTENSIONS.includes(extension as (typeof GREENLOG_PHOTO_PREVIEW_EXTENSIONS)[number]) && !GREENLOG_PHOTO_PREVIEW_MIME_TYPES.includes(mimeType as (typeof GREENLOG_PHOTO_PREVIEW_MIME_TYPES)[number])) {
        return GREENLOG_PHOTO_FILE_MESSAGE;
    }

    return null;
}

export async function greenlogHealth(): Promise<boolean> {
    try {
        const response = await greenlogApi.get('/health');

        return response.status >= 200 && response.status < 300;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogDashboardSummary(): Promise<GreenlogDashboardSummary> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogDashboardSummary>>('/dashboard/summary');

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogLocations(): Promise<GreenlogLocation[]> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogLocation[]>>('/locations');

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogPlants(params?: {
    search?: string;
    category?: string;
    status?: string;
    location_id?: number;
}): Promise<GreenlogPlant[]> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogPlant[]>>('/plants', {
            params,
        });

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogPlant(id: number): Promise<GreenlogPlant> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogPlant>>(`/plants/${id}`);

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function createGreenlogLocation(payload: Partial<GreenlogLocation>): Promise<GreenlogLocation> {
    try {
        const response = await greenlogApi.post<GreenlogResponse<GreenlogLocation>>('/locations', payload);

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function updateGreenlogLocation(id: number, payload: Partial<GreenlogLocation>): Promise<GreenlogLocation> {
    try {
        const response = await greenlogApi.patch<GreenlogResponse<GreenlogLocation>>(`/locations/${id}`, payload);

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function deleteGreenlogLocation(id: number): Promise<void> {
    try {
        await greenlogApi.delete(`/locations/${id}`);
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogLocationPlants(locationId: number): Promise<GreenlogPlant[]> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogPlant[]>>(`/locations/${locationId}/plants`);

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function createGreenlogPlant(payload: Partial<GreenlogPlant>): Promise<GreenlogPlant> {
    try {
        const response = await greenlogApi.post<GreenlogResponse<GreenlogPlant>>('/plants', payload);

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function updateGreenlogPlant(id: number, payload: Partial<GreenlogPlant>): Promise<GreenlogPlant> {
    try {
        const response = await greenlogApi.patch<GreenlogResponse<GreenlogPlant>>(`/plants/${id}`, payload);

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function deleteGreenlogPlant(id: number): Promise<void> {
    try {
        await greenlogApi.delete(`/plants/${id}`);
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogPlantPhotos(plantId: number): Promise<GreenlogPlantPhoto[]> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogPlantPhoto[]>>(`/plants/${plantId}/photos`);

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function uploadGreenlogPlantPhoto(plantId: number, formData: FormData): Promise<GreenlogPlantPhoto> {
    try {
        const response = await greenlogApi.post<GreenlogResponse<GreenlogPlantPhoto>>(`/plants/${plantId}/photos`, formData, {
            headers: {
                Accept: 'application/json',
            },
        });

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function deleteGreenlogPlantPhoto(photoId: number): Promise<void> {
    try {
        await greenlogApi.delete(`/photos/${photoId}`);
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogExpenses(params?: {
    date_from?: string;
    date_to?: string;
    category?: string;
    plant_id?: number;
    location_id?: number;
}): Promise<GreenlogExpense[]> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogExpense[]>>('/expenses', { params });

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogExpensesSummary(params?: {
    date_from?: string;
    date_to?: string;
    category?: string;
    plant_id?: number;
    location_id?: number;
}): Promise<GreenlogExpensesSummary> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogExpensesSummary>>('/expenses/summary', { params });

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function createGreenlogExpense(payload: Partial<GreenlogExpense>): Promise<GreenlogExpense> {
    try {
        const response = await greenlogApi.post<GreenlogResponse<GreenlogExpense>>('/expenses', payload);

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function updateGreenlogExpense(id: number, payload: Partial<GreenlogExpense>): Promise<GreenlogExpense> {
    try {
        const response = await greenlogApi.patch<GreenlogResponse<GreenlogExpense>>(`/expenses/${id}`, payload);

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function deleteGreenlogExpense(id: number): Promise<void> {
    try {
        await greenlogApi.delete(`/expenses/${id}`);
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogCareTasks(params?: {
    plant_id?: number;
    status?: string;
    type?: string;
}): Promise<GreenlogCareTask[]> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogCareTask[]>>('/care-tasks', { params });

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogTodayCareTasks(): Promise<GreenlogCareTask[]> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogCareTask[]>>('/care-tasks/today');

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function createGreenlogCareTask(payload: Partial<GreenlogCareTask>): Promise<GreenlogCareTask> {
    try {
        const response = await greenlogApi.post<GreenlogResponse<GreenlogCareTask>>('/care-tasks', payload);

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function updateGreenlogCareTask(id: number, payload: Partial<GreenlogCareTask>): Promise<GreenlogCareTask> {
    try {
        const response = await greenlogApi.patch<GreenlogResponse<GreenlogCareTask>>(`/care-tasks/${id}`, payload);

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function completeGreenlogCareTask(id: number, comment?: string): Promise<GreenlogCareTask> {
    try {
        const response = await greenlogApi.post<GreenlogResponse<GreenlogCareTask>>(`/care-tasks/${id}/complete`, {
            comment: comment ?? null,
        });

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function deleteGreenlogCareTask(id: number): Promise<void> {
    try {
        await greenlogApi.delete(`/care-tasks/${id}`);
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogPlantsInventoryReport(params?: {
    date_from?: string;
    date_to?: string;
    category?: string;
    location_id?: number;
    plant_id?: number;
    status?: string;
}): Promise<GreenlogPlantsInventoryReport> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogPlantsInventoryReport>>('/reports/plants-inventory', { params });

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getGreenlogExpensesFinancialReport(params?: {
    date_from?: string;
    date_to?: string;
    category?: string;
    location_id?: number;
    plant_id?: number;
    status?: string;
}): Promise<GreenlogExpensesFinancialReport> {
    try {
        const response = await greenlogApi.get<GreenlogResponse<GreenlogExpensesFinancialReport>>('/reports/expenses-financial', { params });

        return response.data.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}
