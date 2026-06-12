const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const notifs = await prisma.notification.findMany({ take: 30, orderBy: { createdAt: 'desc' } });
  notifs.forEach(n => console.log(n.type, n.title, n.body, n.payload));
}
main().catch(console.error).finally(() => prisma.$disconnect());
