const prisma = require('../lib/prisma');
const wsManager = require('../lib/ws');

const VALID_LINK_TYPES = ['GUEST_POST', 'NICHE_EDIT', 'IMAGE', 'OTHER'];
const VALID_STATUSES = ['LIVE', 'REMOVED', 'DEPARTED'];

const createOrUpdateLink = async (req, res) => {
  const { threadId, sourceUrl, targetUrl, anchorText, linkType } = req.body;

  if (!sourceUrl || !targetUrl || !anchorText || !linkType) {
    return res.status(400).json({ error: 'sourceUrl, targetUrl, anchorText, and linkType are required' });
  }
  if (!VALID_LINK_TYPES.includes(linkType)) {
    return res.status(400).json({ error: `linkType must be one of: ${VALID_LINK_TYPES.join(', ')}` });
  }

  try {
    const member = await prisma.teamMember.findFirst({
      where: { userId: req.user.userId },
      include: { workspace: true },
    });
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    let giverWorkspaceId = member.workspaceId;
    let receiverWorkspaceId = null;

    if (threadId) {
      const thread = await prisma.exchangeThread.findUnique({ where: { id: threadId }, include: { linkPlacement: true } });
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      
      const isOriginalGiver = thread.giverWorkspaceId === member.workspaceId;
      const isOriginalReceiver = thread.receiverWorkspaceId === member.workspaceId;

      if (!isOriginalGiver && !isOriginalReceiver) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (thread.linkPlacement && thread.linkPlacement.giverWorkspaceId !== member.workspaceId) {
        return res.status(403).json({ error: 'Link already placed by the other party. You cannot edit it.' });
      }

      giverWorkspaceId = member.workspaceId;
      receiverWorkspaceId = isOriginalGiver ? thread.receiverWorkspaceId : thread.giverWorkspaceId;

      // Check giver domain ownership
      const giverDomain = member.workspace.domain;
      if (!sourceUrl.includes(giverDomain)) {
        return res.status(400).json({ error: `Source URL must belong to your domain: ${giverDomain}` });
      }

      // If the original receiver is the one submitting, we must swap the roles on the Thread!
      if (!isOriginalGiver && !thread.linkPlacement) {
        await prisma.exchangeThread.update({
          where: { id: threadId },
          data: {
            giverWorkspaceId: member.workspaceId,
            receiverWorkspaceId: thread.giverWorkspaceId,
            giverAccepted: thread.receiverAccepted,
            receiverAccepted: thread.giverAccepted
          }
        });
      }
    }

    // Upsert link placement
    let link;
    if (threadId) {
      link = await prisma.linkPlacement.upsert({
        where: { threadId },
        update: { sourceUrl, targetUrl, anchorText, linkType },
        create: {
          threadId,
          giverWorkspaceId,
          receiverWorkspaceId,
          sourceUrl,
          targetUrl,
          anchorText,
          linkType,
          status: 'LIVE',
        },
      });

      // Advance thread stage to PLACED
      await prisma.exchangeThread.update({
        where: { id: threadId },
        data: { stage: 'PLACED' },
      });
    } else {
      link = await prisma.linkPlacement.create({
        data: {
          giverWorkspaceId,
          receiverWorkspaceId: receiverWorkspaceId || giverWorkspaceId,
          sourceUrl,
          targetUrl,
          anchorText,
          linkType,
          status: 'LIVE',
        },
      });
    }

    // Send notification to the receiver that the link was placed
    if (receiverWorkspaceId) {
      wsManager.sendNotification(receiverWorkspaceId, {
        type: 'link_placed',
        threadId: threadId || '',
        body: `${member.workspace.domain} has added the backlink details. Check your Dashboard!`,
      });
    }

    res.status(201).json({ link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getLinks = async (req, res) => {
  try {
    const member = await prisma.teamMember.findFirst({
      where: { userId: req.user.userId },
    });
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    const wsId = member.workspaceId;

    const links = await prisma.linkPlacement.findMany({
      where: {
        OR: [{ giverWorkspaceId: wsId }, { receiverWorkspaceId: wsId }],
      },
      include: {
        giverWorkspace: { select: { id: true, domain: true, websiteName: true } },
        receiverWorkspace: { select: { id: true, domain: true, websiteName: true } },
        thread: { select: { id: true, stage: true, status: true } },
      },
      orderBy: { datePlaced: 'desc' },
    });

    res.json({ links, workspaceId: wsId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateLinkStatus = async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const member = await prisma.teamMember.findFirst({
      where: { userId: req.user.userId },
    });
    if (!member) return res.status(404).json({ error: 'No workspace found' });

    const link = await prisma.linkPlacement.findUnique({ where: { id: req.params.id } });
    if (!link) return res.status(404).json({ error: 'Link not found' });

    if (link.giverWorkspaceId !== member.workspaceId && link.receiverWorkspaceId !== member.workspaceId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await prisma.linkPlacement.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json({ link: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createOrUpdateLink,
  getLinks,
  updateLinkStatus,
};
