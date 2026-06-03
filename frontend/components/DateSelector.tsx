'use client';
import { useState } from 'react';
import { useTheme } from '@/lib/ThemeProvider';

interface DateSelectorProps {
  /** date sélectionnée, format 'YYYY-MM-DD' */
  value: string;
  onChange: (date: string) => void;
  /** jours encore ouverts (point apricot). Si omis : tous les jours futurs. */
  openDates?: Set<string>;
  /** nombre de jours affichés. Défaut 7. */
  days?: number;
  /** dernier jour sélectionnable 'YYYY-MM-DD' (fenêtre de réservation). Optionnel. */
  maxKey?: string;
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

/** Sélecteur de dates « proposition B » : semaine navigable, jour actif en pastille
 *  accent (bleu Palova), point apricot = jour ouvert. Stylé via le thème. */
export default function DateSelector({ value, onChange, openDates, days = 7, maxKey }: DateSelectorProps) {
  const { th } = useTheme();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toKey(today);

  // Début de la fenêtre affichée (avance/recule par semaine).
  const [start, setStart] = useState<Date>(today);
  // Jour survolé (effet de survol sur les pastilles).
  const [hover, setHover] = useState<string | null>(null);

  const list = Array.from({ length: days }, (_, i) => addDays(start, i));
  const monthLabel = MONTHS[list[Math.floor(days / 2)].getMonth()];
  const canPrev = toKey(start) > todayKey;
  const canNext = maxKey ? toKey(addDays(start, days)) <= maxKey : true;

  const arrowStyle = (enabled: boolean): React.CSSProperties => ({
    width: 34, height: 34, borderRadius: 10, border: `1px solid ${th.line}`, background: 'transparent',
    color: th.textMute, cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.3,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1, flexShrink: 0,
  });

  return (
    <div>
      {/* En-tête mois + navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 22, color: th.text, textTransform: 'capitalize' }}>{monthLabel}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => canPrev && setStart(addDays(start, -days))} disabled={!canPrev} aria-label="Semaine précédente" style={arrowStyle(canPrev)}>‹</button>
          <button type="button" onClick={() => canNext && setStart(addDays(start, days))} disabled={!canNext} aria-label="Semaine suivante" style={arrowStyle(canNext)}>›</button>
        </div>
      </div>

      {/* Bande de jours — pastilles rectangulaires compactes (jour abrégé + numéro empilés) */}
      <div style={{ display: 'flex', gap: 5 }}>
        {list.map((d) => {
          const key = toKey(d);
          const isPast = key < todayKey;
          const isSel = key === value;
          const tooFar = maxKey ? key > maxKey : false;
          const disabled = isPast || tooFar;
          const isOpen = !disabled && (openDates ? openDates.has(key) : true);
          const isHover = hover === key && !disabled && !isSel;

          return (
            <button
              key={key}
              type="button"
              onClick={() => !disabled && onChange(key)}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover((h) => (h === key ? null : h))}
              disabled={disabled}
              aria-pressed={isSel}
              aria-label={`${WEEKDAYS[d.getDay()]} ${d.getDate()}`}
              style={{
                flex: 1, minWidth: 0, cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '6px 2px 5px', borderRadius: 10,
                border: `1px solid ${isSel ? th.accent : isHover ? th.lineStrong : th.line}`,
                background: isSel ? th.accent : isHover ? th.surface2 : th.surface,
                opacity: disabled ? 0.4 : 1,
                transition: 'background .16s, border-color .16s, box-shadow .18s, transform .14s, filter .15s',
                boxShadow: isSel ? (th.neon ? `0 0 0 1px ${th.accent}, 0 5px 14px ${th.accent}55` : `0 4px 12px ${th.accent}40`) : 'none',
              }}
            >
              <span style={{
                fontFamily: th.fontMono, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3,
                color: isSel ? th.onAccent : th.textMute,
              }}>{WEEKDAYS[d.getDay()]}</span>
              <span style={{
                fontFamily: th.fontDisplay, fontSize: 16, fontWeight: 600, lineHeight: 1,
                color: isSel ? th.onAccent : disabled ? th.textFaint : th.text,
              }}>{String(d.getDate()).padStart(2, '0')}</span>
              <span style={{
                width: 4, height: 4, borderRadius: '50%',
                background: isSel ? th.onAccent : th.accentWarm,
                opacity: isOpen ? (isSel ? 0.9 : 1) : 0, transition: 'opacity .15s',
              }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
