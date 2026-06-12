'use client';
import { useTheme } from '@/lib/ThemeProvider';
import { Icon } from '@/components/ui/Icon';
import { TimelineStep, formatDateShort } from '@/lib/tournament';

// Stepper horizontal du tournoi : Inscriptions ouvertes → Clôture → Début.
// La page ne le rend qu'une fois `now` connu (après mount) : l'état courant
// dépend de l'heure et provoquerait un mismatch d'hydratation sinon.
export function TournamentTimeline({ steps, tz }: { steps: TimelineStep[]; tz: string }) {
  const { th } = useTheme();
  return (
    <div style={{ padding: '18px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {steps.map((s, i) => (
          <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i > 0 && (
              <div aria-hidden="true" style={{
                position: 'absolute', top: 11, right: '50%', width: '100%', height: 2, marginRight: 11,
                background: s.state === 'upcoming' ? th.line : th.accent, opacity: s.state === 'upcoming' ? 1 : 0.5,
              }} />
            )}
            <div style={{
              width: 22, height: 22, borderRadius: '50%', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s.state === 'done' ? th.accent : th.surface,
              boxShadow: s.state === 'current' ? `inset 0 0 0 2px ${th.accent}` : `inset 0 0 0 1.5px ${s.state === 'done' ? th.accent : th.line}`,
            }}>
              {s.state === 'done' && <Icon name="check" size={12} color={th.onAccent} stroke={2.4} />}
              {s.state === 'current' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: th.accent }} />}
            </div>
            <div style={{
              marginTop: 7, textAlign: 'center', fontFamily: th.fontUI, fontSize: 11.5, lineHeight: 1.3, maxWidth: 110,
              fontWeight: s.state === 'current' ? 700 : 600, color: s.state === 'upcoming' ? th.textFaint : th.text,
            }}>
              {s.label}
              {s.dateIso && <div style={{ fontWeight: 400, color: th.textMute, marginTop: 2 }}>{formatDateShort(s.dateIso, tz)}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
