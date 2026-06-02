import { NextRequest, NextResponse } from 'next/server';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';

/** Renvoie le slug du club si le host est un sous-domaine club, sinon null (plateforme). */
function clubSlugFromHost(host: string): string | null {
  const h = host.split(':')[0];
  if (h === ROOT || h === `www.${ROOT}` || h === `app.${ROOT}`) return null;
  if (h.endsWith(`.${ROOT}`)) {
    const label = h.slice(0, -(ROOT.length + 1)).split('.')[0];
    if (!label || label === 'www' || label === 'app') return null;
    return label;
  }
  return null; // host inconnu → traité comme plateforme
}

function portSuffix(host: string): string {
  const i = host.indexOf(':');
  return i >= 0 ? host.slice(i) : '';
}

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const url = request.nextUrl;
  const slug = clubSlugFromHost(host);

  if (!slug) {
    // HOST PLATEFORME — rétro-compat /c/<slug> → racine du sous-domaine club
    const m = url.pathname.match(/^\/c\/([^/]+)\/?$/);
    if (m) return NextResponse.redirect(`${url.protocol}//${m[1]}.${ROOT}${portSuffix(host)}/`);
    return NextResponse.next();
  }

  // HOST CLUB
  // L'annuaire et la création de club n'existent que sur la plateforme.
  if (url.pathname === '/clubs' || url.pathname.startsWith('/clubs/')) {
    return NextResponse.redirect(`${url.protocol}//${ROOT}${portSuffix(host)}${url.pathname}`);
  }
  // Injecte le slug pour le layout serveur.
  const headers = new Headers(request.headers);
  headers.set('x-club-slug', slug);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\..*).*)'],
};
