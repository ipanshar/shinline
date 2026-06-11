import { Group, Circle, Label, Tag, Text } from 'react-konva';
import { type GreenlogLocation } from '@/lib/greenlog-api';
import { buildGreenlogLocationTitle, clampGreenlogMarkerSize } from '@/components/greenlog/GREENLOG_LOCATIONS';

interface LocationMarkerProps {
    location: GreenlogLocation;
    x: number;
    y: number;
    selected: boolean;
    hovered: boolean;
    draggable: boolean;
    onSelect: () => void;
    onHover: (hovered: boolean) => void;
    onDragStart: () => void;
    onDragEnd: (position: { x: number; y: number }) => void;
}

export function LocationMarker({
    location,
    x,
    y,
    selected,
    hovered,
    draggable,
    onSelect,
    onHover,
    onDragStart,
    onDragEnd,
}: LocationMarkerProps) {
    const radius = clampGreenlogMarkerSize(location.marker_size);
    const title = buildGreenlogLocationTitle(location);
    const plantsCount = location.plants_count ?? 0;

    return (
        <Group
            x={x}
            y={y}
            draggable={draggable}
            onClick={(event) => {
                event.cancelBubble = true;
                onSelect();
            }}
            onTap={(event) => {
                event.cancelBubble = true;
                onSelect();
            }}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
            onDragStart={(event) => {
                event.cancelBubble = true;
                onDragStart();
            }}
            onDragEnd={(event) => {
                event.cancelBubble = true;
                onDragEnd(event.target.position());
            }}
        >
            <Circle
                radius={radius + (selected ? 10 : hovered ? 6 : 0)}
                fill={selected ? 'rgba(132,204,22,0.25)' : 'rgba(16,185,129,0.16)'}
                listening={false}
            />
            <Circle
                radius={radius}
                fill={selected ? '#84cc16' : hovered ? '#22c55e' : '#059669'}
                stroke="#ffffff"
                strokeWidth={2}
                shadowBlur={selected ? 14 : 8}
                shadowColor="rgba(15, 23, 42, 0.35)"
            />

            <Label x={radius + 10} y={-radius - 14} listening={false}>
                <Tag
                    fill={selected ? 'rgba(250,250,249,0.96)' : 'rgba(255,255,255,0.92)'}
                    cornerRadius={999}
                    stroke={selected ? '#84cc16' : '#d1d5db'}
                    strokeWidth={1}
                    shadowBlur={selected ? 10 : 4}
                    shadowColor="rgba(15, 23, 42, 0.15)"
                />
                <Text
                    text={`${title} • ${plantsCount}`}
                    padding={8}
                    fontSize={12}
                    fontStyle={selected ? 'bold' : 'normal'}
                    fill="#0f172a"
                />
            </Label>
        </Group>
    );
}
