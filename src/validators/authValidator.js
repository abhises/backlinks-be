const { body } = require('express-validator');

const registerValidator = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').optional().isString().trim().escape()
];

const loginValidator = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  body('language').optional().isString().trim()
];

const googleValidator = [
  body('credential').notEmpty().withMessage('Google credential is required'),
  body('language').optional().isString().trim()
];

const forgotPasswordValidator = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail()
];

const resetPasswordValidator = [
  body('token').notEmpty().withMessage('Token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const updateLanguageValidator = [
  body('language').isIn(['en', 'fi', 'nl']).withMessage('Valid language (en, fi, nl) is required')
];

module.exports = {
  registerValidator,
  loginValidator,
  googleValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  updateLanguageValidator
};
