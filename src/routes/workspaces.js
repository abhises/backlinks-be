const express = require('express');
const authMiddleware = require('../middleware/auth');
const workspacesController = require('../controllers/workspaces');
const validate = require('../middleware/validate');
const { createWorkspaceValidator, updateWorkspaceValidator } = require('../validators/workspaceValidator');

const router = express.Router();

router.post('/', authMiddleware, createWorkspaceValidator, validate, workspacesController.createWorkspace);
router.get('/mine', authMiddleware, workspacesController.getMyWorkspace);
router.get('/', authMiddleware, workspacesController.getAllWorkspaces);
router.patch('/mine', authMiddleware, updateWorkspaceValidator, validate, workspacesController.updateMyWorkspace);
router.post('/verify', authMiddleware, workspacesController.verifyMyWorkspace);

module.exports = router;
