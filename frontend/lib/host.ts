// Résolution du slug club depuis l'hôte HTTP (multi-hôte : plateforme vs sous-domaine club).
// Fonction pure partagée par proxy.ts (middleware) et app/manifest.ts (manifest PWA).
export function clubSlugFromHost(host: string, root: string): string | null {
  const h = host.split(':')[0];
  if (h === root || h === `www.${root}` || h === `app.${root}`) return null;
  if (h.endsWith(`.${root}`)) {
    const label = h.slice(0, -(root.length + 1)).split('.')[0];
    if (!label || label === 'www' || label === 'app') return null;
    return label;
  }
  return null; // hôte inconnu → traité comme plateforme
}
