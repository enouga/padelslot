'use client';

import Link from 'next/link';
import { Court } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { Screen } from '@/components/ui/Screen';
import { Logotype, Chip, LiveDot, Placeholder, ThemeToggle } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';

function CourtCard({ court }: { court: Court }) {
  const { th } = useTheme();
  const indoor = court.surface === 'indoor';
  return (
    <Link href={`/courts/${court.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        background: th.surface, borderRadius: 22, overflow: 'hidden',
        boxShadow: `${th.shadowSoft}, inset 0 0 0 1px ${th.line}`,
      }}>
        <div style={{ position: 'relative' }}>
          <Placeholder label={`photo · ${court.name}`} height={116} radius={0} />
          <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
            <Chip tone="accent" icon={indoor ? 'indoor' : 'sun'}>{indoor ? 'Indoor' : 'Plein air'}</Chip>
          </div>
        </div>
        <div style={{ padding: '15px 16px 17px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 25, color: th.text, lineHeight: 1, letterSpacing: -0.3 }}>{court.name}</div>
              <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginTop: 5 }}>
                Ouvert {court.openHour}h – {court.closeHour}h
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, color: th.text, lineHeight: 1 }}>
                {Number(court.pricePerHour)}€
                <span style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textMute, fontWeight: 500 }}> /h</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${th.line}` }}>
            <LiveDot />
            <span style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.text, fontWeight: 600 }}>Disponibilités en direct</span>
            <Icon name="chevR" size={17} color={th.textFaint} style={{ marginLeft: 'auto' }} />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function CourtsView({ courts, clubName }: { courts: Court[]; clubName: string }) {
  const { th } = useTheme();
  return (
    <Screen>
      <div style={{ paddingBottom: 40 }}>
        {/* header */}
        <div style={{ padding: '28px 20px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logotype size={22} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: th.surface2, padding: '6px 11px', borderRadius: 20 }}>
                <LiveDot size={7} />
                <span style={{ fontFamily: th.fontMono, fontSize: 12, color: th.text }}>en direct</span>
              </div>
              <ThemeToggle />
            </div>
          </div>
          <div style={{ marginTop: 24 }}>
            <div style={{ fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="pin" size={14} color={th.textMute} />{clubName}
            </div>
            <div style={{ fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 40, lineHeight: 1.05, color: th.text, marginTop: 8, letterSpacing: -0.5 }}>
              Choisissez<br />votre terrain.
            </div>
          </div>
        </div>

        {/* list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 20px 0' }}>
          {courts.map((c) => <CourtCard key={c.id} court={c} />)}
        </div>
      </div>
    </Screen>
  );
}
