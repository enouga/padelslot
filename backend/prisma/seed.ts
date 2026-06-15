import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Catalogue de sports géré par la plateforme.
// Matériaux de surface disponibles pour le padel (utilisés dans Resource.attributes.surface).
const PADEL_SURFACES = ['Béton poreux', 'Résine', 'Gazon synthétique'] as const;

const SPORTS = [
  { key: 'padel',      name: 'Padel',          resourceNoun: 'terrain', defaultSlotStepMin: 30, defaultDurationsMin: [90], icon: '🎾', surfaces: [...PADEL_SURFACES] },
  { key: 'tennis',     name: 'Tennis',         resourceNoun: 'court',   defaultSlotStepMin: 30, defaultDurationsMin: [60, 90, 120], icon: '🎾', surfaces: ['Terre battue', 'Gazon', 'Résine'] },
  { key: 'pickleball', name: 'Pickleball',     resourceNoun: 'court',   defaultSlotStepMin: 30, defaultDurationsMin: [60, 90],      icon: '🥒' },
  { key: 'squash',     name: 'Squash',         resourceNoun: 'court',   defaultSlotStepMin: 30, defaultDurationsMin: [45, 60],      icon: '🟦' },
  { key: 'badminton',  name: 'Badminton',      resourceNoun: 'terrain', defaultSlotStepMin: 30, defaultDurationsMin: [60, 90],      icon: '🏸' },
  { key: 'pingpong',   name: 'Tennis de table', resourceNoun: 'table',  defaultSlotStepMin: 30, defaultDurationsMin: [30, 60],      icon: '🏓' },
];

