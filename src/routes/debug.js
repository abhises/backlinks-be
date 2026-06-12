const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

router.get('/notifications', async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({ take: 30, orderBy: { createdAt: 'desc' } });
    res.json(notifications);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
module.exports = router;
