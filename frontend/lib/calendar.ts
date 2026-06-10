import { MyReservation, MyTournamentRegistration } from '@/lib/api';

export interface MonthCell {
  key: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
}

export type CalendarEntry =
  | { kind: 'reservation'; id: string; dayKey: string; past: boolean; r: MyReservation }
  | {
      kind: 'tournament'; id: string; dayKeys: string[]; startKey: string; endKey: string;
      past: boolean; reg: MyTournamentRegistration;
    };

/**
 * Clé jour YYYY-MM-DD d'un instant ISO dans le fuseau donné.
 * Seule conversion instant→jour de la lib : tout le reste manipule des clés
 * en arithmétique UTC pure (insensible au DST et au fuseau du runtime).
 */
export function dayKeyInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

/** Clé du jour courant dans le fuseau du navigateur (surlignage « aujourd'hui »). */
export function todayKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function keyOfUtc(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** Grille du mois (month 1–12) : semaines lun→dim, cellules des mois adjacents incluses. */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = Date.UTC(year, month - 1, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7; // 0 = lundi
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weekCount = Math.ceil((lead + daysInMonth) / 7);

  const weeks: MonthCell[][] = [];
  let t = first - lead * 86_400_000;
  for (let w = 0; w < weekCount; w++) {
    const week: MonthCell[] = [];
    for (let d = 0; d < 7; d++, t += 86_400_000) {
      const date = new Date(t);
      week.push({
        key: keyOfUtc(t),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month - 1 && date.getUTCFullYear() === year,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12 + 12) % 12 + 1 };
}

/** Libellé « juin 2026 ». */
export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Toutes les clés jour de startKey à endKey inclus (cap sécurité : 62 jours). */
export function enumerateDayKeys(startKey: string, endKey: string): string[] {
  const [y, m, d] = startKey.split('-').map(Number);
  const end = Date.parse(`${endKey}T00:00:00Z`);
  const out: string[] = [];
  for (let t = Date.UTC(y, m - 1, d); t <= end && out.length < 62; t += 86_400_000) {
    out.push(keyOfUtc(t));
  }
  return out;
}

/** Fusionne réservations terrain et inscriptions tournois en entrées calendrier. */
export function buildCalendarEntries(
  reservations: MyReservation[],
  regs: MyTournamentRegistration[],
  now: Date,
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  for (const r of reservations) {
    if (r.status === 'CANCELLED') continue;
    entries.push({
      kind: 'reservation',
      id: r.id,
      dayKey: dayKeyInTz(r.startTime, r.resource.club.timezone),
      past: new Date(r.endTime) < now,
      r,
    });
  }

  for (const reg of regs) {
    if (reg.status === 'CANCELLED' || reg.tournament.status === 'CANCELLED') continue;
    const tz = reg.tournament.club.timezone;
    const startKey = dayKeyInTz(reg.tournament.startTime, tz);
    const endKey = reg.tournament.endTime ? dayKeyInTz(reg.tournament.endTime, tz) : startKey;
    entries.push({
      kind: 'tournament',
      id: reg.id,
      startKey,
      endKey,
      dayKeys: enumerateDayKeys(startKey, endKey),
      past: new Date(reg.tournament.endTime ?? reg.tournament.startTime) < now,
      reg,
    });
  }

  return entries;
}

/** Index par jour ; un tournoi multi-jours apparaît sur chacun de ses jours, avant les réservations. */
export function entriesByDay(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const byDay = new Map<string, CalendarEntry[]>();
  const push = (key: string, e: CalendarEntry) => {
    const list = byDay.get(key);
    if (list) list.push(e);
    else byDay.set(key, [e]);
  };

  for (const e of entries) {
    if (e.kind === 'reservation') push(e.dayKey, e);
    else for (const key of e.dayKeys) push(key, e);
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'tournament' ? -1 : 1;
      const sa = a.kind === 'reservation' ? a.r.startTime : a.reg.tournament.startTime;
      const sb = b.kind === 'reservation' ? b.r.startTime : b.reg.tournament.startTime;
      return sa.localeCompare(sb); // ISO UTC : ordre lexicographique = chronologique
    });
  }
  return byDay;
}
