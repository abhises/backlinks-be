const express = require('express');
const authMiddleware = require('../middleware/auth');
const billingController = require('../controllers/billing');

const router = express.Router();

router.get('/status', authMiddleware, billingController.getStatus);
router.post('/create-checkout-session', authMiddleware, billingController.createCheckoutSession);
router.post('/create-portal-session', authMiddleware, billingController.createPortalSession);

module.exports = router;
