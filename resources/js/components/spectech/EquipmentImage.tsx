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
        if (imageUrl) list.push(imageUrl);
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

export default EquipmentImage;

