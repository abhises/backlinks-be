const prisma = require('./src/lib/prisma');

async function main() {
  console.log('Clearing database...');

  // Delete all messages
  await prisma.chatMessage.deleteMany({});
  console.log('Cleared ChatMessages');

  // Delete all link placements
  await prisma.linkPlacement.deleteMany({});
  console.log('Cleared LinkPlacements');

  // Delete all exchange threads
  await prisma.exchangeThread.deleteMany({});
  console.log('Cleared ExchangeThreads');

  // Delete all team memberships
  await prisma.teamMember.deleteMany({});
  console.log('Cleared TeamMembers');

  // Delete all workspaces
  await prisma.workspace.deleteMany({});
  console.log('Cleared Workspaces');

  // Delete all non-admin users
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      role: {
        not: 'ADMIN'
      }
    }
  });
  console.log(`Cleared ${deletedUsers.count} non-admin Users`);

  console.log('Database cleanup complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
