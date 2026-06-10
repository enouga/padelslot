'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Chip } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';
import { CalendarEntry } from '@/lib/calendar';
import { MyReservation } from '@/lib/api';

function fmtHour(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso)).replace(':', 'h');
}
function fmtDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}
/** Titre du panneau à partir de la clé jour (déjà exprimée dans le bon fuseau). */
function dayTitle(dayKey: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${dayKey}T00:00:00Z`));
}

const STATUS_LABEL: Record<string, string> = { PENDING: 'En attente', CONFIRMED: 'Confirmée', CANCELLED: 'Annulée' };
const REG_LABEL: Record<string, string> = { CONFIRMED: 'Inscrit', WAITLISTED: "Liste d'attente" };
const GENDER_LABEL: Record<string, string> = { MEN: 'Messieurs', WOMEN: 'Dames', MIXED: 'Mixte' };

export function DayPanel({
  dayKey, entries, canMove, onMove, onCancel, onReserve, reserveLabel,
}: {
  dayKey: string;
  entries: CalendarEntry[];
  canMove: (r: MyReservation) => boolean;
  onMove: (r: MyReservation) => void;
  onCancel: (r: MyReservation) => void;
  onReserve: () => void;
  reserveLabel: string;
}) {
  const { th } = useTheme();

  const card = (children: React.ReactNode, key: string, stripe: string, past: boolean) => (
    <div key={key} style={{
      background: th.surface, borderRadius: 16, padding: '13px 14px', boxShadow: `inset 0 0 0 1px ${th.line}`,
      display: 'flex', gap: 12, opacity: past ? 0.6 : 1,
    }}>
      <div style={{ width: 4, borderRadius: 2, background: stripe, flexShrink: 0, alignSelf: 'stretch' }} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontFamily: th.fontUI, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: th.textMute }}>
        {dayTitle(dayKey)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {entries.length === 0 ? (
          <div style={{ padding: '18px 0', textAlign: 'center', fontFamily: th.fontUI, fontSize: 14, color: th.textMute }}>
            Rien ce jour-là.
            <div style={{ marginTop: 10 }}>
              <button onClick={onReserve}
                style={{ border: 'none', cursor: 'pointer', borderRadius: 12, padding: '10px 16px', background: th.accent, color: th.onAccent, fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 700 }}>
                {reserveLabel}
              </button>
            </div>
          </div>
        ) : (
          entries.map((e) => {
            if (e.kind === 'reservation') {
              const r = e.r;
              const tz = r.resource.club.timezone;
              return card(
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 15.5, color: th.text }}>{r.resource.name}</span>
                    <Chip tone={r.status === 'CONFIRMED' ? 'accent' : 'line'}>{STATUS_LABEL[r.status]}</Chip>
                  </div>
                  <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute, marginTop: 2 }}>{r.resource.club.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icon name="clock" size={14} color={th.textMute} />{fmtHour(r.startTime, tz)}–{fmtHour(r.endTime, tz)}
                    </span>
                    <span style={{ fontFamily: th.fontMono }}>{Number(r.totalPrice)}€</span>
                    {!e.past && (
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        {canMove(r) && (
                          <button onClick={() => onMove(r)}
                            style={{ border: `1px solid ${th.lineStrong}`, background: 'transparent', cursor: 'pointer', borderRadius: 9, padding: '5px 11px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.text }}>
                            Déplacer
                          </button>
                        )}
                        <button onClick={() => onCancel(r)}
                          style={{ border: `1px solid ${th.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 9, padding: '5px 11px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: '#ff7a4d' }}>
                          Annuler
                        </button>
                      </span>
                    )}
                  </div>
                </>,
                `res-${r.id}`, ACCENTS.blue, e.past,
              );
            }

            const t = e.reg.tournament;
            const tz = t.club.timezone;
            const team = `${e.reg.captain.firstName} ${e.reg.captain.lastName} & ${e.reg.partner.firstName} ${e.reg.partner.lastName}`;
            return card(
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 15.5, color: th.text }}>{t.name}</span>
                  <Chip color={th.accentWarm}>{REG_LABEL[e.reg.status] ?? e.reg.status}</Chip>
                </div>
                <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute, marginTop: 2 }}>
                  {t.category} · {GENDER_LABEL[t.gender] ?? t.gender} · {t.club.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="calendar" size={14} color={th.textMute} />
                    {fmtDate(t.startTime, tz)}{t.endTime && ` – ${fmtDate(t.endTime, tz)}`} · {fmtHour(t.startTime, tz)}
                  </span>
                  <Link href={`/tournois/${t.id}`}
                    style={{ marginLeft: 'auto', textDecoration: 'none', borderRadius: 9, padding: '6px 12px', background: th.ink, color: th.mode === 'floodlit' ? th.text : '#f7f5ee', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    Gérer
                  </Link>
                </div>
                <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute, marginTop: 6 }}>
                  Équipe : {team}
                </div>
              </>,
              `reg-${e.reg.id}`, th.accentWarm, e.past,
            );
          })
        )}
      </div>
    </div>
  );
}
