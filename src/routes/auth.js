const express = require('express');
const authMiddleware = require('../middleware/auth');
const authController = require('../controllers/auth');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.google);
router.get('/me', authMiddleware, authController.getMe);

module.exports = router;
