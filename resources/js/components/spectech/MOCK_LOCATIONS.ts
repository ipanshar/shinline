export const KNOWN_TERMINALS = ['T1', 'T2', 'T3', 'T4'] as const;

export type KnownTerminal = (typeof KNOWN_TERMINALS)[number];

export interface Location {
    id: number;
    terminal: KnownTerminal;
    building: string;
    gate: string;
    purpose: string;
    status: 'active' | 'pending' | 'empty';
}

export function isKnownTerminal(value: string): value is KnownTerminal {
    return KNOWN_TERMINALS.includes(value.trim().toUpperCase() as KnownTerminal);
}

export function formatLocationStatus(status: Location['status']): string {
    if (status === 'active') return 'Активен';
    if (status === 'pending') return 'Строится';
    return 'Пустой';
}

export function buildSpectechAddress(
    terminal: string,
    zone: string,
    gate?: string | null,
    status?: string | null,
    purpose?: string | null,
): string {
    return [
        terminal ? `Терминал: ${terminal}` : null,
        zone ? `Здание: ${zone}` : null,
        gate ? `Гейт: ${gate}` : null,
        status ? `Статус: ${status}` : null,
        purpose ? `Назначение: ${purpose}` : null,
    ]
        .filter(Boolean)
        .join(' | ');
}

export const MOCK_LOCATIONS: Location[] = [
    // T1 — активный терминал (15 зданий)
    { id: 1,  terminal: 'T1', building: 'A1', gate: 'Gate 1', purpose: 'Склад ГП',         status: 'active' },
    { id: 2,  terminal: 'T1', building: 'A2', gate: 'Gate 2', purpose: 'Склад сырья',       status: 'active' },
    { id: 3,  terminal: 'T1', building: 'A3', gate: 'Gate 3', purpose: 'Экспедиция',        status: 'active' },
    { id: 4,  terminal: 'T1', building: 'B1', gate: 'Gate 1', purpose: 'Погрузочная зона',  status: 'active' },
    { id: 5,  terminal: 'T1', building: 'B2', gate: 'Gate 2', purpose: 'Разгрузочная',      status: 'active' },
    { id: 6,  terminal: 'T1', building: 'B3', gate: 'Gate 3', purpose: 'Логистика',         status: 'active' },
    { id: 7,  terminal: 'T1', building: 'C1', gate: 'Gate 1', purpose: 'Хранение',          status: 'active' },
    { id: 8,  terminal: 'T1', building: 'C2', gate: 'Gate 2', purpose: 'Сортировка',        status: 'active' },
    { id: 9,  terminal: 'T1', building: 'C3', gate: '-',      purpose: 'Технический блок',  status: 'active' },
    { id: 10, terminal: 'T1', building: 'D1', gate: 'Gate 1', purpose: 'Склад запчастей',   status: 'active' },
    { id: 11, terminal: 'T1', building: 'D2', gate: '-',      purpose: 'Охрана',            status: 'active' },
    { id: 12, terminal: 'T1', building: 'D3', gate: 'Gate 2', purpose: 'Офис',              status: 'active' },
    { id: 13, terminal: 'T1', building: 'E1', gate: 'Gate 1', purpose: 'Холодный склад',    status: 'active' },
    { id: 14, terminal: 'T1', building: 'E2', gate: 'Gate 2', purpose: 'Весовой контроль',  status: 'active' },
    { id: 15, terminal: 'T1', building: 'E3', gate: 'Gate 3', purpose: 'КПП',               status: 'active' },

    // T2 — активный терминал (9 зданий)
    { id: 16, terminal: 'T2', building: 'A1', gate: 'Gate 1', purpose: 'Склад ГП',         status: 'active' },
    { id: 17, terminal: 'T2', building: 'A2', gate: 'Gate 2', purpose: 'Разгрузочная',      status: 'active' },
    { id: 18, terminal: 'T2', building: 'B1', gate: 'Gate 1', purpose: 'Погрузочная зона',  status: 'active' },
    { id: 19, terminal: 'T2', building: 'B2', gate: 'Gate 2', purpose: 'Экспедиция',        status: 'active' },
    { id: 20, terminal: 'T2', building: 'B3', gate: '-',      purpose: 'Технический блок',  status: 'active' },
    { id: 21, terminal: 'T2', building: 'C1', gate: 'Gate 1', purpose: 'Хранение',          status: 'active' },
    { id: 22, terminal: 'T2', building: 'C2', gate: 'Gate 2', purpose: 'Офис',              status: 'active' },
    { id: 23, terminal: 'T2', building: 'C3', gate: '-',      purpose: 'Охрана',            status: 'active' },
    { id: 24, terminal: 'T2', building: 'D1', gate: 'Gate 1', purpose: 'КПП',               status: 'active' },

    // T3 — строится
    { id: 25, terminal: 'T3', building: 'A1', gate: '-', purpose: 'Данные уточняются', status: 'pending' },
    { id: 26, terminal: 'T3', building: 'A2', gate: '-', purpose: 'Данные уточняются', status: 'pending' },
    { id: 27, terminal: 'T3', building: 'B1', gate: '-', purpose: 'Данные уточняются', status: 'pending' },

    // T4 — пустой
    { id: 28, terminal: 'T4', building: 'A1', gate: '-', purpose: 'Не используется', status: 'empty' },
];

export const TERMINAL_INFO: Record<string, { label: string; description: string; color: string }> = {
    T1: { label: 'Терминал 1', description: 'Основной терминал — 15 объектов', color: 'bg-green-100 text-green-800 border-green-200' },
    T2: { label: 'Терминал 2', description: 'Активный терминал — 9 объектов',  color: 'bg-green-100 text-green-800 border-green-200' },
    T3: { label: 'Терминал 3', description: 'Строится — данные уточняются',     color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    T4: { label: 'Терминал 4', description: 'Пустой терминал',                  color: 'bg-gray-100 text-gray-500 border-gray-200' },
};
