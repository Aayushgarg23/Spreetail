/**
 * Prisma seed script — creates 6 pre-defined users matching the CSV.
 * Run with: node prisma/seed.js
 * Default password for all seed users: Spreetail@2024
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SEED_USERS = [
  { name: 'Aisha', email: 'aisha@spreetail.app' },
  { name: 'Rohan', email: 'rohan@spreetail.app' },
  { name: 'Priya', email: 'priya@spreetail.app' },
  { name: 'Meera', email: 'meera@spreetail.app' },
  { name: 'Dev', email: 'dev@spreetail.app' },
  { name: 'Sam', email: 'sam@spreetail.app' },
];

const DEFAULT_PASSWORD = 'Spreetail@2024';

async function main() {
  console.log('🌱 Seeding users...');
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const users = [];
  for (const u of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash },
    });
    users.push(user);
    console.log(`  ✅ ${u.name} (${u.email})`);
  }

  // Create a demo group "Flat 4B"
  const [aisha, rohan, priya, meera, dev, sam] = users;

  const existingGroup = await prisma.group.findFirst({ where: { name: 'Flat 4B' } });
  if (!existingGroup) {
    const group = await prisma.group.create({
      data: {
        name: 'Flat 4B',
        createdBy: aisha.id,
      },
    });
    console.log(`\n🏠 Created group: "Flat 4B" (ID: ${group.id})`);

    // Add all members with correct join/leave dates
    const memberships = [
      { userId: aisha.id, joinedAt: new Date('2026-02-01'), leftAt: null },
      { userId: rohan.id, joinedAt: new Date('2026-02-01'), leftAt: null },
      { userId: priya.id, joinedAt: new Date('2026-02-01'), leftAt: null },
      { userId: meera.id, joinedAt: new Date('2026-02-01'), leftAt: new Date('2026-03-31') }, // Meera left end of March
      { userId: dev.id, joinedAt: new Date('2026-03-10'), leftAt: new Date('2026-03-15') },   // Dev joined for a trip
      { userId: sam.id, joinedAt: new Date('2026-04-15'), leftAt: null },                     // Sam joined mid-April
    ];

    for (const m of memberships) {
      await prisma.groupMembership.create({
        data: { groupId: group.id, ...m },
      });
    }

    console.log('  ✅ Memberships created:');
    console.log('     Aisha  — joined Feb 1 (active)');
    console.log('     Rohan  — joined Feb 1 (active)');
    console.log('     Priya  — joined Feb 1 (active)');
    console.log('     Meera  — joined Feb 1, left Mar 31');
    console.log('     Dev    — joined Mar 10, left Mar 15 (trip only)');
    console.log('     Sam    — joined Apr 15 (active)');

    // Activity log
    await prisma.activityLog.create({
      data: {
        groupId: group.id,
        userId: aisha.id,
        action: 'GROUP_CREATED',
        description: 'Aisha created the group "Flat 4B"',
      },
    });

    console.log(`\n✨ Seed complete! Group ID for CSV import: ${group.id}`);
  } else {
    console.log(`\n⚠️  Group "Flat 4B" already exists (ID: ${existingGroup.id}), skipping.`);
  }

  console.log('\n📋 Login credentials (all users):');
  console.log('   Password: Spreetail@2024');
  for (const u of SEED_USERS) {
    console.log(`   ${u.name}: ${u.email}`);
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
