// Génère les PNG PWA Palova depuis les SVG de marque du frontend :
// - frontend/public : icônes du manifest plateforme (any + maskable) + apple-touch-icon
// - backend/assets/pwa : icônes de repli de l'endpoint GET /api/clubs/:slug/icon/*
// Usage : npx ts-node scripts/generate-pwa-icons.ts  (depuis backend/)
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const FRONT_PUBLIC = path.join(__dirname, '..', '..', 'frontend', 'public');
const BACK_ASSETS = path.join(__dirname, '..', 'assets', 'pwa');
const BRAND_BG = '#5e93da'; // fond de palova-icon-blue.svg

// Icône « any » : le SVG complet (carré arrondi bleu + balle blanche), coins transparents.
function renderRounded(size: number): Promise<Buffer> {
  const svg = fs.readFileSync(path.join(FRONT_PUBLIC, 'palova-icon-blue.svg'));
  return sharp(svg, { density: 300 }).resize(size, size).png().toBuffer();
}

// Plein cadre (maskable Android / apple-touch iOS, qui appliquent leur propre masque) :
// fond plein + pictogramme blanc centré, réduit pour rester dans la zone de sécurité.
async function renderFullBleed(size: number, markRatio: number): Promise<Buffer> {
  const markSvg = fs.readFileSync(path.join(FRONT_PUBLIC, 'palova-mark-white.svg'));
  const markSize = Math.round(size * markRatio);
  const mark = await sharp(markSvg, { density: 300 }).resize(markSize, markSize).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BRAND_BG } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png().toBuffer();
}

async function main() {
  fs.mkdirSync(BACK_ASSETS, { recursive: true });
  const out: Array<[string, Buffer]> = [
    [path.join(FRONT_PUBLIC, 'icon-192.png'), await renderRounded(192)],
    [path.join(FRONT_PUBLIC, 'icon-512.png'), await renderRounded(512)],
    [path.join(FRONT_PUBLIC, 'icon-maskable-192.png'), await renderFullBleed(192, 0.62)],
    [path.join(FRONT_PUBLIC, 'icon-maskable-512.png'), await renderFullBleed(512, 0.62)],
    [path.join(FRONT_PUBLIC, 'apple-touch-icon.png'), await renderFullBleed(180, 0.7)],
    [path.join(BACK_ASSETS, 'icon-192.png'), await renderRounded(192)],
    [path.join(BACK_ASSETS, 'icon-512.png'), await renderRounded(512)],
    [path.join(BACK_ASSETS, 'icon-maskable-192.png'), await renderFullBleed(192, 0.62)],
    [path.join(BACK_ASSETS, 'icon-maskable-512.png'), await renderFullBleed(512, 0.62)],
    [path.join(BACK_ASSETS, 'icon-apple-180.png'), await renderFullBleed(180, 0.7)],
  ];
  for (const [file, buf] of out) {
    fs.writeFileSync(file, buf);
    const meta = await sharp(buf).metadata();
    const expected = parseInt(file.match(/(\d+)\.png$/)?.[1] ?? (file.includes('apple-touch') ? '180' : '0'), 10);
    if (meta.width !== expected || meta.height !== expected) throw new Error(`Taille inattendue pour ${file}: ${meta.width}x${meta.height}`);
    console.log(`OK ${path.basename(path.dirname(file))}/${path.basename(file)} — ${meta.width}x${meta.height}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
