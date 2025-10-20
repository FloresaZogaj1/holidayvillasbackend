import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@holidayvillas.com' },
    update: {},
    create: {
      email: 'admin@holidayvillas.com',
      password: 'admin123',
      name: 'Admin',
      role: 'admin',
    },
  });

  // Create some sample villas
  const villa1 = await prisma.villa.upsert({
    where: { slug: 'premium-1' },
    update: {},
    create: {
      name: 'Premium Villa 1',
      slug: 'premium-1',
      type: 'PREMIUM',
      price: 150.00,
      description: 'Beautiful premium villa with pool',
    },
  });

  const villa2 = await prisma.villa.upsert({
    where: { slug: 'vip-1' },
    update: {},
    create: {
      name: 'VIP Villa 1',
      slug: 'vip-1',
      type: 'VIP',
      price: 250.00,
      description: 'Luxury VIP villa with premium amenities',
    },
  });

  console.log({ admin, villa1, villa2 });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });