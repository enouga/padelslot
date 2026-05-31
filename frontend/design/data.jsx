// data.jsx — mock domain data + helpers for SlotPadel.

const CLUB = {
  id: 'club-demo',
  name: 'Padel Arena Paris',
  address: '12 rue du Padel, 75011 Paris',
  open: 8, close: 22,
};

const COURTS = [
  { id: 'court-1', name: 'Court Central', surface: 'indoor', price: 25, note: 'Vitré · cristal', popular: true },
  { id: 'court-2', name: 'Court Nord',    surface: 'indoor', price: 25, note: 'Vitré · panoramique' },
  { id: 'court-3', name: 'Court Jardin',  surface: 'outdoor', price: 20, note: 'Plein air · gazon' },
];

const PLAYERS = ['Léa M.', 'Thomas R.', 'Karim B.', 'Sofia D.', 'Hugo L.', 'Inès P.', 'Marc V.', 'Emma G.', 'Yanis K.', 'Chloé T.', 'Adèle F.', 'Noé B.'];

// deterministic PRNG so a given court+date always seeds the same grid
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function pad(n) { return String(n).padStart(2, '0'); }

// 08:00 → 21:30, 30-min steps → 28 starts
function generateSlots(courtId, dateKey) {
  const rnd = seeded(courtId + dateKey);
  const out = [];
  for (let m = CLUB.open * 60; m < CLUB.close * 60; m += 30) {
    const h = Math.floor(m / 60), mm = m % 60;
    // evenings & midday busier
    const peak = (h >= 18 && h <= 21) ? 0.62 : (h >= 12 && h <= 13) ? 0.5 : 0.24;
    const taken = rnd() < peak;
    out.push({ id: `${courtId}-${pad(h)}${pad(mm)}`, time: `${pad(h)}:${pad(mm)}`, mins: m, status: taken ? 'taken' : 'free' });
  }
  return out;
}

function dayPills(count = 9) {
  const dows = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const mons = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];
  const base = new Date(2026, 4, 31); // fixed "today" for the mock (31 mai 2026)
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    out.push({
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      dow: dows[d.getDay()], day: d.getDate(), mon: mons[d.getMonth()],
      isToday: i === 0, label: i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : `${dows[d.getDay()]} ${d.getDate()}`,
    });
  }
  return out;
}

function endTime(time, duration) {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + duration;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

function total(price, duration) { return Math.round(price * (duration / 60)); }

function resCode() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const n = () => a[Math.floor(Math.random() * a.length)];
  return `PAD-${n()}${n()}${Math.floor(10 + Math.random() * 89)}${n()}`;
}

// Pre-built reservations for "Mes réservations"
const MY_RESERVATIONS = [
  { id: 'PAD-K72Q', court: 'Court Central', surface: 'indoor', date: 'Sam 31 mai', time: '19:00', end: '20:00', price: 25, status: 'confirmed', players: 4 },
  { id: 'PAD-B19M', court: 'Court Jardin',  surface: 'outdoor', date: 'Mar 3 juin', time: '12:30', end: '14:00', price: 30, status: 'confirmed', players: 4 },
  { id: 'PAD-T44X', court: 'Court Nord',    surface: 'indoor', date: 'Lun 19 mai', time: '20:30', end: '21:30', price: 25, status: 'played', players: 4 },
  { id: 'PAD-R08C', court: 'Court Central', surface: 'indoor', date: 'Jeu 8 mai', time: '18:00', end: '19:00', price: 25, status: 'played', players: 4 },
];

Object.assign(window, {
  CLUB, COURTS, PLAYERS, generateSlots, dayPills, endTime, total, resCode, MY_RESERVATIONS, pad,
});
