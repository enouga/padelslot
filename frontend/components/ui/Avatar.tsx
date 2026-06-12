'use client';
import { useTheme } from '@/lib/ThemeProvider';
import { assetUrl } from '@/lib/api';

// Avatar rond : photo uploadée si disponible, sinon initiales sur fond accent.
// (Même rendu que l'identité du ProfileMenu — TODO : le faire migrer ici.)
export function Avatar({ firstName, lastName, avatarUrl, size = 34 }: {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  size?: number;
}) {
  const { th } = useTheme();
  const src = assetUrl(avatarUrl);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={`${firstName} ${lastName}`} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, background: th.accent, color: th.onAccent,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI, fontWeight: 700, fontSize: size * 0.36,
    }}>
      {`${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()}
    </span>
  );
}
