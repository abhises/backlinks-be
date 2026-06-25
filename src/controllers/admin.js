const prisma = require('../lib/prisma');

const getStats = async (req, res) => {
  try {
    const usersCount = await prisma.user.count({ where: { role: { not: 'ADMIN' } } });
    const sitesCount = await prisma.workspace.count();
    const linksCount = await prisma.linkPlacement.count();

    res.json({
      users: usersCount,
      sites: sitesCount,
      links: linksCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }

};

const sendNotification = async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }

  try {
    const notification = await prisma.adminNotification.create({
      data: { title, description },
    });

    const wsManager = require('../lib/ws');
    await wsManager.broadcastGlobalNotification({
      type: 'admin_broadcast',
      id: notification.id,
      title,
      body: description,
      messageText: description, // for compatibility
      senderWorkspaceDomain: 'System Admin',
    });

    res.json({ success: true, message: 'Notification broadcasted successfully', notification });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getNotifications = async (req, res) => {
  try {
    const notifications = await prisma.adminNotification.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ notifications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { not: 'ADMIN' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        teamMemberships: {
          include: { workspace: true }
        }
      }
    });

    const usersWithCounts = await Promise.all(users.map(async (u) => {
      let rejectedIn = 0;
      let rejectedOut = 0;

      if (u.teamMemberships && u.teamMemberships.length > 0) {
        const wsId = u.teamMemberships[0].workspaceId;
        const rejectedThreads = await prisma.exchangeThread.findMany({
          where: { rejectedByWorkspaceId: wsId, status: 'REJECTED' }
        });
        for (const t of rejectedThreads) {
          if (t.receiverWorkspaceId === wsId) rejectedIn++;
          if (t.giverWorkspaceId === wsId) rejectedOut++;
        }
      }

      return {
        ...u,
        rejectedIn,
        rejectedOut
      };
    }));

    res.json({ users: usersWithCounts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getBacklinks = async (req, res) => {
  try {
    const backlinks = await prisma.linkPlacement.findMany({
      orderBy: { datePlaced: 'desc' },
      include: {
        giverWorkspace: true,
        receiverWorkspace: true,
      }
    });
    res.json({ backlinks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateUser = async (req, res) => {
  const { name, email, role } = req.body;
  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, email, role },
    });
    res.json({ user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    // Find the user's workspaces
    const teamMemberships = await prisma.teamMember.findMany({
      where: { userId },
      select: { workspaceId: true }
    });

    const workspaceIds = teamMemberships.map(tm => tm.workspaceId);

    // 1. Delete all messages sent by this user
    await prisma.chatMessage.deleteMany({
      where: { senderUserId: userId }
    });

    if (workspaceIds.length > 0) {
      // 2. Delete all link placements associated with these workspaces
      await prisma.linkPlacement.deleteMany({
        where: {
          OR: [
            { giverWorkspaceId: { in: workspaceIds } },
            { receiverWorkspaceId: { in: workspaceIds } }
          ]
        }
      });

      // 3. Delete all exchange threads associated with these workspaces
      await prisma.exchangeThread.deleteMany({
        where: {
          OR: [
            { giverWorkspaceId: { in: workspaceIds } },
            { receiverWorkspaceId: { in: workspaceIds } }
          ]
        }
      });

      // 4. Finally delete the workspaces themselves
      await prisma.workspace.deleteMany({
        where: { id: { in: workspaceIds } }
      });
    }

    // 5. Delete the user
    await prisma.user.delete({ where: { id: userId } });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateBacklink = async (req, res) => {
  const { sourceUrl, targetUrl, anchorText, linkType, status } = req.body;
  try {
    const updated = await prisma.linkPlacement.update({
      where: { id: req.params.id },
      data: { sourceUrl, targetUrl, anchorText, linkType, status },
    });
    res.json({ backlink: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteBacklink = async (req, res) => {
  try {
    await prisma.linkPlacement.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const triggerMatching = async (req, res) => {
  try {
    const { runWeeklyMatching } = require('../jobs/matcher');
    const result = await runWeeklyMatching();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getSettings = async (req, res) => {
  try {
    let settings = await prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      settings = await prisma.systemSettings.create({ data: { id: 'singleton' } });
    }
    res.json({ settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateSettings = async (req, res) => {
  const { cronExpression, matchAmount, rejectLimit, answerTimeoutDays, placementTimeoutDays } = req.body;
  try {
    const settings = await prisma.systemSettings.upsert({
      where: { id: 'singleton' },
      update: { cronExpression, matchAmount, rejectLimit, answerTimeoutDays, placementTimeoutDays },
      create: { id: 'singleton', cronExpression, matchAmount, rejectLimit, answerTimeoutDays, placementTimeoutDays },
    });

    // Also re-initialize the cron job with the new expression
    const { initCron } = require('../jobs/matcher');
    initCron();

    res.json({ success: true, settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getStats,
  sendNotification,
  getNotifications,
  getUsers,
  getBacklinks,
  updateUser,
  deleteUser,
  updateBacklink,
  deleteBacklink,
  triggerMatching,
  getSettings,
  updateSettings,
};
