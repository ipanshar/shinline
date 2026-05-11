import React, { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { resolveEquipmentPhotoCandidates } from '@/lib/equipment-photo';

interface EquipmentImageProps {
    /** Наименование техники (используется для auto-slug) */
    name: string | null | undefined;
    /** Гос. номер (используется для auto-slug) */
    plate: string | null | undefined;
    /** Явный URL (приоритетный, если задан) */
    imageUrl?: string | null;
    className?: string;
}

/**
 * Отображает фото техники.
 * Сначала пробует `imageUrl`, затем auto-slug кандидатов из /equipment/.
 * Если ни один не загрузился — показывает иконку-заглушку.
 */
const EquipmentImage: React.FC<EquipmentImageProps> = ({
    name,
    plate,
    imageUrl,
    className = 'w-full h-36 object-cover rounded-t-lg',
}) => {
    const [candidates, setCandidates] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const list: string[] = [];
        const normalizedImageUrl = normalizeImageUrl(imageUrl);
        if (normalizedImageUrl) list.push(normalizedImageUrl);
        list.push(...resolveEquipmentPhotoCandidates(name, plate));
        setCandidates(list);
        setCurrentIndex(0);
        setFailed(false);
    }, [imageUrl, name, plate]);

    const handleError = () => {
        const next = currentIndex + 1;
        if (next < candidates.length) {
            setCurrentIndex(next);
        } else {
            setFailed(true);
        }
    };

    if (failed || candidates.length === 0) {
        return (
            <div className={`${className} flex items-center justify-center bg-muted rounded-t-lg`}>
                <Truck className="h-10 w-10 text-muted-foreground/40" />
            </div>
        );
    }

    return (
        <img
            key={candidates[currentIndex]}
            src={candidates[currentIndex]}
            alt={name ?? 'Техника'}
            className={className}
            onError={handleError}
        />
    );
};

function normalizeImageUrl(imageUrl?: string | null): string | null {
    if (!imageUrl) return null;

    const value = imageUrl.trim();
    if (!value) return null;

    if (value.startsWith('/')) return value;
    if (value.startsWith('data:image')) return value;

    if (value.startsWith('http://') || value.startsWith('https://')) {
        try {
            const parsed = new URL(value);
            if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
                return `${parsed.pathname}${parsed.search}`;
            }
            return value;
        } catch {
            return value;
        }
    }

    return `/${value.replace(/^\/+/, '')}`;
}

export default EquipmentImage;


