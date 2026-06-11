import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type GreenlogLocation } from '@/lib/greenlog-api';
import { MapPinned } from 'lucide-react';
import {
    buildGreenlogLocationMeta,
    buildGreenlogLocationSubtitle,
    buildGreenlogLocationTitle,
} from '@/components/greenlog/GREENLOG_LOCATIONS';

interface UnplacedLocationsPanelProps {
    locations: GreenlogLocation[];
    selectedLocationId: number | null;
    onSelectLocation: (locationId: number) => void;
    onStartPlacement: (location: GreenlogLocation) => void;
}

export function UnplacedLocationsPanel({
    locations,
    selectedLocationId,
    onSelectLocation,
    onStartPlacement,
}: UnplacedLocationsPanelProps) {
    return (
        <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold">Не размещены на карте</div>
                    <div className="text-muted-foreground text-xs">
                        Выберите локацию и поставьте точку кликом по карте.
                    </div>
                </div>
                <Badge variant="outline">{locations.length}</Badge>
            </div>

            {locations.length === 0 ? (
                <div className="text-muted-foreground mt-4 rounded-lg border border-dashed px-4 py-6 text-center">
                    Все локации уже размещены.
                </div>
            ) : (
                <ScrollArea className="mt-4 h-[320px] pr-3">
                    <div className="space-y-3">
                        {locations.map((location) => {
                            const isSelected = selectedLocationId === location.id;

                            return (
                                <div
                                    key={location.id}
                                    className={`rounded-xl border p-3 ${
                                        isSelected ? 'border-green-300 bg-green-50' : 'border-border'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        className="w-full text-left"
                                        onClick={() => onSelectLocation(location.id)}
                                    >
                                        <div className="text-sm font-semibold">{buildGreenlogLocationTitle(location)}</div>
                                        <div className="text-muted-foreground mt-1 text-xs">
                                            {buildGreenlogLocationSubtitle(location)}
                                        </div>
                                        <div className="text-muted-foreground mt-2 text-xs">
                                            {buildGreenlogLocationMeta(location) || 'Без уточнения'}
                                        </div>
                                    </button>
                                    <Button className="mt-3 w-full" variant="outline" onClick={() => onStartPlacement(location)}>
                                        <MapPinned className="h-4 w-4" />
                                        Установить точку
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
}
