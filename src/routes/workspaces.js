const express = require('express');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// POST /api/workspaces — create workspace after onboarding
router.post('/', authMiddleware, async (req, res) => {
  const { domain, websiteName, description, niche, country, language, monthlyTraffic } = req.body;

  if (!domain || !websiteName || !description) {
    return res.status(400).json({ error: 'Domain, website name, and description are required' });
  }

  try {
    // Check user doesn't already have a workspace
    const existing = await prisma.teamMember.findFirst({
      where: { userId: req.user.userId, role: 'OWNER' },
    });
    if (existing) {
      return res.status(409).json({ error: 'User already has a workspace' });
    }

    const workspace = await prisma.workspace.create({
      data: {
        domain: domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''),
        websiteName,
        description,
        niche: niche || null,
        country: country || null,
        language: language || null,
        monthlyTraffic: monthlyTraffic ? parseInt(monthlyTraffic) : null,
        teamMembers: {
          create: { userId: req.user.userId, role: 'OWNER' },
        },
      },
      include: { teamMembers: true },
    });

    res.status(201).json({ workspace });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Domain already registered' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/workspaces/mine — get current user's workspace
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const member = await prisma.teamMember.findFirst({
      where: { userId: req.user.userId },
      include: { workspace: true },
    });

    if (!member) return res.status(404).json({ error: 'No workspace found' });
    res.json({ workspace: member.workspace, role: member.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/workspaces — list all workspaces (for discovery)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, domain: true, websiteName: true, description: true, niche: true, country: true },
    });
    res.json({ workspaces });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
