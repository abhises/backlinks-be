const prisma = require('../lib/prisma');
const { verifyWorkspaceLanguage } = require('../lib/verifier');
const socketManager = require('../lib/ws');
const { matchNewWorkspace } = require('../jobs/matcher');

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

    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { language: true } });
    const wsLanguage = language || user?.language || 'en';

    const workspace = await prisma.workspace.create({
      data: {
        domain: domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''),
        websiteName,
        description,
        niche: niche || null,
        country: country || null,
        language: wsLanguage,
        monthlyTraffic: monthlyTraffic ? parseInt(monthlyTraffic) : null,
        teamMembers: {
          create: { userId: req.user.userId, role: 'OWNER' },
        },
      },
      include: { teamMembers: true },
    });

    // Persist + push a one-time welcome notification now that the workspace exists
    // (registration alone has no workspace yet, so this is the earliest point one can attach to).
    socketManager.sendNotification(workspace.id, { type: 'signup_welcome' })
      .catch(e => console.error('Failed to send welcome notification:', e));

    // Give the new workspace its first connection request right away instead
    // of making them wait for the next scheduled matching run. Later
    // connections (up to matchAmount) still come from that regular schedule.
    matchNewWorkspace(workspace.id)
      .catch(e => console.error('Immediate first-match error:', e));

    // Asynchronously audit site language and hreflang tags in background
    verifyWorkspaceLanguage(cleanDomain, wsLanguage).then(async (audit) => {
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: {
          verificationStatus: audit.verificationStatus,
          detectedLanguage: audit.detectedLanguage,
          hreflangTags: audit.hreflangTags,
          lastVerifiedAt: new Date(),
          verificationNotes: audit.verificationNotes,
        },
      });
    }).catch(e => console.error('Background language audit error:', e));

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
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { language: true, role: true },
    });

    const targetLang = req.query.language || user?.language || 'en';
    const whereClause = (user?.role === 'ADMIN' && !req.query.language) ? {} : {
      OR: [
        {
          teamMembers: {
            some: {
              user: {
                language: targetLang,
              },
            },
          },
        },
        {
          language: targetLang,
        },
      ],
    };

    const workspaces = await prisma.workspace.findMany({
      where: whereClause,
      select: { id: true, domain: true, websiteName: true, description: true, niche: true, country: true, language: true, verificationStatus: true, detectedLanguage: true, hreflangTags: true, lastVerifiedAt: true, verificationNotes: true },
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

    if (domain) {
      const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
      verifyWorkspaceLanguage(cleanDomain, updated.language || 'en').then(async (audit) => {
        await prisma.workspace.update({
          where: { id: updated.id },
          data: {
            verificationStatus: audit.verificationStatus,
            detectedLanguage: audit.detectedLanguage,
            hreflangTags: audit.hreflangTags,
            lastVerifiedAt: new Date(),
            verificationNotes: audit.verificationNotes,
          },
        });
      }).catch(e => console.error('Background update audit error:', e));
    }

    res.json({ workspace: updated });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Domain already registered' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const verifyMyWorkspace = async (req, res) => {
  try {
    const member = await prisma.teamMember.findFirst({
      where: { userId: req.user.userId },
      include: { workspace: true },
    });

    if (!member) return res.status(404).json({ error: 'No workspace found' });

    const ws = member.workspace;
    const targetLang = ws.language || 'en';
    const audit = await verifyWorkspaceLanguage(ws.domain, targetLang);

    const updated = await prisma.workspace.update({
      where: { id: ws.id },
      data: {
        verificationStatus: audit.verificationStatus,
        detectedLanguage: audit.detectedLanguage,
        hreflangTags: audit.hreflangTags,
        lastVerifiedAt: new Date(),
        verificationNotes: audit.verificationNotes,
      },
    });

    res.json({ workspace: updated, audit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during language audit' });
  }
};

module.exports = {
  createWorkspace,
  getMyWorkspace,
  getAllWorkspaces,
  updateMyWorkspace,
  verifyMyWorkspace,
};
