const express = require('express');
const authMiddleware = require('../middleware/auth');
const messagesController = require('../controllers/messages');

const router = express.Router();

router.post('/', authMiddleware, messagesController.sendMessage);
router.get('/:threadId', authMiddleware, messagesController.getMessages);

module.exports = router;
