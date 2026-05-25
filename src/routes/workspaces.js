const express = require('express');
const authMiddleware = require('../middleware/auth');
const workspacesController = require('../controllers/workspaces');

const router = express.Router();

router.post('/', authMiddleware, workspacesController.createWorkspace);
router.get('/mine', authMiddleware, workspacesController.getMyWorkspace);
router.get('/', authMiddleware, workspacesController.getAllWorkspaces);
router.patch('/mine', authMiddleware, workspacesController.updateMyWorkspace);

module.exports = router;
