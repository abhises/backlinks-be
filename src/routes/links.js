const express = require('express');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const VALID_LINK_TYPES = ['GUEST_POST', 'NICHE_EDIT', 'IMAGE', 'OTHER'];
const VALID_STATUSES = ['LIVE', 'REMOVED', 'DEPARTED'];

// POST /api/links — create or update link placement for a thread
router.post('/', authMiddleware, async (req, res) => {
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
      const thread = await prisma.exchangeThread.findUnique({ where: { id: threadId } });
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      if (thread.giverWorkspaceId !== member.workspaceId) {
        return res.status(403).json({ error: 'Only the giver can submit link details' });
      }
      giverWorkspaceId = thread.giverWorkspaceId;
      receiverWorkspaceId = thread.receiverWorkspaceId;

      // Check giver domain ownership
      const giverDomain = member.workspace.domain;
      if (!sourceUrl.includes(giverDomain)) {
        return res.status(400).json({ error: `Source URL must belong to your domain: ${giverDomain}` });
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

    res.status(201).json({ link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/links — get all links for current workspace
router.get('/', authMiddleware, async (req, res) => {
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
});

// PATCH /api/links/:id/status — inline status mutation
router.patch('/:id/status', authMiddleware, async (req, res) => {
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
});

module.exports = router;
