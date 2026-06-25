const prisma = require('../lib/prisma');
const cron = require('node-cron');
const wsManager = require('../lib/ws');
const { sendNewMatchEmail } = require('../lib/email');

const runWeeklyMatching = async () => {
  console.log(`[${new Date().toISOString()}] Running automated connection matching algorithm...`);
  try {
    // Fetch workspaces that belong ONLY to non-admin users
    const workspaces = await prisma.workspace.findMany({
      where: {
        teamMembers: {
          some: {
            user: {
              role: { not: 'ADMIN' }
            }
          }
        }
      },
      include: {
        teamMembers: {
          where: { role: 'OWNER' },
          include: { user: true }
        }
      }
    });
    if (workspaces.length < 2) {
      console.log(`[${new Date().toISOString()}] Not enough workspaces for matching.`);
      return { success: false, message: 'Not enough workspaces to perform matching.' };
    }

    let createdCount = 0;
    const emailedUsers = new Set();
    
    // Fetch matchAmount from DB or default to 2
    let matchAmount = 2;
    try {
      const settings = await prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
      if (settings && settings.matchAmount) matchAmount = settings.matchAmount;
    } catch(e) {}

    // Pre-calculate active giving and receiving counts for all workspaces for fairness weighting
    const allActiveThreads = await prisma.exchangeThread.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          { stage: 'NEW' }
        ]
      }
    });

    const activeGivingCounts = {};
    const activeReceivingCounts = {};
    for (const ws of workspaces) {
      activeGivingCounts[ws.id] = 0;
      activeReceivingCounts[ws.id] = 0;
    }
    for (const t of allActiveThreads) {
      if (activeGivingCounts[t.giverWorkspaceId] !== undefined) {
        activeGivingCounts[t.giverWorkspaceId]++;
      }
      if (activeReceivingCounts[t.receiverWorkspaceId] !== undefined) {
        activeReceivingCounts[t.receiverWorkspaceId]++;
      }
    }

    for (const ws of workspaces) {
      // Find all existing interactions for this workspace
      const allInteractions = await prisma.exchangeThread.findMany({
        where: {
          OR: [
            { giverWorkspaceId: ws.id },
            { receiverWorkspaceId: ws.id }
          ]
        }
      });
      
      const excludedReceivers = new Set([ws.id]);
      const excludedGivers = new Set([ws.id]);

      for (const t of allInteractions) {
        if (t.giverWorkspaceId === ws.id) {
          // ws already gave to them, don't try again
          excludedReceivers.add(t.receiverWorkspaceId);
          // Block reverse direction (reciprocal) only if it wasn't rejected
          if (t.status !== 'REJECTED') excludedGivers.add(t.receiverWorkspaceId);
        } else {
          // someone already gave to ws, they can't give to ws again
          excludedGivers.add(t.giverWorkspaceId);
          // Block reverse direction (reciprocal) only if it wasn't rejected
          if (t.status !== 'REJECTED') excludedReceivers.add(t.giverWorkspaceId);
        }
      }
      
      let poolExhaustedWarningSent = false;
      
      const neededGiving = Math.max(0, matchAmount - activeGivingCounts[ws.id]);

      if (neededGiving > 0) {
        // Only consider receivers who haven't hit their receiving quota yet
        const potentialReceivers = workspaces.filter(w => 
          !excludedReceivers.has(w.id) && activeReceivingCounts[w.id] < matchAmount
        );
        if (potentialReceivers.length === 0 && !poolExhaustedWarningSent) {
          wsManager.sendNotification(ws.id, {
            type: 'system',
            title: 'No New Matches Found',
            body: "We couldn't find a new match for you this cycle. You'll be automatically matched as new websites join the network."
          });
          poolExhaustedWarningSent = true;
        }

        const receivers = potentialReceivers
          .sort((a, b) => {
            const diff = activeReceivingCounts[a.id] - activeReceivingCounts[b.id];
            if (diff === 0) return 0.5 - Math.random(); // tie-breaker
            return diff; // prefer receivers with lowest activeReceivingCounts
          })
          .slice(0, neededGiving);
        
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

          // Block them in both directions for the rest of this execution since it's active now
          excludedReceivers.add(rec.id);
          excludedGivers.add(rec.id);
          
          activeGivingCounts[ws.id]++;
          activeReceivingCounts[rec.id]++;

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
          
          const wsOwner = ws.teamMembers?.[0]?.user;
          const recOwner = rec.teamMembers?.[0]?.user;
          if (wsOwner && !emailedUsers.has(wsOwner.email)) {
            await sendNewMatchEmail(wsOwner.email, wsOwner.name, true, rec.domain);
            emailedUsers.add(wsOwner.email);
          }
          if (recOwner && !emailedUsers.has(recOwner.email)) {
            await sendNewMatchEmail(recOwner.email, recOwner.name, false, ws.domain);
            emailedUsers.add(recOwner.email);
          }
          
          createdCount++;
        }
      }

      const neededReceiving = Math.max(0, matchAmount - activeReceivingCounts[ws.id]);

      if (neededReceiving > 0) {
        // Only consider givers who haven't hit their giving quota yet
        const potentialGivers = workspaces.filter(w => 
          !excludedGivers.has(w.id) && activeGivingCounts[w.id] < matchAmount
        );
        if (potentialGivers.length === 0 && !poolExhaustedWarningSent) {
          wsManager.sendNotification(ws.id, {
            type: 'system',
            title: 'No New Matches Found',
            body: "We couldn't find a new match for you this cycle. You'll be automatically matched as new websites join the network."
          });
          poolExhaustedWarningSent = true;
        }

        const givers = potentialGivers
          .sort((a, b) => {
            const diff = activeGivingCounts[a.id] - activeGivingCounts[b.id];
            if (diff === 0) return 0.5 - Math.random(); // tie-breaker
            return diff; // prefer givers with lowest activeGivingCounts
          })
          .slice(0, neededReceiving);
        
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
          
          // Block them in both directions
          excludedGivers.add(giv.id);
          excludedReceivers.add(giv.id);
          
          activeReceivingCounts[ws.id]++;
          activeGivingCounts[giv.id]++;
          
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
          
          const givOwner = giv.teamMembers?.[0]?.user;
          const wsOwnerRec = ws.teamMembers?.[0]?.user;
          if (givOwner && !emailedUsers.has(givOwner.email)) {
            await sendNewMatchEmail(givOwner.email, givOwner.name, true, ws.domain);
            emailedUsers.add(givOwner.email);
          }
          if (wsOwnerRec && !emailedUsers.has(wsOwnerRec.email)) {
            await sendNewMatchEmail(wsOwnerRec.email, wsOwnerRec.name, false, giv.domain);
            emailedUsers.add(wsOwnerRec.email);
          }
          
          createdCount++;
        }
      }
    }
    
    console.log(`[${new Date().toISOString()}] Matching completed successfully. Created ${createdCount} new connections.`);
    return { success: true, count: createdCount };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in matching algorithm:`, error);
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
    console.log(`[${new Date().toISOString()}] Initialized matchmaking cron job with expression: ${expr}`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to init cron:`, err);
  }
};

// Start default on load, wait for initCron to override
activeJob = cron.schedule('0 0 * * 1', () => {
  runWeeklyMatching();
});
initCron();

module.exports = { runWeeklyMatching, initCron };
