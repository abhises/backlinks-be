const prisma = require('../lib/prisma');

const createWorkspace = async (req, res) => {
  const { domain, websiteName, description, niche, country, language, monthlyTraffic } = req.body;

  if (!domain || !websiteName || !description) {
    return res.status(400).json({ error: 'Domain, website name, and description are required' });
  }

  const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanDomain)) {
    return res.status(400).json({ error: 'Please enter a valid domain.' });
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
};

const getMyWorkspace = async (req, res) => {
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
};

const getAllWorkspaces = async (req, res) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, domain: true, websiteName: true, description: true, niche: true, country: true },
    });
    res.json({ workspaces });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateMyWorkspace = async (req, res) => {
  const { domain, websiteName, description, niche } = req.body;

  try {
    const member = await prisma.teamMember.findFirst({
      where: { userId: req.user.userId, role: 'OWNER' },
    });
    if (!member) {
      return res.status(403).json({ error: 'Only owners can update workspace details' });
    }

    if (domain) {
      const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanDomain)) {
        return res.status(400).json({ error: 'Please enter a valid domain.' });
      }
    }

    const updated = await prisma.workspace.update({
      where: { id: member.workspaceId },
      data: {
        domain: domain ? domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') : undefined,
        websiteName: websiteName || undefined,
        description: description || undefined,
        niche: niche || undefined,
      },
    });

    res.json({ workspace: updated });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Domain already registered' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createWorkspace,
  getMyWorkspace,
  getAllWorkspaces,
  updateMyWorkspace,
};
