import { TERMINAL_SCHEME_SOURCE } from './TERMINAL_SCHEME_DATA';

export const KNOWN_TERMINALS = ['T1', 'T2', 'T3', 'T4'] as const;

export type KnownTerminal = (typeof KNOWN_TERMINALS)[number];
export type LocationStatus = 'active' | 'pending' | 'empty';
export type SchemeTone = 'zone' | 'storage' | 'production' | 'office' | 'service';

export interface Location {
    id: number;
    terminal: KnownTerminal;
    building: string;
    shortLabel?: string;
    gate: string;
    purpose: string;
    status: LocationStatus;
    code?: string;
    range?: string;
}

export interface TerminalSchemeItem {
    id: string;
    terminal: Exclude<KnownTerminal, 'T4'>;
    range: string;
    label: string;
    tone: SchemeTone;
    locationId?: number;
}

export interface TerminalSchemeLayout {
    cols: number;
    rows: number;
}

type RawLocation = {
    id: number;
    terminal: Exclude<KnownTerminal, 'T4'>;
    range: string;
    label: string;
    shortLabel?: string;
    gate?: string;
    status?: Exclude<LocationStatus, 'empty'>;
};

export function isKnownTerminal(value: string): value is KnownTerminal {
    return KNOWN_TERMINALS.includes(value.trim().toUpperCase() as KnownTerminal);
}

export function hasTerminalScheme(value: string): value is Exclude<KnownTerminal, 'T4'> {
    const terminal = value.trim().toUpperCase();
    return terminal === 'T1' || terminal === 'T2' || terminal === 'T3';
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
        zone ? `Зона: ${zone}` : null,
        gate ? `Гейт: ${gate}` : null,
        status ? `Статус: ${status}` : null,
        purpose ? `Назначение: ${purpose}` : null,
    ]
        .filter(Boolean)
        .join(' | ');
}

function normalizeWhitespace(value: string): string {
    return value
        .replace(/\s+/g, ' ')
        .replace(/\s*\/\s*/g, ' / ')
        .trim();
}

function normalizeCodeLabel(value: string): string {
    return normalizeWhitespace(value)
        .replace(/^[(\[]+|[)\]]+$/g, '')
        .replace(/\s*\/\s*$/g, '')
        .trim();
}

function extractSchemeCode(label: string): string | null {
    const normalized = normalizeCodeLabel(label);

    if (/^([A-ZА-ЯЁ]\d+|G\d+)$/iu.test(normalized)) {
        return normalized.toUpperCase();
    }

    return null;
}

function splitLocationLabel(label: string): { building: string; purpose: string } {
    const normalized = normalizeWhitespace(label);
    const parts = normalized.split(' / ').map((part) => part.trim()).filter(Boolean);

    if (parts.length <= 1) {
        return {
            building: normalized,
            purpose: 'Объект терминала',
        };
    }

    return {
        building: parts[0],
        purpose: parts.slice(1).join(' / '),
    };
}

function inferTone(label: string): SchemeTone {
    const value = label.toLowerCase();

    if (/^(g\d+|[a-zа-яё]\d+)$/iu.test(label.trim()) || value.includes('part (блок)')) {
        return 'zone';
    }

    if (value.includes('склад') || value.includes('хк-') || value.includes('отгрузк') || value.includes('паллет')) {
        return 'storage';
    }

    if (value.includes('производ') || value.includes('цех') || value.includes('тестомес') || value.includes('дэсанг')) {
        return 'production';
    }

    if (value.includes('кабинет') || value.includes('лаборатор') || value.includes('hr') || value.includes('биот') || value.includes('турникет')) {
        return 'office';
    }

    return 'service';
}

function createLocation(raw: RawLocation): Location {
    const parts = splitLocationLabel(raw.label);

    return {
        id: raw.id,
        terminal: raw.terminal,
        building: parts.building,
        shortLabel: raw.shortLabel,
        gate: raw.gate ?? '',
        purpose: parts.purpose,
        status: raw.status ?? (raw.terminal === 'T3' ? 'pending' : 'active'),
        code: parts.building,
        range: raw.range,
    };
}

