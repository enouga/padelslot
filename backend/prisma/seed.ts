import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const club = await prisma.club.upsert({
    where: { id: 'club-demo' },
    update: {},
    create: {
      id: 'club-demo',
      name: 'Padel Arena Paris',
      address: '12 rue du Padel, 75001 Paris',
    },
  });

  await prisma.court.createMany({
    data: [
      { id: 'court-1', clubId: club.id, name: 'Terrain 1', surface: 'indoor', pricePerHour: 25 },
      { id: 'court-2', clubId: club.id, name: 'Terrain 2', surface: 'indoor', pricePerHour: 25 },
      { id: 'court-3', clubId: club.id, name: 'Terrain 3 (outdoor)', surface: 'outdoor', pricePerHour: 20 },
    ],
    skipDuplicates: true,
  });

  const hashedPassword = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { email: 'test@padelconnect.fr' },
    update: {},
    create: {
      email: 'test@padelconnect.fr',
      password: hashedPassword,
      firstName: 'Jean',
      lastName: 'Dupont',
    },
  });

  console.log('Seed terminé.');
}

main().finally(() => prisma.$disconnect());
