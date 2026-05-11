import React, { useRef, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

interface Props {
  schedules: any[];
  equipmentTypes?: any[];
  onEventUpdate: (id: number, start: string, end: string) => void;
  onEventClick?: (id: number) => void;
}

// Яркие цвета событий с контрастным белым текстом
const STATUS_EVENT_COLORS: Record<string, { bg: string; border: string }> = {
  pending:     { bg: '#78909C', border: '#546E7A' },
  confirmed:   { bg: '#1E88E5', border: '#1565C0' },
  in_progress: { bg: '#5E35B1', border: '#4527A0' },
  done:        { bg: '#43A047', border: '#2E7D32' },
  cancelled:   { bg: '#E53935', border: '#C62828' },
};

export default function CalendarView({ schedules, onEventUpdate, onEventClick }: Props) {
  const calRef = useRef<any>(null);

  const events = useMemo(() => schedules.map(s => {
    const col = STATUS_EVENT_COLORS[s.status] ?? STATUS_EVENT_COLORS.pending;
    return {
      id: String(s.id),
      title: `${s.equipment_type_label ?? ''}: ${s.purpose ?? 'Запись'}`,
      start: s.scheduled_start,
      end: s.scheduled_end,
      backgroundColor: col.bg,
      borderColor: col.border,
      textColor: '#ffffff',
      extendedProps: { raw: s },
    };
  }), [schedules]);

  return (
    <div className="fc-wrapper">
      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        locale="ru"
        firstDay={1}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        buttonText={{
          today: 'Сегодня',
          month: 'Месяц',
          week:  'Неделя',
          day:   'День',
        }}
        editable={true}
        selectable={false}
        events={events}
        eventDrop={info => {
          const id = Number(info.event.id);
          const start = info.event.start?.toISOString() ?? null;
          const end   = info.event.end?.toISOString() ?? null;
          if (start && end) onEventUpdate(id, start, end);
          else info.revert();
        }}
        eventResize={info => {
          const id = Number(info.event.id);
          const start = info.event.start?.toISOString() ?? null;
          const end   = info.event.end?.toISOString() ?? null;
          if (start && end) onEventUpdate(id, start, end);
          else info.revert();
        }}
        eventClick={info => onEventClick && onEventClick(Number(info.event.id))}
        height={680}
        nowIndicator={true}
        dayMaxEventRows={4}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
      />
    </div>
  );
}
