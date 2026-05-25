const prisma = require('../lib/prisma');
const wsManager = require('../lib/ws');

const sendMessage = async (req, res) => {
  const { threadId, messageText } = req.body;
  if (!threadId || !messageText) {
    return res.status(400).json({ error: 'threadId and messageText are required' });
  }

  try {
    const member = await prisma.teamMember.findFirst({
      where: { userId: req.user.userId },
    });
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    const thread = await prisma.exchangeThread.findUnique({ 
      where: { id: threadId },
      include: { giverWorkspace: true, receiverWorkspace: true }
    });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    if (thread.status === 'REJECTED') {
      return res.status(403).json({ error: 'This connection was rejected. You cannot send messages.' });
    }

    if (thread.giverWorkspaceId !== member.workspaceId && thread.receiverWorkspaceId !== member.workspaceId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const message = await prisma.chatMessage.create({
      data: {
        threadId,
        senderUserId: req.user.userId,
        messageText,
      },
      include: {
        sender: { select: { id: true, name: true, email: true } },
      },
    });

    wsManager.broadcastToThread(threadId, message);

    const recipientWorkspaceId = thread.giverWorkspaceId === member.workspaceId ? thread.receiverWorkspaceId : thread.giverWorkspaceId;
    const senderWorkspace = thread.giverWorkspaceId === member.workspaceId ? thread.giverWorkspace : thread.receiverWorkspace;
    wsManager.sendNotification(recipientWorkspaceId, {
      type: 'new_message',
      threadId,
      messageId: message.id,
      senderName: req.user.name || 'Partner',
      senderWorkspaceDomain: senderWorkspace?.domain || 'Partner',
      messageText: message.messageText
    });

    res.status(201).json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getMessages = async (req, res) => {
  try {
    const member = await prisma.teamMember.findFirst({
      where: { userId: req.user.userId },
    });
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    const thread = await prisma.exchangeThread.findUnique({ where: { id: req.params.threadId } });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    if (thread.giverWorkspaceId !== member.workspaceId && thread.receiverWorkspaceId !== member.workspaceId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { threadId: req.params.threadId },
      orderBy: { timestamp: 'asc' },
      include: {
        sender: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  sendMessage,
  getMessages,
};
