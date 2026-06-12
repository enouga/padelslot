'use client';
import { useEffect, useRef, useState } from 'react';
import { Sponsor } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Icon } from '@/components/ui/Icon';
import { offerIsActive } from '@/lib/clubhouse';
import { deadlineCountdown } from '@/lib/tournament';
import { HERO_GRADIENT } from '@/components/agenda/AgendaHero';

// Offres partenaires : carte « à la une » (pinned) sur dégradé signature,
// grille de cartes pour les offres actives, logos seuls pour le reste.
// Une offre expirée (offerUntil dépassé) redescend en logo seul.
// `now` null avant le mount (hydration-safe) : pas de countdown, expiration ignorée.
export function PartnerOffers({ sponsors, now = null }: { sponsors: Sponsor[]; now?: Date | null }) {
  const { th } = useTheme();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (sponsors.length === 0) return null;

  const ref = now ?? new Date(0); // pas d'horloge → expiration ignorée (corrigé au tick suivant)
  const actives = sponsors.filter((s) => offerIsActive(s, ref));
  const featured = actives.find((s) => s.pinned) ?? null;
  const gridSponsors = actives.filter((s) => s !== featured);
  const logoOnly = sponsors.filter((s) => !actives.includes(s));

  const copy = async (s: Sponsor) => {
    try {
      await navigator.clipboard.writeText(s.offerCode!);
      setCopiedId(s.id);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedId(null), 2000);
    } catch { /* repli silencieux : le code reste lisible dans le bouton */ }
  };

  // « Expire J-5 » / « Plus que 6 h » (déjà explicite seul).
  const expiry = (s: Sponsor) => {
    if (!now || !s.offerUntil) return null;
    const c = deadlineCountdown(s.offerUntil, now);
    return c ? { ...c, text: c.text.startsWith('J-') ? `Expire ${c.text}` : c.text } : null;
  };

  const logoTile = (s: Sponsor, size: number) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={s.logoUrl} alt={s.name} style={{ height: size, width: size + 18, objectFit: 'contain', borderRadius: 12, background: '#fff', padding: 6, flexShrink: 0, boxSizing: 'border-box' }} />
  );

  const codeButton = (s: Sponsor, onGradient = false) => s.offerCode && (
    <button onClick={() => copy(s)} title="Copier le code"
      style={{
        cursor: 'pointer', alignSelf: 'flex-start',
        border: `1px dashed ${onGradient ? 'rgba(255,255,255,0.55)' : th.lineStrong}`,
        background: onGradient ? 'rgba(255,255,255,0.14)' : th.surface2,
        color: onGradient ? '#fff' : th.text,
        borderRadius: 9, padding: '7px 12px', fontFamily: th.fontMono, fontSize: 13, fontWeight: 600, letterSpacing: 0.8,
      }}>
      {copiedId === s.id ? 'Copié !' : s.offerCode}
    </button>
  );

  // Zone principale cliquable : ancre si le partenaire a un site, sinon simple bloc.
  // Le bouton code reste un sibling (un <button> dans un <a> copierait ET naviguerait).
  const clickable = (s: Sponsor, children: React.ReactNode, style: React.CSSProperties) =>
    s.linkUrl
      ? <a href={s.linkUrl} target="_blank" rel="noreferrer" aria-label={`Voir le site de ${s.name}`} style={{ textDecoration: 'none', color: 'inherit', ...style }}>{children}</a>
      : <div style={style}>{children}</div>;

  const expiryChip = (s: Sponsor, onGradient = false) => {
    const e = expiry(s);
    if (!e) return null;
    return (
      <span style={{
        fontFamily: th.fontUI, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', borderRadius: 999, padding: '3px 9px',
        background: e.urgent ? ACCENTS.coral : onGradient ? 'rgba(255,255,255,0.18)' : th.surface2,
        color: e.urgent || onGradient ? '#fff' : th.textMute,
      }}>
        {e.text}
      </span>
    );
  };

  return (
    <div style={{ padding: '26px 20px 0' }}>
      <style>{`.po-grid{display:grid;grid-template-columns:1fr;gap:10px}@media(min-width:600px){.po-grid{grid-template-columns:1fr 1fr}}`}</style>
      <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, marginBottom: 12 }}>Offres partenaires</div>

      {/* Partenaire à la une */}
      {featured && (
        <div data-testid="featured-partner" style={{ background: HERO_GRADIENT, borderRadius: 18, padding: '20px 20px', color: '#fff', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {clickable(featured, (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: th.fontUI, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.8 }}>Partenaire à la une</span>
                <span style={{ flex: 1 }} />
                {expiryChip(featured, true)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
                {logoTile(featured, 52)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 700, opacity: 0.85 }}>{featured.name}</div>
                  <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 21, letterSpacing: -0.3, lineHeight: 1.25, marginTop: 3 }}>{featured.offerText}</div>
                </div>
                {featured.linkUrl && <Icon name="chevR" size={18} color="rgba(255,255,255,0.8)" />}
              </div>
            </>
          ), { display: 'block' })}
          {codeButton(featured, true)}
        </div>
      )}

      {/* Offres actives en grille */}
      {gridSponsors.length > 0 && (
        <div className="po-grid">
          {gridSponsors.map((s) => (
            <div key={s.id} data-testid={`partner-${s.id}`} style={{ background: th.surface, borderRadius: 16, padding: '13px 15px', boxShadow: `inset 0 0 0 1px ${th.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {clickable(s, (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {logoTile(s, 44)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: th.fontUI, fontSize: 14, fontWeight: 700, color: th.text }}>{s.name}</span>
                      <span style={{ flex: 1 }} />
                      {expiryChip(s)}
                    </div>
                    <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 2, lineHeight: 1.4 }}>{s.offerText}</div>
                  </div>
                  {s.linkUrl && <Icon name="chevR" size={16} color={th.textFaint} />}
                </div>
              ), { display: 'block' })}
              {codeButton(s)}
            </div>
          ))}
        </div>
      )}

      {/* Partenaires sans offre (ou offre expirée) : logos seuls */}
      {logoOnly.length > 0 && (
        <div style={{ marginTop: (featured || gridSponsors.length > 0) ? 16 : 0 }}>
          {(featured || gridSponsors.length > 0) && (
            <div style={{ fontFamily: th.fontUI, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: th.textFaint, marginBottom: 8 }}>Ils soutiennent le club</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {logoOnly.map((s) => (
              <span key={s.id} style={{ display: 'inline-flex' }}>
                {s.linkUrl
                  ? <a href={s.linkUrl} target="_blank" rel="noreferrer" title={s.name}>{logoTile(s, 38)}</a>
                  : logoTile(s, 38)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
