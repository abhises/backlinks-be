require('dotenv/config');
const prisma = require('./src/lib/prisma');

async function run() {
  console.log('Clearing specific database tables...');
  
  await prisma.chatMessage.deleteMany({});
  console.log('Cleared ChatMessages');

  await prisma.linkPlacement.deleteMany({});
  console.log('Cleared LinkPlacements');

  await prisma.exchangeThread.deleteMany({});
  console.log('Cleared ExchangeThreads');

  console.log('Connections, links, and inboxes cleared successfully. User accounts and workspaces have been preserved.');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
