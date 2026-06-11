import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Hand, Minus, Move, Plus, RotateCcw, ScanLine } from 'lucide-react';

interface MapToolbarProps {
    canEdit: boolean;
    gridEnabled: boolean;
    panEnabled: boolean;
    zoom: number;
    mappedCount: number;
    placementMode: boolean;
    editMode: boolean;
    onToggleGrid: (pressed: boolean) => void;
    onTogglePan: (pressed: boolean) => void;
    onToggleEditMode: (pressed: boolean) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetView: () => void;
}

export function MapToolbar({
    canEdit,
    gridEnabled,
    panEnabled,
    zoom,
    mappedCount,
    placementMode,
    editMode,
    onToggleGrid,
    onTogglePan,
    onToggleEditMode,
    onZoomIn,
    onZoomOut,
    onResetView,
}: MapToolbarProps) {
    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200/70 bg-white/85 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="text-base font-semibold">Карта Shin Line Flora</div>
                    <div className="text-muted-foreground text-sm">
                        Интерактивная схема завода с локациями и координатами в процентах.
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{mappedCount} точек</Badge>
                    {placementMode ? (
                        <Badge className="border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                            Установка точки
                        </Badge>
                    ) : null}
                    {editMode ? (
                        <Badge className="border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100">
                            Редактирование
                        </Badge>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
                <Toggle pressed={gridEnabled} variant="outline" onPressedChange={onToggleGrid}>
                    <ScanLine className="h-4 w-4" />
                    Показать сетку
                </Toggle>

                <Toggle pressed={panEnabled} variant="outline" onPressedChange={onTogglePan}>
                    <Hand className="h-4 w-4" />
                    Pan
                </Toggle>

                {canEdit ? (
                    <Toggle pressed={editMode} variant="outline" onPressedChange={onToggleEditMode}>
                        <Move className="h-4 w-4" />
                        Drag точек
                    </Toggle>
                ) : null}

                <div className="ml-auto flex items-center gap-2">
                    <Button type="button" size="icon" variant="outline" onClick={onZoomOut}>
                        <Minus className="h-4 w-4" />
                    </Button>
                    <div className="min-w-16 text-center text-sm font-medium">{Math.round(zoom * 100)}%</div>
                    <Button type="button" size="icon" variant="outline" onClick={onZoomIn}>
                        <Plus className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" onClick={onResetView}>
                        <RotateCcw className="h-4 w-4" />
                        Reset
                    </Button>
                </div>
            </div>
        </div>
    );
}
