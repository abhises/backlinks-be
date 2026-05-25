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

module.exports = {
  getStats,
  sendNotification,
  getNotifications,
};
