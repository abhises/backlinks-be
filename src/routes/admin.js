const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminController = require('../controllers/admin');

const router = express.Router();

// Middleware to check if user is admin
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied: Admins only' });
  }
  next();
};

// GET /api/admin/stats
router.get('/stats', authMiddleware, adminMiddleware, adminController.getStats);

// POST /api/admin/notifications
router.post('/notifications', authMiddleware, adminMiddleware, adminController.sendNotification);

// GET /api/admin/notifications
router.get('/notifications', authMiddleware, adminMiddleware, adminController.getNotifications);

module.exports = router;
