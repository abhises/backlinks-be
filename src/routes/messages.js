const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireActiveAccess = require('../middleware/requireActiveAccess');
const messagesController = require('../controllers/messages');
const validate = require('../middleware/validate');
const { sendMessageValidator } = require('../validators/messageValidator');

const router = express.Router();

router.post('/', authMiddleware, requireActiveAccess, sendMessageValidator, validate, messagesController.sendMessage);
router.get('/:threadId', authMiddleware, messagesController.getMessages);

module.exports = router;