const REAL_TERMINAL_LOCATIONS_RAW: RawLocation[] = [
    { id: 101, terminal: 'T1', range: 'H5:U5', label: 'D2' },
    { id: 102, terminal: 'T1', range: 'H6:Q10', label: 'КТЦ №1 / Угольная', shortLabel: 'КТЦ №1' },
    { id: 103, terminal: 'T1', range: 'R6:U10', label: 'КТЦ / Газовая', shortLabel: 'КТЦ Газ' },
    { id: 104, terminal: 'T1', range: 'H11:Q12', label: 'РМУ / 1 этаж' },
    { id: 105, terminal: 'T1', range: 'H13:Q13', label: 'Компрессорная', shortLabel: 'Компр.' },
    { id: 106, terminal: 'T1', range: 'H14:Q14', label: 'С1' },
    { id: 107, terminal: 'T1', range: 'H15:L17', label: 'ЛБП Тестомес / 3 этаж', shortLabel: 'Тестомес' },
    { id: 108, terminal: 'T1', range: 'M15:Q17', label: 'ЛБП Кабинеты / 3 этаж', shortLabel: 'ЛБП Каб.' },
    { id: 109, terminal: 'T1', range: 'X16:AY17', label: 'Зона отгрузки ГП Комплектация / 1 этаж', shortLabel: 'Отгр. ГП' },
    { id: 110, terminal: 'T1', range: 'H18:Q22', label: 'Производство ЛПБ / 2 этаж', shortLabel: 'Произв. ЛПБ' },
    { id: 111, terminal: 'T1', range: 'X18:AY19', label: 'Столовая / 2 этаж' },
    { id: 112, terminal: 'T1', range: 'X20:AY21', label: 'Прачечная, раздевалка ЛБП / 3 этаж', shortLabel: 'Прачечная' },
    { id: 113, terminal: 'T1', range: 'H23:Q26', label: 'Цех специй ЛБП / 1 этаж', shortLabel: 'Цех специй' },
    { id: 114, terminal: 'T1', range: 'R24:Z29', label: 'Склад CU' },
    { id: 115, terminal: 'T1', range: 'AA24:AI29', label: 'ХК-1 / 1,2,3 этажи' },
    { id: 116, terminal: 'T1', range: 'AK24:AS29', label: 'ХК-2 / 1,2,3 этажи' },
    { id: 117, terminal: 'T1', range: 'AT24:BB29', label: 'Склад СиМ / Мука', shortLabel: 'Склад СиМ' },
    { id: 118, terminal: 'T1', range: 'BC24:BJ25', label: 'ЗПФ / 3 этаж' },
    { id: 119, terminal: 'T1', range: 'BC26:BJ27', label: 'ЗПФ / 2 этаж' },
    { id: 120, terminal: 'T1', range: 'H27:Q29', label: 'RnD / 1 этаж' },
    { id: 121, terminal: 'T1', range: 'H31:L32', label: 'CU Магазин / 1 этаж' },
    { id: 122, terminal: 'T1', range: 'M31:Q36', label: 'CU Производство', shortLabel: 'CU Произв.' },
    { id: 123, terminal: 'T1', range: 'AA31:AI36', label: 'ХК-3 / 1,2,3 этажи' },
    { id: 124, terminal: 'T1', range: 'AK31:AS36', label: 'ХК-4 / 1,2,3 этажи' },
    { id: 125, terminal: 'T1', range: 'AT31:BB36', label: 'Склад ТМЦ / 1,2,3 этажи' },
    { id: 126, terminal: 'T1', range: 'BD33:BJ34', label: 'ЗПФ / 1 этаж' },
    { id: 127, terminal: 'T1', range: 'BE35:BJ36', label: 'Склад МК' },
    { id: 128, terminal: 'T1', range: 'W38:AX39', label: 'Кабинеты / 3 этаж' },
    { id: 129, terminal: 'T1', range: 'W40:AX41', label: 'Кабинеты / 2 этаж' },
    { id: 130, terminal: 'T1', range: 'W42:Z44', label: 'Касса' },
    { id: 131, terminal: 'T1', range: 'AA42:AX43', label: 'Зона отгрузки ГП Региональный / 1 этаж', shortLabel: 'Рег. отгр.' },
    { id: 132, terminal: 'T1', range: 'G45:K47', label: 'КПП №1' },

    { id: 201, terminal: 'T2', range: 'R13:BM17', label: 'Расширение', shortLabel: 'Расшир.' },
    { id: 202, terminal: 'T2', range: 'R22:W28', label: 'Кабинеты / 2 этаж' },
    { id: 203, terminal: 'T2', range: 'X22:AC35', label: 'Склад роботизированный / высота 1-3 этажи', shortLabel: 'Склад роб.' },
    { id: 204, terminal: 'T2', range: 'AD22:AI35', label: 'Зона паллетизации / высота 1-3 этажи', shortLabel: 'Паллет.' },
    { id: 205, terminal: 'T2', range: 'AJ22:AR35', label: 'Производство МЦ-3' },
    { id: 206, terminal: 'T2', range: 'BF22:BP25', label: 'Склад СиМ, Склад CU, Зона РМУ, Мебельный', shortLabel: 'СиМ / CU' },
    { id: 207, terminal: 'T2', range: 'BQ22:BW23', label: 'Кабинеты / 3 этаж' },
    { id: 208, terminal: 'T2', range: 'AU24:BC35', label: 'Вафельный цех' },
    { id: 209, terminal: 'T2', range: 'BQ28:BW35', label: 'Временный склад оборудования ТМЦ', shortLabel: 'ТМЦ врем.' },
    { id: 210, terminal: 'T2', range: 'R29:W35', label: 'Зона отгрузки ГП робот', shortLabel: 'Отгр. робот' },
    { id: 211, terminal: 'T2', range: 'R40:AA43', label: 'Склад гофротары' },
    { id: 212, terminal: 'T2', range: 'AD40:AI43', label: 'АХЦ' },
    { id: 213, terminal: 'T2', range: 'AM42:AP43', label: 'ТП / Трансформаторная' },
    { id: 214, terminal: 'T2', range: 'BK43:BP45', label: 'Молокоприемка', shortLabel: 'Молокоп.' },
    { id: 215, terminal: 'T2', range: 'F47:L52', label: 'ЛОС / Локальные очистные сооружения', shortLabel: 'ЛОС' },
    { id: 216, terminal: 'T2', range: 'R48:W52', label: 'Кабинеты МЦ-3 / 2 этаж' },
    { id: 217, terminal: 'T2', range: 'X48:AC61', label: 'Склад роботизированный МЦ-3 / блок 1', shortLabel: 'Роб. МЦ3-1' },
    { id: 218, terminal: 'T2', range: 'AD48:AI61', label: 'Склад роботизированный МЦ-3 / блок 2', shortLabel: 'Роб. МЦ3-2' },
    { id: 219, terminal: 'T2', range: 'AJ48:AR52', label: 'Формирование гофротары', shortLabel: 'Гофротара' },
    { id: 220, terminal: 'T2', range: 'AU48:BC59', label: 'Производство МЦ-3 / южный блок', shortLabel: 'МЦ-3 юг' },
    { id: 221, terminal: 'T2', range: 'BF48:BP49', label: 'Техпомещения / компрессорная', shortLabel: 'Техпом.' },
    { id: 222, terminal: 'T2', range: 'BQ48:BU61', label: 'Склад СиМ / высота до 3 этажа', shortLabel: 'Склад СиМ' },
    { id: 223, terminal: 'T2', range: 'BV48:BW54', label: 'Кабинеты / 3 этаж (МЦ-3)' },
    { id: 224, terminal: 'T2', range: 'R53:W61', label: 'Зона отгрузки ГП МЦ-3', shortLabel: 'Отгр. МЦ3' },
    { id: 225, terminal: 'T2', range: 'AJ53:AR57', label: 'Зона паллетизации МЦ-3', shortLabel: 'Паллет. МЦ3' },
    { id: 226, terminal: 'T2', range: 'AJ58:AR59', label: 'Склад брака' },
    { id: 227, terminal: 'T2', range: 'BF59:BP61', label: 'Зона маркетинга / 2 этаж', shortLabel: 'Маркетинг' },
    { id: 228, terminal: 'T2', range: 'E66:K66', label: 'Сортировочная АХО' },
    { id: 229, terminal: 'T2', range: 'AJ71:BE71', label: 'Кабинеты / 6 этаж' },
    { id: 230, terminal: 'T2', range: 'BL71:BQ71', label: 'АКНЦ / 6 этаж' },
    { id: 231, terminal: 'T2', range: 'AJ72:BE72', label: 'Кабинеты / 5 этаж' },
    { id: 232, terminal: 'T2', range: 'BL72:BQ72', label: 'АКНЦ / 5 этаж' },
    { id: 233, terminal: 'T2', range: 'AJ73:BE73', label: 'Лаборатория / 4 этаж' },
    { id: 234, terminal: 'T2', range: 'BL73:BQ73', label: 'АКНЦ / 4 этаж' },
    { id: 235, terminal: 'T2', range: 'AJ74:BE74', label: 'Столовая, раздевалки / 3 этаж' },
    { id: 236, terminal: 'T2', range: 'BL74:BQ74', label: 'БиОТ и HR / 3 этаж' },
    { id: 237, terminal: 'T2', range: 'AJ75:BE75', label: 'Столовая, раздевалки / 2 этаж' },
    { id: 238, terminal: 'T2', range: 'BL75:BQ75', label: 'HR Кадры / 2 этаж' },
    { id: 239, terminal: 'T2', range: 'AJ76:BE77', label: 'Столовая для уличных, раздевалки / 1 этаж' },
    { id: 240, terminal: 'T2', range: 'BL76:BQ77', label: 'КПП-Турникеты / 1 этаж' },

    { id: 301, terminal: 'T3', range: 'Q7:U14', label: 'С1 / Пикинг мороженого' },
    { id: 302, terminal: 'T3', range: 'X7:AB14', label: 'С2 / Сегмент 1' },
    { id: 303, terminal: 'T3', range: 'AE7:AI14', label: 'С3 / Сегмент 2' },
    { id: 304, terminal: 'T3', range: 'AL7:AP14', label: 'С4 / Склад CU' },
    { id: 305, terminal: 'T3', range: 'AS7:AW14', label: 'С5 / Производство CU', shortLabel: 'С5' },
    { id: 306, terminal: 'T3', range: 'AZ7:BD14', label: 'С6 / Склад стройматериалов и оборудования CU', shortLabel: 'С6' },
    { id: 307, terminal: 'T3', range: 'BG7:BK14', label: 'С7 / Склад МК и ремонт техники', shortLabel: 'С7' },
    { id: 308, terminal: 'T3', range: 'BN7:BR14', label: 'С8 / Производство и ремонт поддонов', shortLabel: 'С8' },
    { id: 309, terminal: 'T3', range: 'BU7:BY14', label: 'С9 / Мебельный цех' },
    { id: 310, terminal: 'T3', range: 'BO18:BR18', label: 'Склад по строительству / Выпал из-за Сегменты 2', shortLabel: 'Стройсклад' },
    { id: 311, terminal: 'T3', range: 'Q19:U26', label: 'В1 / Дэсанг' },
    { id: 312, terminal: 'T3', range: 'X19:AB26', label: 'В2 / Свободно' },
    { id: 313, terminal: 'T3', range: 'AE19:AI26', label: 'В3 / Свободно' },
    { id: 314, terminal: 'T3', range: 'AL19:AP26', label: 'В4 / Склад гофротары' },
    { id: 315, terminal: 'T3', range: 'AS19:AW26', label: 'В5 / Склад ТМЦ основной' },
    { id: 316, terminal: 'T3', range: 'AZ19:BD26', label: 'В6 / Мастерская' },
    { id: 317, terminal: 'T3', range: 'BG19:BK26', label: 'В7 / Сварочный участок' },
    { id: 318, terminal: 'T3', range: 'T28:AE43', label: 'А2 / CU Производство и РЦ', shortLabel: 'А2' },
    { id: 319, terminal: 'T3', range: 'P46:R49', label: 'А1 / Рембокс', shortLabel: 'А1' },
];

