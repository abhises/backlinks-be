const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireActiveAccess = require('../middleware/requireActiveAccess');
const linksController = require('../controllers/links');
const validate = require('../middleware/validate');
const { createLinkValidator, updateLinkStatusValidator } = require('../validators/linkValidator');

const router = express.Router();

router.post('/', authMiddleware, requireActiveAccess, createLinkValidator, validate, linksController.createOrUpdateLink);
router.get('/', authMiddleware, linksController.getLinks);
router.patch('/:id/status', authMiddleware, updateLinkStatusValidator, validate, linksController.updateLinkStatus);

module.exports = router;
