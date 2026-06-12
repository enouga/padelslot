import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { api } from '@/lib/api';
import { clubSlugFromHost } from '@/lib/host';
import { buildManifest } from '@/lib/manifest';

// Manifest PWA par hôte : identité du club sur son sous-domaine, Palova ailleurs.
// L'usage de headers() rend cette route dynamique (résolue à chaque requête).
// Le proxy ne passe pas ici (motif `.*\..*` exclu du matcher), d'où la résolution par Host.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get('host') || '';
  const slug = clubSlugFromHost(host, process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost');
  if (slug) {
    try {
      const club = await api.getClub(slug);
      return buildManifest({ slug, name: club.name, accentColor: club.accentColor, logoUrl: club.logoUrl }) as MetadataRoute.Manifest;
    } catch { /* club introuvable/suspendu → manifest Palova */ }
  }
  return buildManifest(null) as MetadataRoute.Manifest;
}
