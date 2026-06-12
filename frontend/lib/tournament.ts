import { Tournament } from '@/lib/api';

// Helpers purs des fiches tournoi & event. Tous prennent `now` en paramètre :
// testabilité + hydration-safety (la page n'appelle jamais new Date() au rendu).

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Date + heure dans le fuseau du club, ex. « jeudi 9 juillet à 14h01 ». */
export function formatDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso)).replace(':', 'h');
}

/** Date courte dans le fuseau du club, ex. « jeu. 9 juil. ». */
export function formatDateShort(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}

/**
 * Compte à rebours avant la clôture des inscriptions. null si la deadline est passée.
 * ≥ 48 h → « J-x » ; < 48 h → « Plus que x h » (urgent) ; < 1 h → « Plus que x min » (urgent).
 */
export function deadlineCountdown(deadlineIso: string, now: Date): { text: string; urgent: boolean } | null {
  const diff = new Date(deadlineIso).getTime() - now.getTime();
  if (diff <= 0) return null;
  if (diff < HOUR) return { text: `Plus que ${Math.max(1, Math.ceil(diff / MIN))} min`, urgent: true };
  if (diff < 48 * HOUR) return { text: `Plus que ${Math.ceil(diff / HOUR)} h`, urgent: true };
  return { text: `J-${Math.floor(diff / DAY)}`, urgent: false };
}

/** Taux de remplissage 0..1 (clampé). null si le tournoi n'a pas de capacité. */
export function fillRatio(t: Pick<Tournament, 'confirmedCount' | 'maxTeams'>): number | null {
  if (t.maxTeams == null || t.maxTeams <= 0) return null;
  return Math.min(1, Math.max(0, t.confirmedCount / t.maxTeams));
}

/**
 * Position 1-based d'une inscription dans la liste d'attente (l'ordre du tableau
 * suit l'orderBy backend status asc, createdAt asc). null si pas en attente.
 * Marche pour les binômes de tournoi comme pour les inscrits individuels d'un event.
 */
export function waitlistPosition(participants: { id: string; status: string }[], registrationId: string): number | null {
  const idx = participants.filter((p) => p.status === 'WAITLISTED').findIndex((p) => p.id === registrationId);
  return idx >= 0 ? idx + 1 : null;
}

export interface TimelineStep {
  key: 'open' | 'deadline' | 'start';
  label: string;
  dateIso: string | null;
  state: 'done' | 'current' | 'upcoming';
}

/**
 * Stepper du tournoi : Inscriptions ouvertes → Clôture → Début.
 * La prochaine échéance est « current », celles passées sont « done ».
 */
export function timelineSteps(t: Pick<Tournament, 'registrationDeadline' | 'startTime'>, now: Date): TimelineStep[] {
  const closed = now.getTime() >= new Date(t.registrationDeadline).getTime();
  const started = now.getTime() >= new Date(t.startTime).getTime();
  return [
    { key: 'open', label: 'Inscriptions ouvertes', dateIso: null, state: 'done' },
    { key: 'deadline', label: 'Clôture des inscriptions', dateIso: t.registrationDeadline, state: closed ? 'done' : 'current' },
    { key: 'start', label: 'Début du tournoi', dateIso: t.startTime, state: started ? 'done' : closed ? 'current' : 'upcoming' },
  ];
}

// --- iCalendar (.ics) ---

/** Échappement RFC 5545 d'une valeur texte (\, ; , et retours ligne). */
function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Instant UTC au format iCalendar (YYYYMMDDTHHMMSSZ) — pas de VTIMEZONE nécessaire. */
function icsUTC(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Pliage des lignes > 75 octets (continuation = espace en tête), exigé par la RFC. */
function icsFold(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) { out.push((out.length ? ' ' : '') + rest.slice(0, 73)); rest = rest.slice(73); }
  out.push((out.length ? ' ' : '') + rest);
  return out;
}

/** Durée par défaut quand le tournoi/event n'a pas d'heure de fin. */
const ICS_DEFAULT_DURATION_MS = 2 * HOUR;

/** Item exportable en .ics : fiche tournoi ou fiche event. */
export interface AgendaICSItem {
  id: string;
  name: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  club: { name: string };
}

/** Contenu d'un fichier .ics pour un tournoi ou un event (dates en UTC, lignes CRLF). */
export function buildAgendaICS(
  t: AgendaICSItem,
  pageUrl: string,
  now: Date,
  uidPrefix: 'tournament' | 'event' = 'tournament',
): string {
  const end = t.endTime ?? new Date(new Date(t.startTime).getTime() + ICS_DEFAULT_DURATION_MS).toISOString();
  const description = [t.description, pageUrl].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Palova//Agenda//FR',
    'BEGIN:VEVENT',
    `UID:${uidPrefix}-${t.id}@palova`,
    `DTSTAMP:${icsUTC(now.toISOString())}`,
    `DTSTART:${icsUTC(t.startTime)}`,
    `DTEND:${icsUTC(end)}`,
    `SUMMARY:${icsEscape(t.name)}`,
    `LOCATION:${icsEscape(t.club.name)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `URL:${pageUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.flatMap(icsFold).join('\r\n') + '\r\n';
}

/** Nom de fichier .ics à partir du nom du tournoi, ex. « grand-prix-messieurs.ics ». */
export function icsFilename(name: string): string {
  const slug = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'tournoi'}.ics`;
}
