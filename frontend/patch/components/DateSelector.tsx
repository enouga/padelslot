'use client';
import { useState } from 'react';

interface DateSelectorProps {
  /** date sélectionnée, format 'YYYY-MM-DD' */
  value: string;
  onChange: (date: string) => void;
  /** jours encore ouverts (point apricot). Si omis : tous les jours futurs. */
  openDates?: Set<string>;
  /** nombre de jours affichés. Défaut 7. */
  days?: number;
}

const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function DateSelector({ value, onChange, openDates, days = 7 }: DateSelectorProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Début de la fenêtre affichée (avance/recule par semaine).
  const [start, setStart] = useState<Date>(today);

  const list = Array.from({ length: days }, (_, i) => addDays(start, i));
  const monthLabel = MONTHS[list[Math.floor(days / 2)].getMonth()];

  const selectedDate = list.find((d) => toKey(d) === value) ?? null;
  const captionDate = selectedDate ?? new Date(value || toKey(today));

  return (
    <div>
      {/* En-tête mois + navigation */}
      <div className="mb-4 flex items-center justify-between">
        <div className="font-display text-2xl font-semibold capitalize text-ink">{monthLabel}</div>
        <div className="flex gap-2">
          <button
            onClick={() => setStart(addDays(start, -days))}
            disabled={toKey(start) <= toKey(today)}
            aria-label="Semaine précédente"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 text-ink-soft hover:bg-paper disabled:opacity-30"
          >‹</button>
          <button
            onClick={() => setStart(addDays(start, days))}
            aria-label="Semaine suivante"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 text-ink-soft hover:bg-paper"
          >›</button>
        </div>
      </div>

      {/* Bande de jours */}
      <div className="flex justify-between gap-1">
        {list.map((d) => {
          const key = toKey(d);
          const isPast = key < toKey(today);
          const isSel = key === value;
          const isOpen = !isPast && (openDates ? openDates.has(key) : true);

          return (
            <button
              key={key}
              onClick={() => !isPast && onChange(key)}
              disabled={isPast}
              aria-pressed={isSel}
              aria-label={`${WEEKDAYS[d.getDay()]} ${d.getDate()}`}
              className="group flex flex-1 flex-col items-center pt-1 disabled:cursor-not-allowed"
            >
              <span className={`font-mono text-[10px] uppercase tracking-wide ${isSel ? 'font-bold text-brand-500' : 'text-faint'}`}>
                {WEEKDAYS[d.getDay()]}
              </span>
              <span
                className={[
                  'font-display mt-1.5 flex h-11 w-11 items-center justify-center rounded-full text-[26px] font-semibold transition-colors',
                  isSel ? 'bg-brand-500 text-white' : isPast ? 'text-faint' : 'text-ink group-hover:bg-paper-2',
                ].join(' ')}
                style={isSel ? { boxShadow: '0 10px 24px rgba(94,147,218,0.4)' } : undefined}
              >
                {d.getDate()}
              </span>
              <span
                className="mt-1.5 h-[5px] w-[5px] rounded-full bg-accent-400 transition-opacity"
                style={{ opacity: isOpen ? 1 : 0 }}
              />
            </button>
          );
        })}
      </div>

      {/* Bandeau sport */}
      <div className="mt-5 flex items-center gap-2.5 border-t border-ink/[0.07] pt-4">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-ink">Padel</span>
        <span className="text-xs capitalize text-mute">
          · {captionDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>
    </div>
  );
}
