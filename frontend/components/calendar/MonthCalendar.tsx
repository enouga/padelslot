'use client';

import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Icon } from '@/components/ui/Icon';
import { CalendarEntry, monthGrid, monthLabel } from '@/lib/calendar';

const DOW = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const GAP = 4;

export function MonthCalendar({
  year, month, byDay, selected, todayKey, onSelect, onNavigate,
}: {
  year: number;
  month: number;
  byDay: Map<string, CalendarEntry[]>;
  selected: string | null;
  todayKey: string;
  onSelect: (key: string) => void;
  onNavigate: (delta: 1 | -1) => void;
}) {
  const { th } = useTheme();
  const weeks = monthGrid(year, month);
  // Pastilles réservation en bleu marque (et non th.accent, surchargé par la couleur du club).
  const resaColor = ACCENTS.blue;

  const navBtn = (label: string, icon: 'chevL' | 'chevR', delta: 1 | -1) => (
    <button onClick={() => onNavigate(delta)} aria-label={label}
      style={{
        width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: th.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <Icon name={icon} size={18} color={th.text} />
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {navBtn('Mois précédent', 'chevL', -1)}
        <div style={{ flex: 1, textAlign: 'center', fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 18, color: th.text, textTransform: 'capitalize' }}>
          {monthLabel(year, month)}
        </div>
        {navBtn('Mois suivant', 'chevR', 1)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, fontFamily: th.fontUI, fontSize: 11.5, color: th.textMute }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: resaColor }} />Réservation
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 5, borderRadius: 3, background: th.accentWarm }} />Tournoi
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: GAP, marginTop: 12 }}>
        {DOW.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontFamily: th.fontUI, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: th.textFaint, paddingBottom: 2 }}>
            {d}
          </div>
        ))}
        {weeks.flat().map((cell) => {
          const entries = byDay.get(cell.key) ?? [];
          const reservations = entries.filter((e) => e.kind === 'reservation');
          const tournament = entries.find((e) => e.kind === 'tournament');
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selected;
          const dim = !cell.inMonth;
          return (
            <button key={cell.key} data-day-key={cell.key} data-today={isToday ? 'true' : undefined}
              aria-pressed={isSelected} aria-label={`Jour ${cell.key}`}
              onClick={() => onSelect(cell.key)}
              style={{
                position: 'relative', minHeight: 52, borderRadius: 12, border: 'none', cursor: 'pointer',
                padding: '7px 6px 12px', textAlign: 'left', verticalAlign: 'top',
                background: isSelected ? th.ink : dim ? 'transparent' : th.surface,
                boxShadow: isSelected ? 'none' : isToday ? `inset 0 0 0 1.5px ${th.accent}` : dim ? 'none' : `inset 0 0 0 1px ${th.line}`,
                WebkitTapHighlightColor: 'transparent',
              }}>
              <span style={{
                fontFamily: th.fontUI, fontSize: 12.5, fontWeight: isToday ? 700 : 500,
                color: isSelected ? (th.mode === 'floodlit' ? th.text : '#f7f5ee') : dim ? th.textFaint : isToday ? th.accent : th.text,
              }}>
                {cell.day}
              </span>
              {reservations.length > 0 && (
                <span style={{ position: 'absolute', left: 6, bottom: tournament ? 13 : 6, display: 'flex', gap: 3, alignItems: 'center' }}>
                  {reservations.slice(0, 3).map((e) => (
                    <span key={e.id} data-marker="reservation"
                      style={{ width: 5, height: 5, borderRadius: '50%', background: resaColor, opacity: e.past ? 0.4 : 1 }} />
                  ))}
                  {reservations.length > 3 && (
                    <span style={{ fontFamily: th.fontUI, fontSize: 9, color: th.textMute }}>+{reservations.length - 3}</span>
                  )}
                </span>
              )}
              {tournament && tournament.kind === 'tournament' && (
                <span data-marker="tournament"
                  style={{
                    position: 'absolute', bottom: 5, height: 5, background: th.accentWarm,
                    opacity: tournament.past ? 0.4 : 1,
                    // Barre continue d'un jour à l'autre : on déborde sur le gap de la
                    // grille, sauf aux extrémités du tournoi (arrondies).
                    left: cell.key === tournament.startKey ? 6 : -(GAP / 2),
                    right: cell.key === tournament.endKey ? 6 : -(GAP / 2),
                    borderTopLeftRadius: cell.key === tournament.startKey ? 3 : 0,
                    borderBottomLeftRadius: cell.key === tournament.startKey ? 3 : 0,
                    borderTopRightRadius: cell.key === tournament.endKey ? 3 : 0,
                    borderBottomRightRadius: cell.key === tournament.endKey ? 3 : 0,
                  }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
