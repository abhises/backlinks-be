const prisma = require('../lib/prisma');
const { sendNewTicketEmail } = require('../lib/email');
const wsManager = require('../lib/ws');

const createTicket = async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { name: true, email: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ticket = await prisma.supportTicket.create({
      data: { userId: req.user.userId, message: message.trim() },
    });

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { email: true, name: true, language: true },
    });
    admins.forEach((admin) => {
      sendNewTicketEmail(admin.email, admin.name, user.name, user.email, ticket.message, admin.language)
        .catch(err => console.error('Non-fatal: Error sending new ticket email:', err.message || err));
    });

    wsManager.notifyAdmins({ ticketId: ticket.id, submitterName: user.name, createdAt: ticket.createdAt });

    res.json({ ticket });
  } catch (err) {
    console.error('Error in createTicket:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { createTicket };
