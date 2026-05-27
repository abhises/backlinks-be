const prisma = require('./src/lib/prisma');
const bcrypt = require('bcryptjs');

const NICHES = ['Tech', 'Health', 'Finance', 'Travel', 'Lifestyle', 'Business', 'Education'];

const generateRandomUsersAndWorkspaces = async () => {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('Password123!', salt);
  let count = 0;

  console.log('Inserting 20 fully onboarded users...');

  for (let i = 0; i < 20; i++) {
    const randomSuffix = Math.floor(Math.random() * 1000000);
    const firstName = `User${randomSuffix}`;
    const lastName = `Test`;
    const name = `${firstName} ${lastName}`;
    const email = `user${randomSuffix}@example.com`;
    
    const domain = `site${randomSuffix}.com`;
    const websiteName = `Awesome Site ${randomSuffix}`;
    const description = `This is a randomly generated description for ${domain}. We provide great content about our niche.`;
    const niche = NICHES[Math.floor(Math.random() * NICHES.length)];

    try {
      await prisma.user.create({
        data: {
          name,
          email,
          hashedPassword,
          role: 'CLIENT',
          teamMemberships: {
            create: {
              role: 'OWNER',
              workspace: {
                create: {
                  domain,
                  websiteName,
                  description,
                  niche,
                  country: 'USA',
                  language: 'English',
                  monthlyTraffic: Math.floor(Math.random() * 50000) + 1000,
                }
              }
            }
          }
        }
      });
      count++;
    } catch (err) {
      console.error(`Error creating user ${email}:`, err.message);
    }
  }

  console.log(`Successfully inserted ${count} fully onboarded users with workspaces!`);
  console.log('Sample user email:', `user*@example.com`);
  console.log('All users have the password: Password123!');
  
  await prisma.$disconnect();
};

generateRandomUsersAndWorkspaces();
