const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireActiveAccess = require('../middleware/requireActiveAccess');
const threadsController = require('../controllers/threads');
const validate = require('../middleware/validate');
const { createThreadValidator, updateThreadStatusValidator } = require('../validators/threadValidator');

const router = express.Router();

router.post('/', authMiddleware, requireActiveAccess, createThreadValidator, validate, threadsController.createThread);
router.get('/', authMiddleware, threadsController.getThreads);
router.get('/:id', authMiddleware, threadsController.getThreadById);
router.patch('/:id/status', authMiddleware, updateThreadStatusValidator, validate, threadsController.updateThreadStatus);

module.exports = router;