async function main() {
  // 1. Catalogue de sports (idempotent)
  for (const s of SPORTS) {
    await prisma.sport.upsert({
      where: { key: s.key },
      update: { name: s.name, resourceNoun: s.resourceNoun, defaultSlotStepMin: s.defaultSlotStepMin, defaultDurationsMin: s.defaultDurationsMin, icon: s.icon, ...(s.surfaces ? { surfaces: s.surfaces } : {}) },
      create: s,
    });
  }
  const padel = await prisma.sport.findUniqueOrThrow({ where: { key: 'padel' } });

  // 2. Club de démo
  const club = await prisma.club.upsert({
    where: { id: 'club-demo' },
    // Branding Palova autoritaire pour la démo (bleu + mode clair/paper).
    update: { accentColor: '#5e93da', defaultThemeMode: 'daylight' },
    create: {
      id: 'club-demo',
      slug: 'padel-arena-paris',
      name: 'Padel Arena Paris',
      address: '12 rue du Padel, 75011 Paris',
      city: 'Paris',
      country: 'FR',
      timezone: 'Europe/Paris',
      accentColor: '#5e93da',
      defaultThemeMode: 'daylight',
    },
  });

  // 3. Le club active le padel
  const clubSport = await prisma.clubSport.upsert({
    where: { clubId_sportId: { clubId: club.id, sportId: padel.id } },
    update: {},
    create: { clubId: club.id, sportId: padel.id },
  });

  // 4. Ressources (anciens "terrains")
  // covered: true = couvert/indoor ; surface = matériau (doit figurer dans Sport.surfaces)
  const resources = [
    { id: 'court-1', name: 'Terrain 1', attributes: { covered: true,  surface: PADEL_SURFACES[0], format: 'double' }, price: 25 },
    { id: 'court-2', name: 'Terrain 2', attributes: { covered: true,  surface: PADEL_SURFACES[0], format: 'double' }, price: 25 },
    { id: 'court-3', name: 'Terrain 3', attributes: { covered: false, surface: PADEL_SURFACES[2], format: 'double' }, price: 20 },
    { id: 'court-4', name: 'Terrain 4', attributes: { covered: true,  surface: PADEL_SURFACES[0], format: 'single' }, price: 18 },
    { id: 'court-5', name: 'Terrain 5', attributes: { covered: false, surface: PADEL_SURFACES[2], format: 'single' }, price: 16 },
  ];
  for (const r of resources) {
    await prisma.resource.upsert({
      where: { id: r.id },
      update: { name: r.name, attributes: r.attributes, price: r.price },
      create: { id: r.id, clubId: club.id, clubSportId: clubSport.id, name: r.name, attributes: r.attributes, price: r.price },
    });
  }

  // 4b. Annonces & sponsors de démo (idempotent : on repart de zéro pour le club démo)
  await prisma.announcement.deleteMany({ where: { clubId: club.id } });
  await prisma.announcement.createMany({ data: [
    { clubId: club.id, title: 'Tournoi interne samedi', body: 'Inscriptions ouvertes au club-house. Niveau loisir, lots à gagner !', pinned: true },
    { clubId: club.id, title: 'Nouveaux créneaux le matin', body: 'Le club ouvre désormais dès 8h en semaine.' },
  ] });
  await prisma.sponsor.deleteMany({ where: { clubId: club.id } });
  await prisma.sponsor.createMany({ data: [
    { clubId: club.id, name: 'Babolat', logoUrl: 'https://dummyimage.com/120x44/111/fff&text=Babolat', sortOrder: 1 },
    { clubId: club.id, name: 'Decathlon', logoUrl: 'https://dummyimage.com/120x44/111/fff&text=Decathlon', sortOrder: 2 },
  ] });

  // 5. Comptes de démo — un par rôle (mot de passe commun : password123)
  const hashedPassword = await bcrypt.hash('password123', 10);

  // role = null → simple joueur (CLIENT), sans rattachement à un club.
  const demoAccounts: Array<{ email: string; firstName: string; lastName: string; role: 'OWNER' | 'ADMIN' | 'STAFF' | null }> = [
    { email: 'test@palova.fr', firstName: 'Jean',   lastName: 'Dupont',   role: 'OWNER' }, // compte historique
    { email: 'owner@palova.fr',   firstName: 'Olivia', lastName: 'Martin',   role: 'OWNER' },
    { email: 'admin@palova.fr',   firstName: 'Adam',   lastName: 'Bernard',  role: 'ADMIN' },
    { email: 'staff@palova.fr',   firstName: 'Sarah',  lastName: 'Petit',    role: 'STAFF' },
    { email: 'joueur@palova.fr',  firstName: 'Lucas',  lastName: 'Moreau',   role: null },
  ];

  for (const acc of demoAccounts) {
    const u = await prisma.user.upsert({
      where: { email: acc.email },
      update: { emailVerified: true },
      create: { email: acc.email, password: hashedPassword, firstName: acc.firstName, lastName: acc.lastName, emailVerified: true },
    });
    if (acc.role) {
      await prisma.clubMember.upsert({
        where: { userId_clubId: { userId: u.id, clubId: club.id } },
        update: { role: acc.role },
        create: { userId: u.id, clubId: club.id, role: acc.role },
      });
    }
  }

  // 5b. Super-admin plateforme (idempotent). Mot de passe via env en prod, défaut dev.
  // En production, refuser le repli sur le mot de passe de dev (sécurité du compte le plus puissant).
  if (process.env.NODE_ENV === 'production' && !process.env.SUPERADMIN_PASSWORD) {
    throw new Error('SUPERADMIN_PASSWORD doit être défini pour seeder en production (compte super-admin).');
  }
  const superPassword = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD ?? 'password123', 10);
  await prisma.user.upsert({
    where: { email: 'super@palova.fr' },
    update: { isSuperAdmin: true, password: superPassword, emailVerified: true },
    create: {
      email: 'super@palova.fr',
      password: superPassword,
      firstName: 'Super',
      lastName: 'Admin',
      isSuperAdmin: true,
      emailVerified: true,
    },
  });

  console.log('Seed terminé.');
}

main().finally(() => prisma.$disconnect());
