'use client';
import { Announcement } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';

// Bandeau « À la une » : l'annonce épinglée mise en scène.
// Fond = imageUrl (voile sombre pour la lisibilité) sinon dégradé du thème.
export function HeroAnnouncement({ announcement }: { announcement: Announcement }) {
  const { th } = useTheme();
  // Neutralise quotes/parenthèses : une URL hostile ne peut pas sortir du url('…') CSS.
  const safeImageUrl = announcement.imageUrl?.replace(/['"\\()]/g, '') ?? null;

  const heroStyle: React.CSSProperties = safeImageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(18, 22, 30, 0.55), rgba(18, 22, 30, 0.55)), url('${safeImageUrl}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        borderRadius: 18,
        padding: '26px 22px',
        color: '#fff',
      }
    : {
        background: `linear-gradient(115deg, ${th.accent}, ${th.accentWarm})`,
        borderRadius: 18,
        padding: '26px 22px',
        color: '#fff',
      };

  return (
    <div style={{ padding: '16px 20px 0' }}>
      <div data-testid="hero-announcement" style={heroStyle}>
        <div style={{ fontFamily: th.fontUI, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.8 }}>À la une</div>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, letterSpacing: -0.4, marginTop: 6 }}>{announcement.title}</div>
        <p style={{ fontFamily: th.fontUI, fontSize: 14.5, opacity: 0.92, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 480, whiteSpace: 'pre-wrap' }}>{announcement.body}</p>
        {announcement.linkUrl && (
          <a href={announcement.linkUrl} target="_blank" rel="noreferrer"
            aria-label={`En savoir plus sur : ${announcement.title}`}
            style={{ display: 'inline-block', marginTop: 14, background: '#fff', color: '#1d2733', borderRadius: 10, padding: '9px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>
            En savoir plus →
          </a>
        )}
      </div>
    </div>
  );
}
