const prisma = require('../lib/prisma');

const getStats = async (req, res) => {
  try {
    const usersCount = await prisma.user.count();
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
    wsManager.broadcastGlobalNotification({
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
    res.json({ users });
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
    await prisma.user.delete({ where: { id: req.params.id } });
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
};
