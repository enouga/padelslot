'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Announcement } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { Btn } from '@/components/ui/atoms';
import { HERO_GRADIENT } from '@/components/agenda/AgendaHero';

// Bandeau « À la une » : l'annonce épinglée mise en scène.
// Fond = imageUrl (voile sombre pour la lisibilité) sinon le dégradé signature.
// Corps limité à 3 lignes ; tout le bandeau ouvre la feuille « annonce complète ».
// CTA toujours présent : lien externe si renseigné, sinon « Réserver un terrain ».
export function HeroAnnouncement({ announcement }: { announcement: Announcement }) {
  const { th } = useTheme();
  const [open, setOpen] = useState(false);
  // Neutralise quotes/parenthèses : une URL hostile ne peut pas sortir du url('…') CSS.
  const safeImageUrl = announcement.imageUrl?.replace(/['"\\()]/g, '') ?? null;

  const heroStyle: React.CSSProperties = safeImageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(18, 22, 30, 0.55), rgba(18, 22, 30, 0.55)), url('${safeImageUrl}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : { background: HERO_GRADIENT };

  const ctaStyle: React.CSSProperties = {
    display: 'inline-block', marginTop: 14, background: '#fff', color: '#1d2733',
    borderRadius: 10, padding: '9px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 700, textDecoration: 'none',
  };

  return (
    <div style={{ padding: '16px 20px 0' }}>
      <div
        data-testid="hero-announcement"
        role="button" tabIndex={0}
        aria-label={`Lire l'annonce : ${announcement.title}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
        style={{ ...heroStyle, borderRadius: 18, padding: '26px 22px', color: '#fff', cursor: 'pointer' }}
      >
        <div style={{ fontFamily: th.fontUI, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.8 }}>À la une</div>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, letterSpacing: -0.4, marginTop: 6 }}>{announcement.title}</div>
        <p style={{ fontFamily: th.fontUI, fontSize: 14.5, opacity: 0.92, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 480, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{announcement.body}</p>
        {announcement.linkUrl ? (
          <a href={announcement.linkUrl} target="_blank" rel="noreferrer"
            aria-label={`En savoir plus sur : ${announcement.title}`}
            onClick={(e) => e.stopPropagation()} style={ctaStyle}>
            En savoir plus →
          </a>
        ) : (
          <Link href="/reserver" onClick={(e) => e.stopPropagation()} style={ctaStyle}>
            Réserver un terrain →
          </Link>
        )}
      </div>

      {open && <AnnouncementSheet announcement={announcement} onClose={() => setOpen(false)} />}
    </div>
  );
}

// Feuille « annonce complète » — top-sheet calquée sur ConfirmDialog (sans confirm/danger).
function AnnouncementSheet({ announcement, onClose }: { announcement: Announcement; onClose: () => void }) {
  const { th } = useTheme();
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', animation: 'sp-fade .25s ease' }} />
      <div role="dialog" aria-modal="true" aria-label={announcement.title} style={{ position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto', background: th.bgElev, borderRadius: '0 0 28px 28px', padding: '12px 20px 36px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', animation: 'sp-sheet-in-top .34s cubic-bezier(.2,.8,.2,1)' }}>
        <div style={{ fontFamily: th.fontUI, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: th.textFaint }}>À la une</div>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, color: th.text, letterSpacing: -0.3, marginTop: 6 }}>{announcement.title}</div>
        <p style={{ fontFamily: th.fontUI, fontSize: 14.5, color: th.textMute, lineHeight: 1.55, margin: '12px 0 0', whiteSpace: 'pre-wrap', maxHeight: '60vh', overflowY: 'auto' }}>{announcement.body}</p>
        <div style={{ display: 'flex', gap: 11, marginTop: 24, alignItems: 'center' }}>
          <Btn variant="surface" onClick={onClose} style={{ flex: announcement.linkUrl ? '0 0 42%' : 1 }}>Fermer</Btn>
          {announcement.linkUrl && (
            <a href={announcement.linkUrl} target="_blank" rel="noreferrer"
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 54, background: th.accent, color: th.onAccent, borderRadius: 14, fontFamily: th.fontUI, fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>
              En savoir plus →
            </a>
          )}
        </div>
        <div style={{ width: 38, height: 5, borderRadius: 3, background: th.lineStrong, margin: '18px auto 0' }} />
      </div>
    </div>
  );
}