const REAL_TERMINAL_LOCATIONS = REAL_TERMINAL_LOCATIONS_RAW.map(createLocation);

const SYNTHETIC_CODE_LOCATIONS: Location[] = Array.from(
    TERMINAL_SCHEME_SOURCE.reduce((map, item, index) => {
        const code = extractSchemeCode(item.label);

        if (!code) {
            return map;
        }

        const key = `${item.terminal}:${code}`;
        if (map.has(key)) {
            return map;
        }

        const alreadyExists = REAL_TERMINAL_LOCATIONS.some((location) => (
            location.terminal === item.terminal && location.building.toUpperCase() === code
        ));

        if (alreadyExists) {
            return map;
        }

        map.set(key, {
            id: 5000 + index,
            terminal: item.terminal,
            building: code,
            shortLabel: code,
            gate: code.startsWith('G') ? code : '',
            purpose: code.startsWith('G') ? 'Гейт терминала' : 'Маркер схемы',
            status: item.terminal === 'T3' ? 'pending' : 'active',
            code,
            range: item.range,
        });

        return map;
    }, new Map<string, Location>()).values(),
);

const T4_LOCATIONS: Location[] = [
    { id: 401, terminal: 'T4', building: 'A1', gate: '', purpose: 'Не используется', status: 'empty', code: 'A1' },
];

