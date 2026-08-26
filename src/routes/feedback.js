const express = require('express');
const authMiddleware = require('../middleware/auth');
const feedbackController = require('../controllers/feedback');

const router = express.Router();

router.post('/', authMiddleware, feedbackController.submitFeedback);
router.get('/', authMiddleware, feedbackController.getFeedbackHistory);

module.exports = router;
