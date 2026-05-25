const prisma = require('../lib/prisma');
const cron = require('node-cron');
const wsManager = require('../lib/ws');

const runWeeklyMatching = async () => {
  console.log('Running automated connection matching algorithm...');
  try {
    // Fetch workspaces that belong ONLY to non-admin users
    // A workspace has teamMembers, we check if they are owned by an ADMIN
    const workspaces = await prisma.workspace.findMany({
      where: {
        teamMembers: {
          some: {
            user: {
              role: { not: 'ADMIN' }
            }
          }
        }
      }
    });
    if (workspaces.length < 2) {
      console.log('Not enough workspaces for matching.');
      return { success: false, message: 'Not enough workspaces to perform matching.' };
    }

    let createdCount = 0;
    
    // Fetch matchAmount from DB or default to 2
    let matchAmount = 2;
    try {
      const settings = await prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
      if (settings && settings.matchAmount) matchAmount = settings.matchAmount;
    } catch(e) {}

    for (const ws of workspaces) {
      // Find all existing interactions (both giving and receiving) to prevent ANY duplicate or reciprocal matching
      const allInteractions = await prisma.exchangeThread.findMany({
        where: {
          OR: [
            { giverWorkspaceId: ws.id },
            { receiverWorkspaceId: ws.id }
          ]
        }
      });
      
      const interactedIds = allInteractions.map(t => 
        t.giverWorkspaceId === ws.id ? t.receiverWorkspaceId : t.giverWorkspaceId
      );
      
      // Exclude self and anyone already interacted with
      const excludes = [...new Set([...interactedIds, ws.id])];
      
      // Count current active (NEW/PENDING) giving threads to avoid spamming
      const activeGivingCount = allInteractions.filter(t => 
        t.giverWorkspaceId === ws.id && (t.status === 'PENDING' || t.stage === 'NEW')
      ).length;
      
      const neededGiving = Math.max(0, matchAmount - activeGivingCount);

      if (neededGiving > 0) {
        const potentialReceivers = workspaces.filter(w => !excludes.includes(w.id));
        const receivers = potentialReceivers.sort(() => 0.5 - Math.random()).slice(0, neededGiving);
        
        for (const rec of receivers) {
          const thread = await prisma.exchangeThread.create({
            data: {
              giverWorkspaceId: ws.id,
              receiverWorkspaceId: rec.id,
              stage: 'NEW',
              status: 'PENDING'
            },
            include: { giverWorkspace: true, receiverWorkspace: true }
          });

          // Add to excludes so we don't pick them again in the receiving loop
          excludes.push(rec.id);

          wsManager.sendNotification(ws.id, {
            type: 'new_thread',
            threadId: thread.id,
            title: 'New Connection Match!',
            body: `You have been matched to give a backlink to ${rec.domain}. Check your inbox!`
          });

          wsManager.sendNotification(rec.id, {
            type: 'new_thread',
            threadId: thread.id,
            title: 'New Connection Match!',
            body: `You have been matched to receive a backlink from ${ws.domain}. Check your inbox!`
          });
          
          createdCount++;
        }
      }

      // Count current active (NEW/PENDING) receiving threads to avoid spamming
      const activeReceivingCount = allInteractions.filter(t => 
        t.receiverWorkspaceId === ws.id && (t.status === 'PENDING' || t.stage === 'NEW')
      ).length;
      
      const neededReceiving = Math.max(0, matchAmount - activeReceivingCount);

      if (neededReceiving > 0) {
        const potentialGivers = workspaces.filter(w => !excludes.includes(w.id));
        const givers = potentialGivers.sort(() => 0.5 - Math.random()).slice(0, neededReceiving);
        
        for (const giv of givers) {
          const thread = await prisma.exchangeThread.create({
            data: {
              giverWorkspaceId: giv.id,
              receiverWorkspaceId: ws.id,
              stage: 'NEW',
              status: 'PENDING'
            },
            include: { giverWorkspace: true, receiverWorkspace: true }
          });
          
          // Add to excludes
          excludes.push(giv.id);
          
          wsManager.sendNotification(giv.id, {
            type: 'new_thread',
            threadId: thread.id,
            title: 'New Connection Match!',
            body: `You have been matched to give a backlink to ${ws.domain}. Check your inbox!`
          });

          wsManager.sendNotification(ws.id, {
            type: 'new_thread',
            threadId: thread.id,
            title: 'New Connection Match!',
            body: `You have been matched to receive a backlink from ${giv.domain}. Check your inbox!`
          });
          
          createdCount++;
        }
      }
    }
    
    console.log(`Matching completed successfully. Created ${createdCount} new connections.`);
    return { success: true, count: createdCount };
  } catch (error) {
    console.error('Error in matching algorithm:', error);
    return { success: false, error: error.message };
  }
};

let activeJob = null;

const initCron = async () => {
  try {
    if (activeJob) {
      activeJob.stop();
    }
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
    const expr = settings ? settings.cronExpression : '0 0 * * 1';
    
    activeJob = cron.schedule(expr, () => {
      runWeeklyMatching();
    });
    console.log(`Initialized matchmaking cron job with expression: ${expr}`);
  } catch (err) {
    console.error('Failed to init cron:', err);
  }
};

// Start default on load, wait for initCron to override
activeJob = cron.schedule('0 0 * * 1', () => {
  runWeeklyMatching();
});
initCron();

module.exports = { runWeeklyMatching, initCron };
