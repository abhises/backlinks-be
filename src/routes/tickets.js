const express = require('express');
const authMiddleware = require('../middleware/auth');
const ticketsController = require('../controllers/tickets');

const router = express.Router();

router.post('/', authMiddleware, ticketsController.createTicket);

module.exports = router;
