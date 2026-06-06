const prisma = require('../lib/prisma');
const wsManager = require('../lib/ws');

// Helper: get user's workspace
async function getUserWorkspace(userId) {
  const member = await prisma.teamMember.findFirst({
    where: { userId },
    include: { workspace: true },
  });
  return member;
}

const createThread = async (req, res) => {
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
        giverAccepted: true,
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
};

const getThreads = async (req, res) => {
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
        giverWorkspace: { 
          select: { 
            id: true, domain: true, websiteName: true, niche: true, country: true, description: true, createdAt: true,
            teamMembers: { where: { role: 'OWNER' }, select: { user: { select: { name: true } } } }
          } 
        },
        receiverWorkspace: { 
          select: { 
            id: true, domain: true, websiteName: true, niche: true, country: true, description: true, createdAt: true,
            teamMembers: { where: { role: 'OWNER' }, select: { user: { select: { name: true } } } }
          } 
        },
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
};

const getThreadById = async (req, res) => {
  try {
    const member = await getUserWorkspace(req.user.userId);
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    const thread = await prisma.exchangeThread.findUnique({
      where: { id: req.params.id },
      include: {
        giverWorkspace: {
          include: { teamMembers: { where: { role: 'OWNER' }, select: { user: { select: { name: true } } } } }
        },
        receiverWorkspace: {
          include: { teamMembers: { where: { role: 'OWNER' }, select: { user: { select: { name: true } } } } }
        },
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
};

const updateThreadStatus = async (req, res) => {
  const { status } = req.body; // ACCEPTED | REJECTED
  if (!['ACCEPTED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Status must be ACCEPTED or REJECTED' });
  }

  try {
    const member = await getUserWorkspace(req.user.userId);
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    const thread = await prisma.exchangeThread.findUnique({ where: { id: req.params.id } });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const isGiver = thread.giverWorkspaceId === member.workspaceId;
    const isReceiver = thread.receiverWorkspaceId === member.workspaceId;

    if (!isGiver && !isReceiver) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let updateData = {};
    let newStatus = thread.status;
    let newStage = thread.stage;

    let giverAccepted = thread.giverAccepted;
    let receiverAccepted = thread.receiverAccepted;

    if (status === 'REJECTED') {
      newStatus = 'REJECTED';
      newStage = 'NEW';
      updateData = { status: newStatus, stage: newStage };
    } else if (status === 'ACCEPTED') {
      if (isGiver) giverAccepted = true;
      if (isReceiver) receiverAccepted = true;

      updateData = { giverAccepted, receiverAccepted };

      if (giverAccepted && receiverAccepted) {
        newStatus = 'ACCEPTED';
        newStage = 'CHAT';
        updateData.status = newStatus;
        updateData.stage = newStage;
      }
    }

    const updated = await prisma.exchangeThread.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        giverWorkspace: true,
        receiverWorkspace: true,
      },
    });

    // Determine who to notify
    const otherId = isGiver ? thread.receiverWorkspaceId : thread.giverWorkspaceId;
    const selfWorkspace = isGiver ? updated.giverWorkspace : updated.receiverWorkspace;

    if (newStatus === 'ACCEPTED' && newStage === 'CHAT') {
      wsManager.sendNotification(otherId, {
        type: 'connection_accepted',
        threadId: updated.id,
        receiverWorkspaceName: selfWorkspace.websiteName,
        receiverWorkspaceDomain: selfWorkspace.domain,
      });

    } else if (newStatus === 'REJECTED') {
      wsManager.sendNotification(otherId, {
        type: 'connection_rejected',
        threadId: updated.id,
        receiverWorkspaceName: selfWorkspace.websiteName,
        receiverWorkspaceDomain: selfWorkspace.domain,
      });
    }

    res.json({ thread: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createThread,
  getThreads,
  getThreadById,
  updateThreadStatus,
};
