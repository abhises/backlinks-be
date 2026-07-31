const express = require('express');
const authMiddleware = require('../middleware/auth');
const authController = require('../controllers/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const {
  registerValidator,
  loginValidator,
  googleValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  updateLanguageValidator
} = require('../validators/authValidator');

const router = express.Router();

router.post('/register', authLimiter, registerValidator, validate, authController.register);
router.post('/login', authLimiter, loginValidator, validate, authController.login);
router.post('/google', googleValidator, validate, authController.google);
router.post('/forgot-password', authLimiter, forgotPasswordValidator, validate, authController.forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidator, validate, authController.resetPassword);
router.post('/logout', authController.logout);
router.get('/me', authMiddleware, authController.getMe);
router.patch('/language', authMiddleware, updateLanguageValidator, validate, authController.updateLanguage);

module.exports = router;
