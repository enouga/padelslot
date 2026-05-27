'use client';
import { TimeSlot } from '@/lib/api';

interface CourtCalendarProps {
  slots: TimeSlot[];
  onSelectSlot: (slot: TimeSlot) => void;
  selectedSlot: TimeSlot | null;
}

function formatHour(isoString: string): string {
  const date = new Date(isoString);
  // Paris time = UTC+2 (summer) — TODO: use proper timezone library for production
  const parisHour   = (date.getUTCHours() + 2) % 24;
  const parisMinute = date.getUTCMinutes();
  return `${String(parisHour).padStart(2, '0')}h${String(parisMinute).padStart(2, '0')}`;
}

export default function CourtCalendar({
  slots,
  onSelectSlot,
  selectedSlot,
}: CourtCalendarProps) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {slots.map((slot) => {
        const isSelected = selectedSlot?.startTime === slot.startTime;

        if (!slot.available) {
          return (
            <div
              key={slot.startTime}
              className="rounded-lg bg-gray-100 p-3 text-center text-sm text-gray-400 cursor-not-allowed"
            >
              <div className="font-medium">{formatHour(slot.startTime)}</div>
              <div className="text-xs">Indisponible</div>
            </div>
          );
        }

        return (
          <button
            key={slot.startTime}
            onClick={() => onSelectSlot(slot)}
            aria-label={`Réserver ${formatHour(slot.startTime)}`}
            className={[
              'rounded-lg p-3 text-center text-sm transition-all',
              isSelected
                ? 'bg-green-600 text-white ring-2 ring-green-800 ring-offset-1'
                : 'bg-green-100 text-green-800 hover:bg-green-200',
            ].join(' ')}
          >
            <div className="font-medium">{formatHour(slot.startTime)}</div>
            <div className="text-xs">Réserver</div>
          </button>
        );
      })}
    </div>
  );
}
