const express = require('express');
const authMiddleware = require('../middleware/auth');
const linksController = require('../controllers/links');

const router = express.Router();

router.post('/', authMiddleware, linksController.createOrUpdateLink);
router.get('/', authMiddleware, linksController.getLinks);
router.patch('/:id/status', authMiddleware, linksController.updateLinkStatus);

module.exports = router;