export const MOCK_LOCATIONS: Location[] = [
    ...REAL_TERMINAL_LOCATIONS,
    ...SYNTHETIC_CODE_LOCATIONS,
    ...T4_LOCATIONS,
];

export const TERMINAL_SCHEME_LAYOUTS: Record<Exclude<KnownTerminal, 'T4'>, TerminalSchemeLayout> = {
    T1: { cols: 66, rows: 50 },
    T2: { cols: 89, rows: 81 },
    T3: { cols: 80, rows: 52 },
};

const locationByRange = new Map(
    REAL_TERMINAL_LOCATIONS
        .filter((location) => location.range)
        .map((location) => [`${location.terminal}:${location.range}`, location]),
);

const locationByCode = new Map(
    MOCK_LOCATIONS
        .filter((location) => location.code)
        .map((location) => [`${location.terminal}:${location.code}`, location]),
);

export const TERMINAL_SCHEME_ITEMS: TerminalSchemeItem[] = TERMINAL_SCHEME_SOURCE.map((item, index) => {
    const matchedLocation = locationByRange.get(`${item.terminal}:${item.range}`);
    const matchedByCode = extractSchemeCode(item.label)
        ? locationByCode.get(`${item.terminal}:${extractSchemeCode(item.label)}`)
        : undefined;

    return {
        id: `scheme-${item.terminal}-${index + 1}`,
        terminal: item.terminal,
        range: item.range,
        label: item.label,
        tone: inferTone(item.label),
        locationId: matchedLocation?.id ?? matchedByCode?.id,
    };
});

export const TERMINAL_INFO: Record<string, { label: string; description: string; color: string }> = {
    T1: { label: 'Терминал 1', description: 'Схема из Excel: производственные и складские зоны T1', color: 'bg-green-100 text-green-800 border-green-200' },
    T2: { label: 'Терминал 2', description: 'Схема из Excel: блоки T2, МЦ-3, АХЦ и административные зоны', color: 'bg-green-100 text-green-800 border-green-200' },
    T3: { label: 'Терминал 3', description: 'Схема из Excel: С-, В- и А-зоны T3. Терминал ещё уточняется', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    T4: { label: 'Терминал 4', description: 'Оставлен без изменений', color: 'bg-gray-100 text-gray-500 border-gray-200' },
};
