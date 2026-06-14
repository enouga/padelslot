import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../db/prisma';
import { ICONS_DIR, UPLOADS_DIR } from '../utils/uploads';

// Icônes PWA d'un club : logo recadré « contain » en carré sur fond accentColor
// (jamais tronqué), cache disque uploads/icons (hash de l'URL du logo = invalidation
// naturelle au changement de logo), repli silencieux sur les PNG Palova embarqués.

interface IconVariant { size: number; markRatio: number } // markRatio < 1 : zone de sécurité (maskable)
export const ICON_VARIANTS: Record<string, IconVariant> = {
  '192': { size: 192, markRatio: 0.86 },
  '512': { size: 512, markRatio: 0.86 },
  'maskable-192': { size: 192, markRatio: 0.62 },
  'maskable-512': { size: 512, markRatio: 0.62 },
  'apple-180': { size: 180, markRatio: 0.74 },
};

const FALLBACK_DIR = path.join(process.cwd(), 'assets', 'pwa');
export function fallbackIconPath(variant: string): string {
  return path.join(FALLBACK_DIR, `icon-${variant}.png`);
}

export function iconCacheFile(clubId: string, variant: string, logoUrl: string): string {
  const hash = crypto.createHash('md5').update(logoUrl).digest('hex').slice(0, 12);
  return path.join(ICONS_DIR, `${clubId}-${variant}-${hash}.png`);
}

const FETCH_TIMEOUT_MS = 5000;
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // garde poids/SSRF : 5 Mo max

async function fetchLogo(url: string): Promise<Buffer> {
  // Logo uploadé localement (/uploads/...) : lecture disque directe — `fetch` exigerait
  // une URL absolue que le backend ne connaît pas. Garde anti-traversée de répertoire.
  if (url.startsWith('/uploads/')) {
    const filePath = path.resolve(UPLOADS_DIR, url.replace(/^\/uploads\//, ''));
    if (!filePath.startsWith(path.resolve(UPLOADS_DIR))) throw new Error('LOGO_PATH_INVALID');
    const buf = await fs.promises.readFile(filePath);
    if (buf.byteLength > MAX_LOGO_BYTES) throw new Error('LOGO_TOO_LARGE');
    return buf;
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
  if (!res.ok) throw new Error(`LOGO_HTTP_${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_LOGO_BYTES) throw new Error('LOGO_TOO_LARGE');
  return buf;
}

async function renderIcon(logo: Buffer, accentColor: string, v: IconVariant): Promise<Buffer> {
  const inner = Math.round(v.size * v.markRatio);
  const resized = await sharp(logo)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  return sharp({ create: { width: v.size, height: v.size, channels: 4, background: accentColor } })
    .composite([{ input: resized, gravity: 'centre' }])
    .png().toBuffer();
}

export class IconService {
  /** Chemin absolu du PNG à servir pour ce club+variant, ou null (404). */
  async getClubIconPath(slug: string, variant: string): Promise<string | null> {
    if (!ICON_VARIANTS[variant]) return null;
    const club = await prisma.club.findUnique({ where: { slug }, select: { id: true, logoUrl: true, accentColor: true } });
    if (!club) return null;
    if (!club.logoUrl) return fallbackIconPath(variant);
    const cached = iconCacheFile(club.id, variant, club.logoUrl);
    if (fs.existsSync(cached)) return cached;
    try {
      const logo = await fetchLogo(club.logoUrl);
      const png = await renderIcon(logo, club.accentColor, ICON_VARIANTS[variant]);
      fs.writeFileSync(cached, png);
      return cached;
    } catch {
      return fallbackIconPath(variant); // logo injoignable/illisible → icône Palova
    }
  }
}

export const iconService = new IconService();
