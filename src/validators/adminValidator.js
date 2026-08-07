const { body, param } = require('express-validator');

const sendNotificationValidator = [
  body('title').notEmpty().withMessage('Title is required').isString().trim(),
  body('description').notEmpty().withMessage('Description is required').isString().trim()
];

const updateUserValidator = [
  param('id').isUUID().withMessage('Valid user ID is required'),
  body('role').optional().isIn(['ADMIN', 'CLIENT']).withMessage('Invalid role'),
  body('language').optional().isIn(['en', 'fi', 'nl']).withMessage('Invalid language')
];

const updateBacklinkValidator = [
  param('id').isUUID().withMessage('Valid backlink ID is required'),
  body('status').optional().isIn(['LIVE', 'REMOVED', 'DEPARTED']).withMessage('Invalid status')
];

const updateSettingsValidator = [
  body('cronExpression').optional().isString().trim(),
  body('matchAmount').optional().isInt({ min: 1 }).withMessage('Must be a positive integer'),
  body('rejectLimit').optional().isInt({ min: 1 }),
  body('answerTimeoutDays').optional().isInt({ min: 1 }),
  body('placementTimeoutDays').optional().isInt({ min: 1 }),
  body('platformMode').optional().isIn(['BETA', 'PAID'])
];

module.exports = {
  sendNotificationValidator,
  updateUserValidator,
  updateBacklinkValidator,
  updateSettingsValidator
};
