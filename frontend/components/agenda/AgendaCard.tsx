'use client';
import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Icon, IconName } from '@/components/ui/Icon';
import { deadlineCountdown } from '@/lib/tournament';

export interface AgendaCardProps {
  icon: IconName;              // trophy (compétition) / bolt (animation)
  accent: string;              // teinte de la tuile d'icône
  tag: string;                 // « P500 · Messieurs » / « Mêlée »
  title: string;
  dateLabel: string;           // « jeudi 9 juillet · 14h01 »
  deadline: string;            // ISO — compte à rebours avant clôture
  now: Date | null;            // null avant le mount (hydration-safe)
  ratio: number | null;        // remplissage 0..1, null = pas de jauge
  places: { text: string; urgent: boolean };
  extra?: string | null;       // « 40 € » / « Membres » — chip discret
  onClick: () => void;
}

// Carte de la liste Events : tuile icône teintée, infos, countdown, jauge de remplissage.
export function AgendaCard({ icon, accent, tag, title, dateLabel, deadline, now, ratio, places, extra, onClick }: AgendaCardProps) {
  const { th } = useTheme();
  const countdown = now ? deadlineCountdown(deadline, now) : null;

  return (
    <button onClick={onClick} style={{
      border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
      background: th.surface, borderRadius: 16, padding: '14px 16px', boxShadow: `inset 0 0 0 1px ${th.line}`,
      display: 'flex', alignItems: 'flex-start', gap: 13,
    }}>
      <span aria-hidden="true" style={{
        width: 42, height: 42, borderRadius: 13, flexShrink: 0, marginTop: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: th.mode === 'floodlit' ? `${accent}24` : `${accent}40`,
      }}>
        <Icon name={icon} size={20} color={th.mode === 'floodlit' ? accent : th.ink} />
      </span>

      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: th.fontUI, fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
          <span style={{ flex: 1 }} />
          {countdown && (
            <span style={{
              fontFamily: th.fontUI, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', borderRadius: 999, padding: '3px 9px',
              background: countdown.urgent ? (th.mode === 'floodlit' ? `${ACCENTS.coral}26` : `${ACCENTS.coral}40`) : th.surface2,
              color: countdown.urgent ? (th.mode === 'floodlit' ? ACCENTS.coral : th.ink) : th.textMute,
            }}>
              {countdown.text}
            </span>
          )}
        </span>

        <span style={{ fontFamily: th.fontUI, fontSize: 16.5, fontWeight: 700, color: th.text }}>{title}</span>
        <span style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute }}>
          {dateLabel}{extra ? ` · ${extra}` : ''}
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5 }}>
          {ratio != null && (
            <span style={{ flex: '0 1 120px', height: 5, borderRadius: 999, background: th.surface2, overflow: 'hidden' }}>
              <span data-testid="card-fill" style={{ display: 'block', height: '100%', borderRadius: 999, background: places.urgent ? ACCENTS.coral : th.accent, width: now ? `${Math.round(ratio * 100)}%` : 0, transition: 'width .8s ease' }} />
            </span>
          )}
          <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: places.urgent ? 700 : 600, color: places.urgent ? ACCENTS.coral : th.textMute }}>{places.text}</span>
        </span>
      </span>

      <Icon name="chevR" size={17} color={th.textFaint} style={{ alignSelf: 'center' }} />
    </button>
  );
}
