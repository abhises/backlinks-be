const prisma = require('./src/lib/prisma');

async function run() {
  const user = await prisma.user.findFirst();
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN' }
    });
    console.log('Made user ' + user.email + ' an ADMIN');
  } else {
    console.log('No users found');
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
