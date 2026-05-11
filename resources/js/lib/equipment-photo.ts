/**
 * resolveEquipmentPhotoCandidates
 *
 * Строит список кандидатов URL для фото техники из /equipment/.
 * Формат файлов: {name-slug}-{plate-slug}.jpg
 * Пример: "Autocrane 25t" + "282FD02" → /equipment/autocrane-25t-282fd02.jpg
 */
export function resolveEquipmentPhotoCandidates(
    name: string | null | undefined,
    plate: string | null | undefined,
): string[] {
    if (!name) return [];

    const namePart = name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (!namePart) return [];

    if (plate && plate.trim()) {
        const platePart = plate
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9]/g, '');
        return [`/equipment/${namePart}-${platePart}.jpg`];
    }

    // Без номера — пробуем no-number, -1, -2
    return [
        `/equipment/${namePart}-no-number.jpg`,
        `/equipment/${namePart}-no-number-1.jpg`,
        `/equipment/${namePart}-no-number-2.jpg`,
        `/equipment/${namePart}-no-number-3.jpg`,
    ];
}


