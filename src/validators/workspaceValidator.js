const { body } = require('express-validator');

const createWorkspaceValidator = [
  body('domain').isURL({ require_protocol: false, require_valid_protocol: false }).withMessage('A valid domain is required'),
  body('websiteName').notEmpty().withMessage('Website name is required').isString().trim(),
  body('description').notEmpty().withMessage('Description is required').isString().trim().escape(),
  body('niche').optional().isString().trim(),
  body('country').optional().isString().trim(),
  body('language').optional().isString().trim(),
  body('monthlyTraffic').optional().isInt({ min: 0 }).withMessage('Monthly traffic must be a positive integer')
];

const updateWorkspaceValidator = [
  body('domain').optional().isURL({ require_protocol: false, require_valid_protocol: false }).withMessage('A valid domain is required'),
  body('websiteName').optional().isString().trim(),
  body('description').optional().isString().trim().escape(),
  body('niche').optional().isString().trim(),
  body('country').optional().isString().trim(),
  body('language').optional().isString().trim(),
  body('monthlyTraffic').optional().isInt({ min: 0 }).withMessage('Monthly traffic must be a positive integer')
];

module.exports = {
  createWorkspaceValidator,
  updateWorkspaceValidator
};
