'use client';
import { useEffect, useRef, useState } from 'react';
import { Sponsor } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';

// Offres partenaires : logo + texte d'offre + code promo copiable.
// Sponsor sans offre → logo seul (comportement historique).
export function PartnerOffers({ sponsors }: { sponsors: Sponsor[] }) {
  const { th } = useTheme();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (sponsors.length === 0) return null;

  const copy = async (s: Sponsor) => {
    try {
      await navigator.clipboard.writeText(s.offerCode!);
      setCopiedId(s.id);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedId(null), 2000);
    } catch { /* repli silencieux : le code reste lisible dans le bouton */ }
  };

  const logo = (s: Sponsor) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={s.logoUrl} alt={s.name} style={{ height: 38, width: 'auto', maxWidth: 110, borderRadius: 8, background: th.surface2, padding: 5, objectFit: 'contain', flexShrink: 0 }} />
  );

  return (
    <div style={{ padding: '26px 20px 0' }}>
      <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, marginBottom: 12 }}>Offres partenaires</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sponsors.map((s) => (
          // offerCode sans offerText : intentionnellement ignoré (un code orphelin sans contexte n'aide pas)
          s.offerText ? (
            <div key={s.id} style={{ background: th.surface, borderRadius: 14, padding: '11px 14px', boxShadow: `inset 0 0 0 1px ${th.line}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {s.linkUrl ? <a href={s.linkUrl} target="_blank" rel="noreferrer">{logo(s)}</a> : logo(s)}
              <span style={{ flex: 1, minWidth: 140, fontFamily: th.fontUI, fontSize: 14, color: th.text }}>{s.offerText}</span>
              {s.offerCode && (
                <button onClick={() => copy(s)} title="Copier le code"
                  style={{ cursor: 'pointer', border: `1px dashed ${th.lineStrong}`, background: th.surface2, color: th.text, borderRadius: 9, padding: '7px 12px', fontFamily: th.fontMono, fontSize: 13, fontWeight: 600, letterSpacing: 0.8 }}>
                  {copiedId === s.id ? 'Copié !' : s.offerCode}
                </button>
              )}
            </div>
          ) : (
            <div key={s.id} style={{ display: 'inline-flex' }}>
              {s.linkUrl ? <a href={s.linkUrl} target="_blank" rel="noreferrer" title={s.name}>{logo(s)}</a> : logo(s)}
            </div>
          )
        ))}
      </div>
    </div>
  );
}
