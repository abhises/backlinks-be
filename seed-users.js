const prisma = require('./src/lib/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  console.log('Starting generation of 50 users and workspaces...');
  
  const hashedPassword = await bcrypt.hash('password123', 12);
  
  for (let i = 1; i <= 50; i++) {
    const userEmail = `simulated_user_${i}@example.com`;
    const userName = `Simulated User ${i}`;
    
    // Check if user already exists to avoid errors on re-runs
    let user = await prisma.user.findUnique({ where: { email: userEmail } });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: userName,
          email: userEmail,
          hashedPassword,
          role: 'CLIENT'
        }
      });
      console.log(`Created user: ${userEmail}`);
    } else {
      console.log(`User already exists: ${userEmail}`);
    }

    const domain = `simulated-workspace-${i}.com`;
    
    // Check if workspace already exists
    let workspace = await prisma.workspace.findUnique({ where: { domain } });
    
    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          domain,
          websiteName: `Simulated Workspace ${i}`,
          description: `This is a simulated workspace for testing purposes.`,
          niche: ['Technology', 'Health', 'Finance', 'Travel', 'Lifestyle'][i % 5],
          country: 'US',
          language: 'EN',
          monthlyTraffic: Math.floor(Math.random() * 50000) + 1000,
          teamMembers: {
            create: {
              userId: user.id,
              role: 'OWNER'
            }
          }
        }
      });
      console.log(`Created workspace: ${domain} for user ${userEmail}`);
    } else {
      console.log(`Workspace already exists: ${domain}`);
    }
  }
  
  console.log('Successfully generated 50 users and workspaces!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
