'use client';
import { useTheme } from '@/lib/ThemeProvider';
import { inkOn } from '@/lib/theme';
import { assetUrl } from '@/lib/api';

// Avatar rond : photo uploadée si disponible, sinon initiales sur fond.
// `color` (optionnel) teinte le fond des initiales par joueur/équipe (cf. lib/playerColors) ;
// sans lui, fond = accent du club (identité du ProfileMenu). Une photo n'est jamais teintée.
export function Avatar({ firstName, lastName, avatarUrl, size = 34, color }: {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  size?: number;
  color?: string;
}) {
  const { th } = useTheme();
  const src = assetUrl(avatarUrl);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={`${firstName} ${lastName}`} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  const bg = color ?? th.accent;
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, background: bg, color: color ? inkOn(color) : th.onAccent,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI, fontWeight: 700, fontSize: size * 0.36,
    }}>
      {`${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()}
    </span>
  );
}
