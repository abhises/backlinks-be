const express = require('express');
const authMiddleware = require('../middleware/auth');
const prisma = require('../lib/prisma');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const member = await prisma.teamMember.findFirst({
      where: { userId: req.user.userId },
    });
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    const notifications = await prisma.notification.findMany({
      where: { workspaceId: member.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ notifications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/mark-read', authMiddleware, async (req, res) => {
  try {
    const member = await prisma.teamMember.findFirst({
      where: { userId: req.user.userId },
    });
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    await prisma.notification.updateMany({
      where: { workspaceId: member.workspaceId, read: false },
      data: { read: true }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
