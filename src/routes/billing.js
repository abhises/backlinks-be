const express = require('express');
const authMiddleware = require('../middleware/auth');
const { billingLimiter } = require('../middleware/rateLimiter');
const billingController = require('../controllers/billing');

const router = express.Router();

router.get('/status', authMiddleware, billingLimiter, billingController.getStatus);
router.get('/invoices', authMiddleware, billingLimiter, billingController.getInvoices);
router.post('/create-checkout-session', authMiddleware, billingLimiter, billingController.createCheckoutSession);
router.post('/create-portal-session', authMiddleware, billingLimiter, billingController.createPortalSession);

module.exports = router;
