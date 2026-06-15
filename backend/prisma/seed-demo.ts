/**
 * Seed de démonstration "riche" — plusieurs clubs, plein de membres, des joueurs
 * inscrits dans plusieurs clubs, et des tournois remplis (complets + listes
 * d'attente, partiels, passés, brouillons).
 *
 * Rejouable : upsert sur clubs/users/adhésions ; les tournois d'un club démo sont
 * supprimés puis recréés à chaque exécution (les inscriptions tombent en cascade).
 *
 * Lancement (dossier backend/) :  npx ts-node prisma/seed-demo.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Gender = 'MEN' | 'WOMEN' | 'MIXED';
type TStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
type RStatus = 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';

const PASSWORD = 'password123';
const MEMBERS_PER_CLUB = 100; // 50 hommes + 50 femmes

const MALE_FIRST = ['Lucas','Hugo','Louis','Gabriel','Jules','Adam','Arthur','Nathan','Leo','Thomas','Maxime','Antoine','Paul','Nicolas','Pierre','Alexandre','Victor','Theo','Romain','Julien','Mathis','Enzo','Quentin','Florian','Raphael','Ethan','Noah','Sacha','Tom','Clement','Baptiste','Valentin','Mathieu','Damien','Sebastien','Guillaume','Benjamin','Axel','Dorian','Kevin','Anthony','Loic','Cedric','Fabien','Gaetan','Hadrien','Marius','Aurelien','Yann','Bastien'];
const FEMALE_FIRST = ['Emma','Jade','Louise','Alice','Chloe','Lina','Lea','Manon','Camille','Sarah','Ines','Juliette','Charlotte','Clara','Anais','Marie','Julie','Laura','Pauline','Sophie','Eva','Zoe','Lola','Nina','Lucie','Margaux','Oceane','Elise','Celine','Aurelie','Melanie','Justine','Amandine','Mathilde','Elodie','Caroline','Audrey','Maeva','Clemence','Romane','Lilou','Agathe','Capucine','Noemie','Salome','Maya','Lou','Anna','Eline','Faustine'];
const LAST = ['Martin','Bernard','Dubois','Thomas','Robert','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier','Morel','Girard','Andre','Mercier','Blanc','Guerin','Boyer','Garnier','Chevalier','Francois','Legrand','Gauthier','Perrin','Robin','Clement','Morin','Nicolas','Henry','Rousseau','Masson','Marchand','Duval','Denis','Dumont','Marie','Lemaire','Noel','Meyer','Dufour','Meunier','Brun','Blanchard','Giraud','Joly','Riviere','Lucas','Brunet','Gaillard','Barbier','Arnaud','Renard'];

const CLUBS = [
  { slug: 'padel-arena-paris',     name: 'Padel Arena Paris',     city: 'Paris',     short: 'paris',     accent: '#5e93da', theme: 'daylight' },
  { slug: 'lyon-padel-club',       name: 'Lyon Padel Club',       city: 'Lyon',      short: 'lyon',      accent: '#e2574c', theme: 'daylight' },
  { slug: 'marseille-padel',       name: 'Marseille Padel',       city: 'Marseille', short: 'marseille', accent: '#2bb3a3', theme: 'floodlit' },
  { slug: 'bordeaux-pala',         name: 'Bordeaux Pala',         city: 'Bordeaux',  short: 'bordeaux',  accent: '#7b61ff', theme: 'daylight' },
  { slug: 'toulouse-padel-indoor', name: 'Toulouse Padel Indoor', city: 'Toulouse',  short: 'toulouse',  accent: '#f4a534', theme: 'floodlit' },
];

// Gabarits de tournois (par club). confirmed = nb de binômes CONFIRMÉS, wait = en liste d'attente.
// startInDays négatif = tournoi passé.
const TOURNAMENTS: Array<{
  name: string; category: string; gender: Gender; status: TStatus;
  startInDays: number; maxTeams: number; confirmed: number; wait: number; fee: number;
}> = [
  { name: 'Open Messieurs',         category: 'P100', gender: 'MEN',   status: 'PUBLISHED', startInDays:  21, maxTeams: 8,  confirmed: 8, wait: 3, fee: 30 },
  { name: 'Tournoi Dames',          category: 'P250', gender: 'WOMEN', status: 'PUBLISHED', startInDays:  28, maxTeams: 6,  confirmed: 4, wait: 0, fee: 25 },
  { name: 'Mixte de printemps',     category: 'P50',  gender: 'MIXED', status: 'PUBLISHED', startInDays:  14, maxTeams: 8,  confirmed: 8, wait: 4, fee: 20 },
  { name: 'Grand Prix Messieurs',   category: 'P500', gender: 'MEN',   status: 'PUBLISHED', startInDays:  35, maxTeams: 12, confirmed: 7, wait: 0, fee: 40 },
  { name: 'Trophée Dames (passé)',  category: 'P25',  gender: 'WOMEN', status: 'PUBLISHED', startInDays:  -7, maxTeams: 8,  confirmed: 8, wait: 0, fee: 15 },
  { name: 'Mixte de fin de saison', category: 'P100', gender: 'MIXED', status: 'DRAFT',     startInDays:  40, maxTeams: 10, confirmed: 0, wait: 0, fee: 30 },
];

// Joueurs membres de PLUSIEURS clubs (indices dans CLUBS).
const NOMADS: Array<{ first: string; last: string; sex: 'MALE' | 'FEMALE'; clubs: number[] }> = [
  { first: 'Karim',   last: 'Benali',   sex: 'MALE',   clubs: [0, 1, 2] },
  { first: 'Sofia',   last: 'Rossi',    sex: 'FEMALE', clubs: [0, 3] },
  { first: 'Yanis',   last: 'Lopez',    sex: 'MALE',   clubs: [1, 2, 4] },
  { first: 'Camille', last: 'Faure',    sex: 'FEMALE', clubs: [0, 2, 4] },
  { first: 'Hugo',    last: 'Marchand', sex: 'MALE',   clubs: [3, 4] },
];

// Comptes de test « nommés » avec un rôle d'équipe (staff) — créés sur le 1er club
// (Paris). Emails parlants, mot de passe commun PASSWORD, pour tester le back-office.
const NAMED_STAFF: Array<{ email: string; first: string; last: string; role: 'OWNER' | 'ADMIN' | 'STAFF' }> = [
  { email: 'admin@padel-arena-paris.fr', first: 'Alice', last: 'Admin', role: 'ADMIN' },
  { email: 'staff@padel-arena-paris.fr', first: 'Sam',   last: 'Staff', role: 'STAFF' },
];

// Comptes de test « nommés » côté joueur (adhésion) — couvrent abonné / non-abonné /
// bloqué, sur le 1er club (Paris). N° de licence en PAR20xx pour ne pas croiser les
// membres générés (PAR10xx).
const NAMED_MEMBERS: Array<{
  email: string; first: string; last: string; sex: 'MALE' | 'FEMALE';
  isSubscriber: boolean; status: 'ACTIVE' | 'BLOCKED'; membershipNo: string; note?: string;
}> = [
  { email: 'abonne@padel-arena-paris.fr', first: 'Adrien', last: 'Abonne', sex: 'MALE',   isSubscriber: true,  status: 'ACTIVE',  membershipNo: 'PAR2001' },
  { email: 'membre@padel-arena-paris.fr', first: 'Manon',  last: 'Membre', sex: 'FEMALE', isSubscriber: false, status: 'ACTIVE',  membershipNo: 'PAR2002' },
  { email: 'bloque@padel-arena-paris.fr', first: 'Bruno',  last: 'Bloque', sex: 'MALE',   isSubscriber: false, status: 'BLOCKED', membershipNo: 'PAR2003', note: 'Compte de test : membre bloqué' },
];

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function phoneFor(a: number, b: number): string {
  return '06' + String(10000000 + a * 131 + b * 9173).slice(-8);
}
function daysFromNow(d: number): Date {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
}

// Matériaux de surface disponibles pour le padel (doit rester synchronisé avec seed.ts).
const PADEL_SURFACES = ['Béton poreux', 'Résine', 'Gazon synthétique'] as const;

async function main() {
  // Sport padel (idempotent — au cas où la base n'aurait pas le seed de base).
  const padel = await prisma.sport.upsert({
    where: { key: 'padel' },
    update: { surfaces: [...PADEL_SURFACES] },
    create: { key: 'padel', name: 'Padel', resourceNoun: 'terrain', defaultSlotStepMin: 30, defaultDurationsMin: [90], icon: '🎾', surfaces: [...PADEL_SURFACES] },
  });

  const hashed = await bcrypt.hash(PASSWORD, 10);
  let totalUsers = 0, totalTournaments = 0, totalRegs = 0;
  const createdClubs: { id: string; slug: string; name: string }[] = [];

  for (let c = 0; c < CLUBS.length; c++) {
    const cdef = CLUBS[c];

    const club = await prisma.club.upsert({
      where: { slug: cdef.slug },
      update: { accentColor: cdef.accent, defaultThemeMode: cdef.theme },
      create: {
        slug: cdef.slug, name: cdef.name, city: cdef.city, country: 'FR',
        address: `1 avenue du Padel, ${cdef.city}`, timezone: 'Europe/Paris',
        accentColor: cdef.accent, defaultThemeMode: cdef.theme,
        description: `Club de padel à ${cdef.city} — réservations et tournois.`,
      },
    });
    createdClubs.push({ id: club.id, slug: cdef.slug, name: cdef.name });

    const clubSport = await prisma.clubSport.upsert({
      where: { clubId_sportId: { clubId: club.id, sportId: padel.id } },
      update: {},
      create: { clubId: club.id, sportId: padel.id, durationsMin: [90] },
    });

    // Terrains — covered: true = couvert/indoor ; surface = matériau parmi PADEL_SURFACES
    for (let n = 1; n <= 5; n++) {
      const covered = n <= 3;
      const material = covered ? PADEL_SURFACES[0] : PADEL_SURFACES[2];
      const format = n <= 3 ? 'double' : 'single';
      await prisma.resource.upsert({
        where: { id: `${cdef.slug}-court-${n}` },
        update: { name: `Terrain ${n}` },
        create: {
          id: `${cdef.slug}-court-${n}`, clubId: club.id, clubSportId: clubSport.id,
          name: `Terrain ${n}`, attributes: { covered, surface: material, format }, price: n <= 3 ? 25 : 18,
        },
      });
    }

    // Gérant du club
    const owner = await prisma.user.upsert({
      where: { email: `owner@${cdef.slug}.fr` },
      update: {},
      create: { email: `owner@${cdef.slug}.fr`, password: hashed, firstName: 'Gérant', lastName: cdef.city, emailVerified: true },
    });
    await prisma.clubMember.upsert({
      where: { userId_clubId: { userId: owner.id, clubId: club.id } },
      update: { role: 'OWNER' },
      create: { userId: owner.id, clubId: club.id, role: 'OWNER' },
    });

    // Membres (50 H + 50 F) avec adhésion ACTIVE + téléphone + licence
    const males: string[] = [];
    const females: string[] = [];
    for (let k = 0; k < MEMBERS_PER_CLUB / 2; k++) {
      for (const sex of ['MALE', 'FEMALE'] as const) {
        const first = sex === 'MALE' ? MALE_FIRST[k % MALE_FIRST.length] : FEMALE_FIRST[k % FEMALE_FIRST.length];
        const last = LAST[(k * 2 + (sex === 'MALE' ? 0 : 1)) % LAST.length];
        const email = `${fold(first)}.${fold(last)}.${k}@${cdef.short}.demo.fr`;
        const u = await prisma.user.upsert({
          where: { email },
          update: {},
          create: { email, password: hashed, firstName: first, lastName: last, sex, phone: phoneFor(c, sex === 'MALE' ? k : k + 100), emailVerified: true },
        });
        await prisma.clubMembership.upsert({
          where: { userId_clubId: { userId: u.id, clubId: club.id } },
          update: { status: 'ACTIVE' },
          create: {
            userId: u.id, clubId: club.id, status: 'ACTIVE',
            isSubscriber: k % 3 === 0,
            membershipNo: `${cdef.short.toUpperCase().slice(0, 3)}${1000 + k}`,
          },
        });
        totalUsers++;
        (sex === 'MALE' ? males : females).push(u.id);
      }
    }

    // Tournois : on repart de zéro pour ce club (cascade sur les inscriptions)
    await prisma.tournament.deleteMany({ where: { clubId: club.id } });

    for (let t = 0; t < TOURNAMENTS.length; t++) {
      const def = TOURNAMENTS[t];
      const start = daysFromNow(def.startInDays);
      const deadline = daysFromNow(def.startInDays - 5);
      const tour = await prisma.tournament.create({
        data: {
          clubId: club.id, clubSportId: clubSport.id, name: def.name, category: def.category,
          gender: def.gender, status: def.status, startTime: start,
          endTime: new Date(start.getTime() + 8 * 60 * 60 * 1000),
          registrationDeadline: deadline, maxTeams: def.maxTeams, entryFee: def.fee,
          description: `${def.category} ${def.gender === 'MEN' ? 'Messieurs' : def.gender === 'WOMEN' ? 'Dames' : 'Mixte'} — ${cdef.name}.`,
        },
      });
      totalTournaments++;

      // Pools tournés d'un tournoi à l'autre pour varier les participants
      const rotM = males.slice(t * 3).concat(males.slice(0, t * 3));
      const rotF = females.slice(t * 3).concat(females.slice(0, t * 3));
      let mi = 0, fi = 0;
      const nextPair = (g: Gender): [string, string] | null => {
        if (g === 'MEN') { if (mi + 2 > rotM.length) return null; const a = rotM[mi++], b = rotM[mi++]; return [a, b]; }
        if (g === 'WOMEN') { if (fi + 2 > rotF.length) return null; const a = rotF[fi++], b = rotF[fi++]; return [a, b]; }
        if (mi >= rotM.length || fi >= rotF.length) return null; return [rotM[mi++], rotF[fi++]]; // MIXED = 1H + 1F
      };

      const teams = def.confirmed + def.wait;
      const base = Date.now() - teams * 60000; // inscriptions échelonnées (ordre = liste d'attente)
      for (let i = 0; i < teams; i++) {
        const pair = nextPair(def.gender);
        if (!pair) break;
        const status: RStatus = i < def.confirmed ? 'CONFIRMED' : 'WAITLISTED';
        await prisma.tournamentRegistration.create({
          data: {
            tournamentId: tour.id, captainUserId: pair[0], partnerUserId: pair[1],
            status, createdAt: new Date(base + i * 60000),
          },
        });
        totalRegs++;
      }
    }

    console.log(`✔ ${cdef.name} : 5 terrains, ${MEMBERS_PER_CLUB} membres, ${TOURNAMENTS.length} tournois`);
  }

  // Joueurs « multi-clubs » : une adhésion ACTIVE dans plusieurs clubs.
  let nomadMemberships = 0;
  for (let i = 0; i < NOMADS.length; i++) {
    const no = NOMADS[i];
    const email = `${fold(no.first)}.${fold(no.last)}@multi.demo.fr`;
    const u = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, password: hashed, firstName: no.first, lastName: no.last, sex: no.sex, phone: phoneFor(99, i), emailVerified: true },
    });
    totalUsers++;
    for (const ci of no.clubs) {
      const target = createdClubs[ci];
      await prisma.clubMembership.upsert({
        where: { userId_clubId: { userId: u.id, clubId: target.id } },
        update: { status: 'ACTIVE' },
        create: { userId: u.id, clubId: target.id, status: 'ACTIVE', isSubscriber: i % 2 === 0, membershipNo: `MULTI${100 + i}` },
      });
      nomadMemberships++;
    }
    console.log(`✔ multi-clubs : ${no.first} ${no.last} → ${no.clubs.map((ci) => createdClubs[ci].slug).join(', ')}`);
  }

  // === Comptes de test « nommés » (tous les profils) sur le 1er club (Paris) ===
  const mainClub = createdClubs[0];

  // Super-admin plateforme (en dev : password123 ; ne réécrit pas un mot de passe existant).
  await prisma.user.upsert({
    where: { email: 'super@palova.fr' },
    update: { isSuperAdmin: true, emailVerified: true },
    create: { email: 'super@palova.fr', password: hashed, firstName: 'Super', lastName: 'Admin', isSuperAdmin: true, emailVerified: true },
  });

  // Staff (rôles d'équipe : ADMIN / STAFF — l'OWNER « Gérant Paris » est déjà créé plus haut).
  for (const s of NAMED_STAFF) {
    const u = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email, password: hashed, firstName: s.first, lastName: s.last, emailVerified: true },
    });
    await prisma.clubMember.upsert({
      where: { userId_clubId: { userId: u.id, clubId: mainClub.id } },
      update: { role: s.role },
      create: { userId: u.id, clubId: mainClub.id, role: s.role },
    });
  }

  // Joueurs (adhésions : abonné / standard / bloqué).
  for (const m of NAMED_MEMBERS) {
    const u = await prisma.user.upsert({
      where: { email: m.email },
      update: {},
      create: { email: m.email, password: hashed, firstName: m.first, lastName: m.last, sex: m.sex, emailVerified: true },
    });
    await prisma.clubMembership.upsert({
      where: { userId_clubId: { userId: u.id, clubId: mainClub.id } },
      update: { status: m.status, isSubscriber: m.isSubscriber, membershipNo: m.membershipNo, note: m.note ?? null },
      create: { userId: u.id, clubId: mainClub.id, status: m.status, isSubscriber: m.isSubscriber, membershipNo: m.membershipNo, note: m.note ?? null },
    });
  }

  console.log(`\nSeed démo terminé : ${CLUBS.length} clubs, ${totalUsers} membres (dont ${NOMADS.length} multi-clubs = ${nomadMemberships} adhésions), ${totalTournaments} tournois, ${totalRegs} inscriptions.`);

  console.log(`\n=== COMPTES DE TEST — mot de passe commun : ${PASSWORD} ===`);
  console.log(`(tous sur le club « ${mainClub.name} » → ${mainClub.slug}.localhost:3000, sauf le super-admin)`);
  console.log(`  Super-admin plateforme   : super@palova.fr               → hôte plateforme, /superadmin`);
  console.log(`  Gérant (OWNER)           : owner@${mainClub.slug}.fr   → back-office /admin (tous droits)`);
  console.log(`  Admin club (ADMIN)       : admin@${mainClub.slug}.fr   → back-office /admin`);
  console.log(`  Staff club (STAFF)       : staff@${mainClub.slug}.fr   → back-office /admin (droits réduits)`);
  console.log(`  Membre ABONNÉ (ACTIVE)   : abonne@${mainClub.slug}.fr  → fenêtre de résa élargie`);
  console.log(`  Membre standard (ACTIVE) : membre@${mainClub.slug}.fr  → joueur non abonné`);
  console.log(`  Membre BLOQUÉ (BLOCKED)  : bloque@${mainClub.slug}.fr  → résa/inscriptions refusées`);
  console.log(`  Joueur multi-clubs       : karim.benali@multi.demo.fr     → membre de 3 clubs`);
  console.log(`  Membre généré (exemple)  : lucas.martin.0@paris.demo.fr   → +99 autres / club`);
  console.log(`Connexion gérant : owner@<slug>.fr / ${PASSWORD}  (ex. owner@lyon-padel-club.fr)`);
  console.log(`Joueurs multi-clubs : <prenom>.<nom>@multi.demo.fr / ${PASSWORD}  (ex. karim.benali@multi.demo.fr)`);
  console.log(`Clubs : ${CLUBS.map((c) => `${c.slug}.localhost:3000`).join(' , ')}`);
}

main().finally(() => prisma.$disconnect());
