import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Catalogue de sports géré par la plateforme.
const SPORTS = [
  { key: 'padel',      name: 'Padel',          resourceNoun: 'terrain', defaultSlotStepMin: 30, defaultDurationsMin: [60, 90, 120], icon: '🎾' },
  { key: 'tennis',     name: 'Tennis',         resourceNoun: 'court',   defaultSlotStepMin: 30, defaultDurationsMin: [60, 90, 120], icon: '🎾' },
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
      update: { name: s.name, resourceNoun: s.resourceNoun, defaultSlotStepMin: s.defaultSlotStepMin, defaultDurationsMin: s.defaultDurationsMin, icon: s.icon },
      create: s,
    });
  }
  const padel = await prisma.sport.findUniqueOrThrow({ where: { key: 'padel' } });

  // 2. Club de démo
  const club = await prisma.club.upsert({
    where: { id: 'club-demo' },
    update: {},
    create: {
      id: 'club-demo',
      slug: 'padel-arena-paris',
      name: 'Padel Arena Paris',
      address: '12 rue du Padel, 75011 Paris',
      city: 'Paris',
      country: 'FR',
      timezone: 'Europe/Paris',
      accentColor: '#d6ff3f',
      defaultThemeMode: 'floodlit',
    },
  });

  // 3. Le club active le padel
  const clubSport = await prisma.clubSport.upsert({
    where: { clubId_sportId: { clubId: club.id, sportId: padel.id } },
    update: {},
    create: { clubId: club.id, sportId: padel.id },
  });

  // 4. Ressources (anciens "terrains")
  const resources = [
    { id: 'court-1', name: 'Terrain 1',           attributes: { surface: 'indoor' },  pricePerHour: 25 },
    { id: 'court-2', name: 'Terrain 2',           attributes: { surface: 'indoor' },  pricePerHour: 25 },
    { id: 'court-3', name: 'Terrain 3 (outdoor)', attributes: { surface: 'outdoor' }, pricePerHour: 20 },
  ];
  for (const r of resources) {
    await prisma.resource.upsert({
      where: { id: r.id },
      update: {},
      create: { id: r.id, clubId: club.id, clubSportId: clubSport.id, name: r.name, attributes: r.attributes, pricePerHour: r.pricePerHour },
    });
  }

  // 5. Comptes de démo — un par rôle (mot de passe commun : password123)
  const hashedPassword = await bcrypt.hash('password123', 10);

  // role = null → simple joueur (CLIENT), sans rattachement à un club.
  const demoAccounts: Array<{ email: string; firstName: string; lastName: string; role: 'OWNER' | 'ADMIN' | 'STAFF' | null }> = [
    { email: 'test@padelconnect.fr', firstName: 'Jean',   lastName: 'Dupont',   role: 'OWNER' }, // compte historique
    { email: 'owner@slotpadel.fr',   firstName: 'Olivia', lastName: 'Martin',   role: 'OWNER' },
    { email: 'admin@slotpadel.fr',   firstName: 'Adam',   lastName: 'Bernard',  role: 'ADMIN' },
    { email: 'staff@slotpadel.fr',   firstName: 'Sarah',  lastName: 'Petit',    role: 'STAFF' },
    { email: 'joueur@slotpadel.fr',  firstName: 'Lucas',  lastName: 'Moreau',   role: null },
  ];

  for (const acc of demoAccounts) {
    const u = await prisma.user.upsert({
      where: { email: acc.email },
      update: {},
      create: { email: acc.email, password: hashedPassword, firstName: acc.firstName, lastName: acc.lastName },
    });
    if (acc.role) {
      await prisma.clubMember.upsert({
        where: { userId_clubId: { userId: u.id, clubId: club.id } },
        update: { role: acc.role },
        create: { userId: u.id, clubId: club.id, role: acc.role },
      });
    }
  }

  console.log('Seed terminé.');
}

main().finally(() => prisma.$disconnect());
