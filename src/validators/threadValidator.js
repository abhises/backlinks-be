const { body, param } = require('express-validator');

const createThreadValidator = [
  body('giverWorkspaceId').isUUID().withMessage('Valid giver workspace ID is required'),
  body('receiverWorkspaceId').isUUID().withMessage('Valid receiver workspace ID is required')
];

const updateThreadStatusValidator = [
  param('id').isUUID().withMessage('Valid thread ID is required'),
  body('status').optional().isIn(['PENDING', 'ACCEPTED', 'REJECTED']).withMessage('Invalid status'),
  body('stage').optional().isIn(['NEW', 'CHAT', 'PLACED']).withMessage('Invalid stage')
];

module.exports = {
  createThreadValidator,
  updateThreadStatusValidator
};
