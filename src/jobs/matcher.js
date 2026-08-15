const prisma = require('../lib/prisma');
const cron = require('node-cron');
const wsManager = require('../lib/ws');
const { sendNewMatchEmail } = require('../lib/email');
const { isBetaMode } = require('../lib/platformMode');

const runWeeklyMatching = async () => {
  console.log(`[${new Date().toISOString()}] Running automated connection matching algorithm...`);
  try {
    const now = new Date();
    const betaMode = await isBetaMode();
    // Fetch workspaces that belong ONLY to non-admin users. In paid mode,
    // the owner also needs active access (subscribed or still within their
    // free trial) - expired trial/subscription owners shouldn't receive new
    // connection requests. In beta mode there's no payment gating at all.
    const workspaces = await prisma.workspace.findMany({
      where: {
        verificationStatus: { not: 'FLAGGED' },
        teamMembers: {
          some: {
            role: 'OWNER',
            user: {
              role: { not: 'ADMIN' },
              ...(betaMode ? {} : {
                OR: [
                  { subscriptionStatus: 'ACTIVE' },
                  { subscriptionStatus: 'TRIALING', trialEndsAt: { gt: now } },
                ],
              }),
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
      
      const wsLang = ws.language || ws.teamMembers?.[0]?.user?.language || 'en';
      const neededGiving = Math.max(0, matchAmount - activeGivingCounts[ws.id]);

      if (neededGiving > 0) {
        // Only consider receivers who haven't hit their receiving quota yet and match language
        const potentialReceivers = workspaces.filter(w => {
          const wLang = w.language || w.teamMembers?.[0]?.user?.language || 'en';
          return !excludedReceivers.has(w.id) && activeReceivingCounts[w.id] < matchAmount && wLang === wsLang;
        });
        if (potentialReceivers.length === 0 && !poolExhaustedWarningSent) {
          wsManager.sendNotification(ws.id, {
            type: 'no_matches',
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
            direction: 'give',
            otherDomain: rec.domain,
          });

          wsManager.sendNotification(rec.id, {
            type: 'new_thread',
            threadId: thread.id,
            direction: 'receive',
            otherDomain: ws.domain,
          });
          
          const wsOwner = ws.teamMembers?.[0]?.user;
          const recOwner = rec.teamMembers?.[0]?.user;
          if (wsOwner && !emailedUsers.has(wsOwner.email)) {
            await sendNewMatchEmail(wsOwner.email, wsOwner.name, true, rec.domain, wsOwner.language || wsLang);
            emailedUsers.add(wsOwner.email);
          }
          if (recOwner && !emailedUsers.has(recOwner.email)) {
            const recLang = recOwner.language || rec.language || 'en';
            await sendNewMatchEmail(recOwner.email, recOwner.name, false, ws.domain, recLang);
            emailedUsers.add(recOwner.email);
          }
          
          createdCount++;
        }
      }

      const neededReceiving = Math.max(0, matchAmount - activeReceivingCounts[ws.id]);

      if (neededReceiving > 0) {
        // Only consider givers who haven't hit their giving quota yet and match language
        const potentialGivers = workspaces.filter(w => {
          const wLang = w.language || w.teamMembers?.[0]?.user?.language || 'en';
          return !excludedGivers.has(w.id) && activeGivingCounts[w.id] < matchAmount && wLang === wsLang;
        });
        if (potentialGivers.length === 0 && !poolExhaustedWarningSent) {
          wsManager.sendNotification(ws.id, {
            type: 'no_matches',
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
            direction: 'give',
            otherDomain: ws.domain,
          });

          wsManager.sendNotification(ws.id, {
            type: 'new_thread',
            threadId: thread.id,
            direction: 'receive',
            otherDomain: giv.domain,
          });
          
          const givOwner = giv.teamMembers?.[0]?.user;
          const wsOwnerRec = ws.teamMembers?.[0]?.user;
          if (givOwner && !emailedUsers.has(givOwner.email)) {
            const givLang = givOwner.language || giv.language || 'en';
            await sendNewMatchEmail(givOwner.email, givOwner.name, true, ws.domain, givLang);
            emailedUsers.add(givOwner.email);
          }
          if (wsOwnerRec && !emailedUsers.has(wsOwnerRec.email)) {
            await sendNewMatchEmail(wsOwnerRec.email, wsOwnerRec.name, false, giv.domain, wsOwnerRec.language || wsLang);
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

// Gives a brand-new workspace its first connection immediately on signup,
// instead of making them wait for the next scheduled matching run. Scoped to
// just this one workspace and creates at most one thread - subsequent
// connections (up to matchAmount) are still filled in by the regular
// runWeeklyMatching cron, which naturally accounts for the thread created
// here since it re-reads active thread counts from the DB each run.
const matchNewWorkspace = async (newWorkspaceId) => {
  console.log(`[${new Date().toISOString()}] Running immediate first-match for new workspace ${newWorkspaceId}...`);
  try {
    const now = new Date();
    const betaMode = await isBetaMode();

    const ws = await prisma.workspace.findUnique({
      where: { id: newWorkspaceId },
      include: { teamMembers: { where: { role: 'OWNER' }, include: { user: true } } }
    });
    if (!ws || ws.verificationStatus === 'FLAGGED') {
      return { success: false, message: 'Workspace not eligible.' };
    }

    const wsOwner = ws.teamMembers?.[0]?.user;
    if (!wsOwner || wsOwner.role === 'ADMIN') {
      return { success: false, message: 'Workspace owner not eligible.' };
    }
    if (!betaMode) {
      const eligible = wsOwner.subscriptionStatus === 'ACTIVE' ||
        (wsOwner.subscriptionStatus === 'TRIALING' && wsOwner.trialEndsAt && wsOwner.trialEndsAt > now);
      if (!eligible) return { success: false, message: 'Workspace owner not eligible for matching.' };
    }

    const wsLang = ws.language || wsOwner.language || 'en';

    // Same eligibility filter as runWeeklyMatching, minus the new workspace itself.
    const candidates = await prisma.workspace.findMany({
      where: {
        id: { not: ws.id },
        verificationStatus: { not: 'FLAGGED' },
        teamMembers: {
          some: {
            role: 'OWNER',
            user: {
              role: { not: 'ADMIN' },
              ...(betaMode ? {} : {
                OR: [
                  { subscriptionStatus: 'ACTIVE' },
                  { subscriptionStatus: 'TRIALING', trialEndsAt: { gt: now } },
                ],
              }),
            }
          }
        }
      },
      include: { teamMembers: { where: { role: 'OWNER' }, include: { user: true } } }
    });

    if (candidates.length === 0) {
      wsManager.sendNotification(ws.id, { type: 'no_matches' });
      return { success: false, message: 'No candidates available yet.' };
    }

    let matchAmount = 2;
    try {
      const settings = await prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
      if (settings && settings.matchAmount) matchAmount = settings.matchAmount;
    } catch (e) {}

    // A brand-new workspace shouldn't have any threads yet, but stay safe in
    // case this ever runs more than once for the same workspace.
    const existingThreads = await prisma.exchangeThread.findMany({
      where: { OR: [{ giverWorkspaceId: ws.id }, { receiverWorkspaceId: ws.id }] }
    });

    const allActiveThreads = await prisma.exchangeThread.findMany({
      where: { OR: [{ status: 'PENDING' }, { stage: 'NEW' }] }
    });
    const activeGivingCounts = {};
    const activeReceivingCounts = {};
    for (const t of allActiveThreads) {
      activeGivingCounts[t.giverWorkspaceId] = (activeGivingCounts[t.giverWorkspaceId] || 0) + 1;
      activeReceivingCounts[t.receiverWorkspaceId] = (activeReceivingCounts[t.receiverWorkspaceId] || 0) + 1;
    }

    const sameLangPool = candidates.filter(c => {
      const cLang = c.language || c.teamMembers?.[0]?.user?.language || 'en';
      return cLang === wsLang;
    });

    const excludedReceivers = new Set([ws.id]);
    const excludedGivers = new Set([ws.id]);
    for (const t of existingThreads) {
      if (t.giverWorkspaceId === ws.id) {
        excludedReceivers.add(t.receiverWorkspaceId);
        if (t.status !== 'REJECTED') excludedGivers.add(t.receiverWorkspaceId);
      } else {
        excludedGivers.add(t.giverWorkspaceId);
        if (t.status !== 'REJECTED') excludedReceivers.add(t.giverWorkspaceId);
      }
    }

    const emailedUsers = new Set();
    let createdCount = 0;
    let noMatchesNotified = false;
    const notifyNoMatches = () => {
      if (!noMatchesNotified) {
        wsManager.sendNotification(ws.id, { type: 'no_matches' });
        noMatchesNotified = true;
      }
    };

    // Fill giving and receiving one slot at a time, alternating, instead of
    // batch-filling one direction to completion before touching the other.
    // Batch-filling first would greedily claim every available candidate as
    // a receiver, then the reciprocal exclusion below leaves nothing left
    // for the receiving side to pick from - the new workspace would end up
    // with only "Backlink Out" threads whenever the candidate pool is small.
    // Interleaving guarantees both directions get a turn each round as long
    // as the pool has any spare capacity on each side.
    for (let round = 0; round < matchAmount; round++) {
      if ((activeGivingCounts[ws.id] || 0) < matchAmount) {
        const potentialReceivers = sameLangPool.filter(c =>
          !excludedReceivers.has(c.id) && (activeReceivingCounts[c.id] || 0) < matchAmount
        );
        if (potentialReceivers.length === 0) {
          notifyNoMatches();
        } else {
          const rec = potentialReceivers.sort((a, b) => {
            const diff = (activeReceivingCounts[a.id] || 0) - (activeReceivingCounts[b.id] || 0);
            return diff === 0 ? 0.5 - Math.random() : diff;
          })[0];

          const thread = await prisma.exchangeThread.create({
            data: { giverWorkspaceId: ws.id, receiverWorkspaceId: rec.id, stage: 'NEW', status: 'PENDING' }
          });
          excludedReceivers.add(rec.id);
          excludedGivers.add(rec.id);
          activeGivingCounts[ws.id] = (activeGivingCounts[ws.id] || 0) + 1;
          activeReceivingCounts[rec.id] = (activeReceivingCounts[rec.id] || 0) + 1;

          wsManager.sendNotification(ws.id, { type: 'new_thread', threadId: thread.id, direction: 'give', otherDomain: rec.domain });
          wsManager.sendNotification(rec.id, { type: 'new_thread', threadId: thread.id, direction: 'receive', otherDomain: ws.domain });

          const recOwner = rec.teamMembers?.[0]?.user;
          if (wsOwner && !emailedUsers.has(wsOwner.email)) {
            await sendNewMatchEmail(wsOwner.email, wsOwner.name, true, rec.domain, wsOwner.language || wsLang);
            emailedUsers.add(wsOwner.email);
          }
          if (recOwner && !emailedUsers.has(recOwner.email)) {
            await sendNewMatchEmail(recOwner.email, recOwner.name, false, ws.domain, recOwner.language || rec.language || 'en');
            emailedUsers.add(recOwner.email);
          }
          createdCount++;
        }
      }

      if ((activeReceivingCounts[ws.id] || 0) < matchAmount) {
        const potentialGivers = sameLangPool.filter(c =>
          !excludedGivers.has(c.id) && (activeGivingCounts[c.id] || 0) < matchAmount
        );
        if (potentialGivers.length === 0) {
          notifyNoMatches();
        } else {
          const giv = potentialGivers.sort((a, b) => {
            const diff = (activeGivingCounts[a.id] || 0) - (activeGivingCounts[b.id] || 0);
            return diff === 0 ? 0.5 - Math.random() : diff;
          })[0];

          const thread = await prisma.exchangeThread.create({
            data: { giverWorkspaceId: giv.id, receiverWorkspaceId: ws.id, stage: 'NEW', status: 'PENDING' }
          });
          excludedGivers.add(giv.id);
          excludedReceivers.add(giv.id);
          activeReceivingCounts[ws.id] = (activeReceivingCounts[ws.id] || 0) + 1;
          activeGivingCounts[giv.id] = (activeGivingCounts[giv.id] || 0) + 1;

          wsManager.sendNotification(giv.id, { type: 'new_thread', threadId: thread.id, direction: 'give', otherDomain: ws.domain });
          wsManager.sendNotification(ws.id, { type: 'new_thread', threadId: thread.id, direction: 'receive', otherDomain: giv.domain });

          const givOwner = giv.teamMembers?.[0]?.user;
          if (givOwner && !emailedUsers.has(givOwner.email)) {
            await sendNewMatchEmail(givOwner.email, givOwner.name, true, ws.domain, givOwner.language || giv.language || 'en');
            emailedUsers.add(givOwner.email);
          }
          if (wsOwner && !emailedUsers.has(wsOwner.email)) {
            await sendNewMatchEmail(wsOwner.email, wsOwner.name, false, giv.domain, wsOwner.language || wsLang);
            emailedUsers.add(wsOwner.email);
          }
          createdCount++;
        }
      }

      if ((activeGivingCounts[ws.id] || 0) >= matchAmount && (activeReceivingCounts[ws.id] || 0) >= matchAmount) break;
    }

    console.log(`[${new Date().toISOString()}] Immediate first-match created ${createdCount} connection(s) for workspace ${newWorkspaceId}.`);
    return { success: createdCount > 0, count: createdCount };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in immediate first-match:`, error);
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

module.exports = { runWeeklyMatching, matchNewWorkspace, initCron };
