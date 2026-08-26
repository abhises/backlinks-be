const prisma = require('../lib/prisma');
const stripe = require('../lib/stripe');
const { sendAdminBroadcastEmail } = require('../lib/email');

const getSubscriptions = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { not: 'ADMIN' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        teamMemberships: {
          select: { workspace: { select: { domain: true, websiteName: true } } },
        },
      },
    });

    const subscriptions = await Promise.all(users.map(async (u) => {
      let lastPayment = null;
      if (u.stripeCustomerId) {
        try {
          const invoices = await stripe.invoices.list({ customer: u.stripeCustomerId, limit: 1 });
          const inv = invoices.data[0];
          if (inv) {
            lastPayment = {
              amount: inv.amount_paid / 100,
              currency: inv.currency,
              status: inv.status,
              date: inv.status_transitions?.paid_at
                ? new Date(inv.status_transitions.paid_at * 1000)
                : new Date(inv.created * 1000),
              hostedInvoiceUrl: inv.hosted_invoice_url,
            };
          }
        } catch (err) {
          console.error(`Failed to fetch Stripe invoice for user ${u.id}:`, err.message);
        }
      }
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.createdAt,
        subscriptionStatus: u.subscriptionStatus,
        trialEndsAt: u.trialEndsAt,
        stripeCustomerId: u.stripeCustomerId,
        stripeSubscriptionId: u.stripeSubscriptionId,
        workspace: u.teamMemberships[0]?.workspace || null,
        lastPayment,
      };
    }));

    const stripeMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test';

    res.json({ subscriptions, stripeMode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

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

    // Email every client too, not just whoever's online for the WS broadcast.
    // Fire-and-forget so one slow/failed send can't hold up the admin's response.
    prisma.user.findMany({
      where: { role: { not: 'ADMIN' } },
      select: { email: true, name: true, language: true },
    }).then((users) => Promise.allSettled(
      users.map((u) => sendAdminBroadcastEmail(u.email, u.name, title, description, u.language))
    )).catch((err) => console.error('Non-fatal: Error sending admin broadcast emails:', err.message || err));

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
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        language: true,
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
  const { name, email, role, language } = req.body;
  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, email, role, language: language || undefined },
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

    // Cancel any active Stripe subscription first, so deleting the user
    // doesn't leave them being billed with no account left to show for it.
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeSubscriptionId: true },
    });
    if (target?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(target.stripeSubscriptionId);
      } catch (err) {
        console.error(`Failed to cancel Stripe subscription for deleted user ${userId}:`, err.message);
      }
    }

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
  const { cronExpression, matchAmount, rejectLimit, answerTimeoutDays, placementTimeoutDays, platformMode } = req.body;
  try {
    const settings = await prisma.systemSettings.upsert({
      where: { id: 'singleton' },
      update: { cronExpression, matchAmount, rejectLimit, answerTimeoutDays, placementTimeoutDays, platformMode },
      create: { id: 'singleton', cronExpression, matchAmount, rejectLimit, answerTimeoutDays, placementTimeoutDays, platformMode },
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

const getTickets = async (req, res) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, email: true } } },
    });
    res.json({ tickets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const resolveTicket = async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: { status: 'RESOLVED' },
    });
    res.json({ ticket });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Ticket not found' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAllFeedback = async (req, res) => {
  try {
    const feedback = await prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, email: true } } },
    });
    res.json({ feedback });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getSubscriptions,
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
  getTickets,
  resolveTicket,
  getAllFeedback,
};
