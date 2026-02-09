import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@holidayvillas.com' },
    update: {},
    create: {
      email: 'admin@holidayvillas.com',
      password: adminPassword,
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

  // Create sample bookings
  const booking1 = await prisma.booking.upsert({
    where: { id: 1 },
    update: {},
    create: {
      villaSlug: 'premium-1',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+383 44 123 456',
      checkIn: new Date('2025-11-01'),
      checkOut: new Date('2025-11-05'),
      guests: 4,
      amount: 600.00,
      status: 'paid'
    },
  });

  const booking2 = await prisma.booking.upsert({
    where: { id: 2 },
    update: {},
    create: {
      villaSlug: 'vip-1',
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '+383 44 789 012',
      checkIn: new Date('2025-11-10'),
      checkOut: new Date('2025-11-15'),
      guests: 2,
      amount: 1250.00,
      status: 'pending'
    },
  });

  const booking3 = await prisma.booking.upsert({
    where: { id: 3 },
    update: {},
    create: {
      villaSlug: 'premium-1',
      name: 'Mike Johnson',
      email: 'mike@example.com',
      phone: '+383 44 345 678',
      checkIn: new Date('2025-10-25'),
      checkOut: new Date('2025-10-28'),
      guests: 6,
      amount: 450.00,
      status: 'paid'
    },
  });

  // Create sample staff users
  const staff1Password = await bcrypt.hash('staff123', 10);
  const staff2Password = await bcrypt.hash('manager123', 10);

  const staff1 = await prisma.user.upsert({
    where: { email: 'staff@holidayvillas.com' },
    update: {},
    create: {
      email: 'staff@holidayvillas.com',
      password: staff1Password,
      name: 'Staff Member',
      role: 'staff',
    },
  });

  const staff2 = await prisma.user.upsert({
    where: { email: 'manager@holidayvillas.com' },
    update: {},
    create: {
      email: 'manager@holidayvillas.com',
      password: staff2Password,
      name: 'Villa Manager',
      role: 'staff',
    },
  });

  console.log({ admin, villa1, villa2, booking1, booking2, booking3, staff1, staff2 });
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