const express = require('express');
const authMiddleware = require('../middleware/auth');
const threadsController = require('../controllers/threads');

const router = express.Router();

router.post('/', authMiddleware, threadsController.createThread);
router.get('/', authMiddleware, threadsController.getThreads);
router.get('/:id', authMiddleware, threadsController.getThreadById);
router.patch('/:id/status', authMiddleware, threadsController.updateThreadStatus);

module.exports = router;
