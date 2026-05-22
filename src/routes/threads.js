const express = require('express');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');
const wsManager = require('../lib/ws');

const router = express.Router();

// Helper: get user's workspace
async function getUserWorkspace(userId) {
  const member = await prisma.teamMember.findFirst({
    where: { userId },
    include: { workspace: true },
  });
  return member;
}

// POST /api/threads — create a new exchange thread (send request)
router.post('/', authMiddleware, async (req, res) => {
  const { receiverWorkspaceId } = req.body;
  if (!receiverWorkspaceId) {
    return res.status(400).json({ error: 'Receiver workspace ID required' });
  }

  try {
    const member = await getUserWorkspace(req.user.userId);
    if (!member) return res.status(404).json({ error: 'You have no workspace' });

    if (member.workspaceId === receiverWorkspaceId) {
      return res.status(400).json({ error: 'Cannot send request to your own workspace' });
    }

    // Check for existing thread
    const existing = await prisma.exchangeThread.findFirst({
      where: {
        OR: [
          { giverWorkspaceId: member.workspaceId, receiverWorkspaceId },
          { giverWorkspaceId: receiverWorkspaceId, receiverWorkspaceId: member.workspaceId },
        ],
      },
    });
    if (existing) return res.status(409).json({ error: 'Thread already exists between these workspaces' });

    const thread = await prisma.exchangeThread.create({
      data: {
        giverWorkspaceId: member.workspaceId,
        receiverWorkspaceId,
        stage: 'NEW',
        status: 'PENDING',
      },
      include: {
        giverWorkspace: true,
        receiverWorkspace: true,
      },
    });

    wsManager.sendNotification(receiverWorkspaceId, {
      type: 'new_connection',
      threadId: thread.id,
      senderWorkspaceName: thread.giverWorkspace.websiteName,
      senderWorkspaceDomain: thread.giverWorkspace.domain,
    });

    res.status(201).json({ thread });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/threads — get all threads for current user's workspace
router.get('/', authMiddleware, async (req, res) => {
  const { filter } = req.query; // all | new | in | out

  try {
    const member = await getUserWorkspace(req.user.userId);
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    const wsId = member.workspaceId;
    let where = {
      OR: [{ giverWorkspaceId: wsId }, { receiverWorkspaceId: wsId }],
    };

    if (filter === 'new') where = { ...where, stage: 'NEW' };
    else if (filter === 'in') where = { receiverWorkspaceId: wsId };
    else if (filter === 'out') where = { giverWorkspaceId: wsId };

    const threads = await prisma.exchangeThread.findMany({
      where,
      include: {
        giverWorkspace: { select: { id: true, domain: true, websiteName: true } },
        receiverWorkspace: { select: { id: true, domain: true, websiteName: true } },
        messages: { orderBy: { timestamp: 'desc' }, take: 1 },
        linkPlacement: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ threads, workspaceId: wsId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/threads/:id — get a single thread with messages
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const member = await getUserWorkspace(req.user.userId);
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    const thread = await prisma.exchangeThread.findUnique({
      where: { id: req.params.id },
      include: {
        giverWorkspace: true,
        receiverWorkspace: true,
        messages: {
          orderBy: { timestamp: 'asc' },
          include: { sender: { select: { id: true, name: true, email: true } } },
        },
        linkPlacement: true,
      },
    });

    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    // Verify access
    if (thread.giverWorkspaceId !== member.workspaceId && thread.receiverWorkspaceId !== member.workspaceId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ thread, workspaceId: member.workspaceId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/threads/:id/status — approve or reject
router.patch('/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body; // ACCEPTED | REJECTED
  if (!['ACCEPTED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Status must be ACCEPTED or REJECTED' });
  }

  try {
    const member = await getUserWorkspace(req.user.userId);
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    const thread = await prisma.exchangeThread.findUnique({ where: { id: req.params.id } });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    // Only receiver can approve/reject
    if (thread.receiverWorkspaceId !== member.workspaceId) {
      return res.status(403).json({ error: 'Only the receiver can approve or reject' });
    }

    const updated = await prisma.exchangeThread.update({
      where: { id: req.params.id },
      data: {
        status,
        stage: status === 'ACCEPTED' ? 'CHAT' : 'NEW',
      },
      include: {
        giverWorkspace: true,
        receiverWorkspace: true,
      },
    });

    if (status === 'ACCEPTED') {
      wsManager.sendNotification(updated.giverWorkspaceId, {
        type: 'connection_accepted',
        threadId: updated.id,
        receiverWorkspaceName: updated.receiverWorkspace.websiteName,
        receiverWorkspaceDomain: updated.receiverWorkspace.domain,
      });
    }

    res.json({ thread: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
