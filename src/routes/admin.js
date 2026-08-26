const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminController = require('../controllers/admin');
const validate = require('../middleware/validate');
const {
  sendNotificationValidator,
  updateUserValidator,
  updateBacklinkValidator,
  updateSettingsValidator
} = require('../validators/adminValidator');

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

// GET /api/admin/subscriptions
router.get('/subscriptions', authMiddleware, adminMiddleware, adminController.getSubscriptions);

// POST /api/admin/notifications
router.post('/notifications', authMiddleware, adminMiddleware, sendNotificationValidator, validate, adminController.sendNotification);

// GET /api/admin/notifications
router.get('/notifications', authMiddleware, adminMiddleware, adminController.getNotifications);

// GET /api/admin/users
router.get('/users', authMiddleware, adminMiddleware, adminController.getUsers);
router.put('/users/:id', authMiddleware, adminMiddleware, updateUserValidator, validate, adminController.updateUser);
router.delete('/users/:id', authMiddleware, adminMiddleware, adminController.deleteUser);

// GET /api/admin/backlinks
router.get('/backlinks', authMiddleware, adminMiddleware, adminController.getBacklinks);
router.put('/backlinks/:id', authMiddleware, adminMiddleware, updateBacklinkValidator, validate, adminController.updateBacklink);
router.delete('/backlinks/:id', authMiddleware, adminMiddleware, adminController.deleteBacklink);

// POST /api/admin/trigger-matching
router.post('/trigger-matching', authMiddleware, adminMiddleware, adminController.triggerMatching);

// GET /api/admin/settings
router.get('/settings', authMiddleware, adminMiddleware, adminController.getSettings);

// PUT /api/admin/settings
router.put('/settings', authMiddleware, adminMiddleware, updateSettingsValidator, validate, adminController.updateSettings);

// GET /api/admin/tickets
router.get('/tickets', authMiddleware, adminMiddleware, adminController.getTickets);

// PUT /api/admin/tickets/:id/resolve
router.put('/tickets/:id/resolve', authMiddleware, adminMiddleware, adminController.resolveTicket);

// GET /api/admin/feedback
router.get('/feedback', authMiddleware, adminMiddleware, adminController.getAllFeedback);

module.exports = router;
