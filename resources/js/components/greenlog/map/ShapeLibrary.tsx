import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    GREENLOG_SHAPE_LIBRARY,
    getDefaultShapeStyle,
    getShapePreset,
    type GreenlogMapShape,
    type GreenlogMapStyle,
} from './map-utils';

interface ShapeLibraryProps {
    selectedShape: GreenlogMapShape;
    selectedStyle?: GreenlogMapStyle | null;
    disabled?: boolean;
    saving?: boolean;
    onSelectShape: (shape: GreenlogMapShape) => void;
}

function ShapePreview({
    shape,
    style,
    className,
}: {
    shape: GreenlogMapShape;
    style?: GreenlogMapStyle | null;
    className?: string;
}) {
    const fallback = getDefaultShapeStyle(shape);
    const resolved = {
        fill: style?.fill ?? fallback.fill,
        stroke: style?.stroke ?? fallback.stroke,
        strokeWidth: style?.strokeWidth ?? fallback.strokeWidth,
        opacity: style?.opacity ?? fallback.opacity,
        radius: style?.radius ?? fallback.radius,
    };

    return (
        <svg className={cn('h-12 w-16', className)} viewBox="0 0 64 48">
            {shape === 'point' ? (
                <circle cx="32" cy="24" r="5" fill={resolved.fill} opacity={resolved.opacity} stroke={resolved.stroke} strokeWidth={resolved.strokeWidth} />
            ) : null}
            {shape === 'circle' ? (
                <circle cx="32" cy="24" r="13" fill={resolved.fill} opacity={resolved.opacity} stroke={resolved.stroke} strokeWidth={resolved.strokeWidth} />
            ) : null}
            {shape === 'square' ? (
                <rect x="18" y="10" width="28" height="28" rx="3" fill={resolved.fill} opacity={resolved.opacity} stroke={resolved.stroke} strokeWidth={resolved.strokeWidth} />
            ) : null}
            {shape === 'rectangle' ? (
                <rect x="12" y="13" width="40" height="22" rx="5" fill={resolved.fill} opacity={resolved.opacity} stroke={resolved.stroke} strokeWidth={resolved.strokeWidth} />
            ) : null}
            {shape === 'polygon' ? (
                <polygon points="14,33 30,9 52,16 46,36 20,39" fill={resolved.fill} opacity={resolved.opacity} stroke={resolved.stroke} strokeWidth={resolved.strokeWidth} />
            ) : null}
            {shape === 'line' ? (
                <line x1="14" y1="30" x2="50" y2="16" stroke={resolved.stroke} strokeWidth={Math.max(3, resolved.strokeWidth)} strokeLinecap="round" />
            ) : null}
            {shape === 'flower_bed' ? (
                <rect x="11" y="12" width="42" height="24" rx="12" fill={resolved.fill} opacity={resolved.opacity} stroke={resolved.stroke} strokeWidth={resolved.strokeWidth} />
            ) : null}
            {shape === 'checkpoint' ? (
                <>
                    <rect x="18" y="10" width="28" height="28" rx="4" fill={resolved.fill} opacity={resolved.opacity} stroke={resolved.stroke} strokeWidth={resolved.strokeWidth} />
                    <text x="32" y="28" textAnchor="middle" fontSize="10" fontWeight="700" fill={resolved.stroke}>КПП</text>
                </>
            ) : null}
        </svg>
    );
}

export function ShapeLibrary({
    selectedShape,
    selectedStyle,
    disabled = false,
    saving = false,
    onSelectShape,
}: ShapeLibraryProps) {
    const selectedPreset = getShapePreset(selectedShape);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-sm font-medium">Тип фигуры</div>
                    <div className="text-muted-foreground text-xs">Выберите готовую форму локации на карте.</div>
                </div>
                {saving ? <Badge variant="outline">Сохраняем…</Badge> : null}
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {GREENLOG_SHAPE_LIBRARY.map((preset) => {
                    const active = preset.shape === selectedShape;

                    return (
                        <Button
                            key={preset.shape}
                            type="button"
                            variant="outline"
                            disabled={disabled}
                            className={cn(
                                'h-auto justify-start px-3 py-3 text-left',
                                active && 'border-emerald-500 bg-emerald-50 text-emerald-950 hover:bg-emerald-50',
                            )}
                            onClick={() => onSelectShape(preset.shape)}
                        >
                            <div className="flex w-full items-center gap-3">
                                <ShapePreview shape={preset.shape} style={active ? selectedStyle : preset.defaultStyle} />
                                <div className="min-w-0">
                                    <div className="font-medium">{preset.label}</div>
                                    <div className="text-muted-foreground text-xs">{preset.description}</div>
                                </div>
                            </div>
                        </Button>
                    );
                })}
            </div>

            <div className="rounded-xl border bg-muted/20 p-3">
                <div className="flex items-center gap-3">
                    <ShapePreview shape={selectedShape} style={selectedStyle} className="h-16 w-20" />
                    <div className="min-w-0">
                        <div className="font-medium">{selectedPreset.label}</div>
                        <div className="text-muted-foreground text-sm">{selectedPreset.description}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
