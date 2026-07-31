const { body } = require('express-validator');

const sendMessageValidator = [
  body('threadId').isUUID().withMessage('Valid thread ID is required'),
  body('messageText').notEmpty().withMessage('Message text is required').isString().trim().escape()
];

module.exports = {
  sendMessageValidator
};
