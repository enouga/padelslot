'use client';
import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Icon, IconName } from '@/components/ui/Icon';
import { deadlineCountdown } from '@/lib/tournament';

// Fin du dégradé du hero : le bleu Palova plonge vers un bleu nuit profond
// (surtout pas vers le cyan, qui tirait vers le fluo).
const HERO_NAVY = '#2c4668';

/** Dégradé signature des heros (fiches tournoi/event, club-house). */
export const HERO_GRADIENT = `linear-gradient(115deg, ${ACCENTS.blue}, ${HERO_NAVY})`;

// Briques partagées par les fiches tournoi et event (et leurs heros).

// Pastille sur fond dégradé : couleurs fixes (le composant Chip lit le thème
// et deviendrait illisible en mode clair sur le dégradé). `urgent` = fond coral.
export function HeroPill({ children, strong, urgent }: { children: React.ReactNode; strong?: boolean; urgent?: boolean }) {
  const { th } = useTheme();
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: th.fontUI, fontWeight: 700,
      fontSize: 12.5, letterSpacing: 0.3, padding: '5px 11px', borderRadius: 999, whiteSpace: 'nowrap',
      background: urgent ? ACCENTS.coral : strong ? '#fff' : 'rgba(255,255,255,0.18)',
      color: strong && !urgent ? '#1d2733' : '#fff',
    }}>
      {children}
    </span>
  );
}

export interface AgendaHeroProps {
  pills: { label: string; strong?: boolean }[];
  title: string;
  subtitle: string;
  deadline: string;            // ISO — clôture des inscriptions (compte à rebours)
  now: Date | null;            // null avant le mount (hydration-safe)
  ratio: number | null;        // remplissage 0..1, null = pas de jauge
  counter: string;             // « 7/12 binômes » / « 9/16 inscrits »
  places: { text: string; urgent: boolean };
}

// Hero immersif : dégradé bleu Palova → bleu nuit, compte à rebours, jauge de
// remplissage animée, badge places restantes — l'urgence est portée par les
// badges coral, pas par le fond. `now` null au premier rendu : pas de
// countdown, jauge à 0 — le remplissage s'anime au mount via la transition CSS.
export function AgendaHero({ pills, title, subtitle, deadline, now, ratio, counter, places }: AgendaHeroProps) {
  const { th } = useTheme();
  const countdown = now ? deadlineCountdown(deadline, now) : null;

  return (
    <div style={{ padding: '12px 20px 0' }}>
      <div data-testid="agenda-hero" style={{ background: HERO_GRADIENT, borderRadius: 18, padding: '24px 22px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {pills.map((p) => <HeroPill key={p.label} strong={p.strong}>{p.label}</HeroPill>)}
          <span style={{ flex: 1 }} />
          {countdown && <HeroPill urgent={countdown.urgent}><Icon name="clock" size={13} color="#fff" />{countdown.text}</HeroPill>}
        </div>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 30, letterSpacing: -0.6, marginTop: 14, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontFamily: th.fontUI, fontSize: 13.5, opacity: 0.85, marginTop: 5 }}>{subtitle}</div>

        <div style={{ marginTop: 18 }}>
          {ratio != null && (
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
              <div data-testid="hero-fill" style={{ height: '100%', borderRadius: 999, background: '#fff', width: now ? `${Math.round(ratio * 100)}%` : 0, transition: 'width .8s ease' }} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: ratio != null ? 9 : 0, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: th.fontUI, fontSize: 13, fontWeight: 600 }}>{counter}</span>
            <span style={{ flex: 1 }} />
            <span style={{
              fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 700,
              ...(places.urgent ? { background: ACCENTS.coral, borderRadius: 999, padding: '4px 10px' } : { opacity: 0.95 }),
            }}>{places.text}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface MetaCard {
  icon: IconName;
  label: string;
  value: string;
}

// Rangée de cartes méta icônées sous le hero (début, clôture, prix…).
export function MetaCardsRow({ cards }: { cards: MetaCard[] }) {
  const { th } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 8, padding: '10px 20px 0', overflowX: 'auto' }}>
      {cards.map((c) => (
        <div key={c.label} style={{ flex: '1 0 140px', minWidth: 140, background: th.surface, borderRadius: 14, padding: '11px 13px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: th.fontUI, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textFaint }}>
            <Icon name={c.icon} size={13} color={th.textFaint} />{c.label}
          </div>
          <div style={{ fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600, color: th.text, marginTop: 5, lineHeight: 1.35 }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}
