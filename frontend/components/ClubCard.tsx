'use client';
import { ClubSummary } from '@/lib/api';
import { clubUrl } from '@/lib/clubUrl';
import { useTheme } from '@/lib/ThemeProvider';
import { Chip, Placeholder } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';

// Carte de club (annuaire public + « mes clubs » de l'accueil). Lien vers le sous-domaine du club.
export function ClubCard({ club }: { club: ClubSummary }) {
  const { th } = useTheme();
  return (
    <a href={clubUrl(club.slug)} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{ background: th.surface, borderRadius: 22, overflow: 'hidden', boxShadow: `${th.shadowSoft}, inset 0 0 0 1px ${th.line}` }}>
        <div style={{ position: 'relative' }}>
          <Placeholder label={club.name} height={104} radius={0} />
          {/* pastille couleur du club */}
          <span style={{ position: 'absolute', top: 12, right: 12, width: 14, height: 14, borderRadius: '50%', background: club.accentColor, boxShadow: `0 0 0 2px ${th.surface}` }} />
        </div>
        <div style={{ padding: '15px 16px 17px' }}>
          <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 24, color: th.text, lineHeight: 1.05, letterSpacing: -0.3 }}>{club.name}</div>
          {club.city && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginTop: 5 }}>
              <Icon name="pin" size={13} color={th.textMute} />{club.city}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {club.sports.map((s) => <Chip key={s.key} tone="line">{s.icon ? `${s.icon} ` : ''}{s.name}</Chip>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${th.line}`, fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>
            {club.resourceCount} terrain{club.resourceCount > 1 ? 's' : ''}
            <Icon name="chevR" size={16} color={th.textFaint} style={{ marginLeft: 'auto' }} />
          </div>
        </div>
      </div>
    </a>
  );
}
