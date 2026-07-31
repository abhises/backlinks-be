const { body, param } = require('express-validator');

const createLinkValidator = [
  body('threadId').isUUID().withMessage('Valid thread ID is required'),
  body('sourceUrl').isURL({ require_protocol: false, require_valid_protocol: false }).withMessage('Valid source URL is required'),
  body('targetUrl').isURL({ require_protocol: false, require_valid_protocol: false }).withMessage('Valid target URL is required'),
  body('anchorText').notEmpty().withMessage('Anchor text is required').isString().trim(),
  body('linkType').notEmpty().withMessage('Link type is required').isString().trim()
];

const updateLinkStatusValidator = [
  param('id').isUUID().withMessage('Valid link ID is required'),
  body('status').isIn(['LIVE', 'REMOVED', 'DEPARTED']).withMessage('Invalid status')
];

module.exports = {
  createLinkValidator,
  updateLinkStatusValidator
};
