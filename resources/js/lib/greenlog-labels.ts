export const plantCategoryLabels: Record<string, string> = {
    indoor: 'Комнатное',
    outdoor: 'Уличное',
    office: 'Офисное',
    room: 'Комнатное',
    conifer: 'Хвойное',
    'flower/shrub': 'Цветы / кустарники',
    tree: 'Дерево',
    fruit_tree: 'Плодовое дерево',
    shrub: 'Кустарник',
    flower: 'Цветок',
};

export const plantStatusLabels: Record<string, string> = {
    active: 'Активно',
    alive: 'В норме',
    needs_care: 'Требует ухода',
    written_off: 'Списано',
};

export const plantCostSourceLabels: Record<string, string> = {
    auto: 'Авто',
    manual: 'Вручную',
};

export const expenseCategoryLabels: Record<string, string> = {
    purchase: 'Покупка',
    pot: 'Горшок',
    fertilizer: 'Удобрение',
    soil: 'Грунт',
    watering: 'Полив',
    service: 'Сервис',
    other: 'Другое',
};

export const careTaskTypeLabels: Record<string, string> = {
    watering: 'Полив',
    fertilizing: 'Подкормка',
    treatment: 'Обработка',
    inspection: 'Осмотр',
    other: 'Другое',
};

export const careTaskStatusLabels: Record<string, string> = {
    pending: 'В работе',
    done: 'Выполнено',
    overdue: 'Просрочено',
};

export const locationLabel = (location?: {
    building?: string | null;
    floor?: string | null;
    room?: string | null;
    factory_zone?: string | null;
} | null) => [location?.building, location?.floor, location?.room, location?.factory_zone].filter(Boolean).join(' / ') || 'Без локации';

export const plantCategoryLabel = (value?: string | null) => (value ? plantCategoryLabels[value] ?? value : '—');
export const plantStatusLabel = (value?: string | null) => (value ? plantStatusLabels[value] ?? value : '—');
export const plantCostSourceLabel = (value?: string | null) => (value ? plantCostSourceLabels[value] ?? value : '—');
export const expenseCategoryLabel = (value?: string | null) => (value ? expenseCategoryLabels[value] ?? value : '—');
export const careTaskTypeLabel = (value?: string | null) => (value ? careTaskTypeLabels[value] ?? value : '—');
export const careTaskStatusLabel = (value?: string | null) => (value ? careTaskStatusLabels[value] ?? value : '—');

export const greenlogMoneyLabel = (value?: string | number | null) => {
    if (value === null || value === undefined || value === '') {
        return '—';
    }

    const amount = typeof value === 'number' ? value : Number(value);

    if (Number.isNaN(amount)) {
        return String(value);
    }

    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};
