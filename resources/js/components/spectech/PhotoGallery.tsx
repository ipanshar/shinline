import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ImageOff } from 'lucide-react';

interface PhotoGalleryProps {
    photos: string[];
    compact?: boolean;
    className?: string;
}

export default function PhotoGallery({ photos, compact = false, className = '' }: PhotoGalleryProps) {
    const [failed, setFailed] = useState<Record<number, boolean>>({});

    useEffect(() => {
        setFailed({});
    }, [photos]);

    const layoutClass = useMemo(
        () => (compact ? 'flex gap-2 flex-wrap' : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'),
        [compact],
    );

    if (!photos.length) {
        return <span className="text-xs text-[#6B6B6B]">Фото не прикреплены</span>;
    }

    return (
        <div className={`${layoutClass} ${className}`.trim()}>
            {photos.map((photo, index) => {
                const broken = Boolean(failed[index]);

                return (
                    <a
                        key={`${photo}-${index}`}
                        href={photo}
                        target="_blank"
                        rel="noreferrer"
                        className={`group overflow-hidden rounded-lg border border-[#E8E8E8] bg-white transition hover:shadow-sm ${
                            compact ? 'w-24' : 'w-full'
                        }`}
                    >
                        <div className={`${compact ? 'h-24' : 'aspect-[4/3]'} bg-[#F7F7F7]`}>
                            {broken ? (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-[#6B6B6B]">
                                    <ImageOff className="h-5 w-5 text-[#C2C2C2]" />
                                    <span>Фото не загрузилось</span>
                                </div>
                            ) : (
                                <img
                                    src={photo}
                                    alt={`Фото ${index + 1}`}
                                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                                    loading="lazy"
                                    onError={() => setFailed((current) => ({ ...current, [index]: true }))}
                                />
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-[#6B6B6B]">
                            <span className="truncate">Фото {index + 1}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </div>
                    </a>
                );
            })}
        </div>
    );
}

