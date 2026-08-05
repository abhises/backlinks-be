const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../lib/email');

const getLanguageFromReq = (req) => {
  if (req.body && req.body.language) {
    const lang = String(req.body.language).toLowerCase().trim();
    if (['nl', 'fi', 'en'].includes(lang)) return lang;
  }
  const originOrReferer = req.headers.origin || req.headers.referer || '';
  if (/https?:\/\/fi\./i.test(originOrReferer) || /fi\.localhost/i.test(originOrReferer)) {
    return 'fi';
  }
  if (/https?:\/\/nl\./i.test(originOrReferer) || /nl\.localhost/i.test(originOrReferer)) {
    return 'nl';
  }
  return 'en';
};

const checkDomainMatch = (user, req) => {
  if (!user || user.role === 'ADMIN') return null;
  const requestLang = getLanguageFromReq(req);
  const userLang = user.language || 'en';
  if (userLang !== requestLang) {
    const originOrReferer = req.headers.origin || req.headers.referer || '';
    const isLocal = /localhost/i.test(originOrReferer) || /127\.0\.0\.1/.test(originOrReferer);
    
    let targetDomain = '';
    if (isLocal) {
      if (userLang === 'nl') targetDomain = 'http://nl.localhost:3000/auth?mode=login';
      else if (userLang === 'fi') targetDomain = 'http://fi.localhost:3000/auth?mode=login';
      else targetDomain = 'http://localhost:3000/auth?mode=login';
    } else {
      if (userLang === 'nl') targetDomain = 'https://nl.serpsupport.com/auth?mode=login';
      else if (userLang === 'fi') targetDomain = 'https://fi.serpsupport.com/auth?mode=login';
      else targetDomain = 'https://serpsupport.com/auth?mode=login';
    }

    return {
      error: `Your account belongs to the ${userLang.toUpperCase()} domain (${targetDomain}). You can only log in on your registered language domain.`,
      requiredLanguage: userLang,
      targetDomain,
    };
  }
  return null;
};

const register = async (req, res) => {
  let { name, email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  email = email.toLowerCase().trim();
  if (!name || !name.trim()) {
    name = email.split('@')[0];
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email address already exists' });

    const language = getLanguageFromReq(req);
    const hashedPassword = await bcrypt.hash(password, 12);
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const user = await prisma.user.create({
      data: { name, email, hashedPassword, language, trialEndsAt, subscriptionStatus: 'TRIALING' },
    });

    // Send welcome email asynchronously without blocking registration
    sendWelcomeEmail(user.email, user.name, language).catch(err => console.error('Non-fatal: Error sending welcome email:', err.message || err));

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name, role: user.role, language: user.language },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).cookie('token', token, {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    }).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, language: user.language },
    });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Email address already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (!user.hashedPassword) {
      return res.status(401).json({
        error: 'This account was registered using Google. Please sign in with Google.'
      });
    }

    const valid = await bcrypt.compare(password, user.hashedPassword);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const domainMismatch = checkDomainMatch(user, req);
    if (domainMismatch) return res.status(403).json(domainMismatch);

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name, role: user.role, language: user.language || 'en' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    }).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, language: user.language || 'en' },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const google = async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required' });
  }

  try {
    // Verify token with Google's tokeninfo endpoint
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!response.ok) {
      return res.status(400).json({ error: 'Invalid Google credential' });
    }

    const payload = await response.json();

    // Verify email is verified
    if (payload.email_verified !== 'true' && payload.email_verified !== true) {
      return res.status(400).json({ error: 'Google email is not verified' });
    }

    const { email, name } = payload;

    // Check if user already exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const domainMismatch = checkDomainMatch(user, req);
      if (domainMismatch) return res.status(403).json(domainMismatch);
    } else {
      const language = getLanguageFromReq(req);
      // Create a user without a password
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      user = await prisma.user.create({
        data: {
          name: name || email.split('@')[0],
          email,
          hashedPassword: null,
          language,
          trialEndsAt,
          subscriptionStatus: 'TRIALING',
        },
      });

      // Send welcome email asynchronously without blocking registration
      sendWelcomeEmail(user.email, user.name, language).catch(err => console.error('Non-fatal: Error sending welcome email:', err.message || err));
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name, role: user.role, language: user.language || 'en' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    }).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, language: user.language || 'en' },
    });
  } catch (err) {
    console.error('Google Auth Error:', err);
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Email address already exists' });
    }
    res.status(500).json({ error: 'Server error during Google authentication' });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, name: true, email: true, role: true, language: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check if onboarding is done
    const workspace = await prisma.teamMember.findFirst({
      where: { userId: user.id },
      include: { workspace: true },
    });

    res.json({ user, workspace: workspace?.workspace || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.json({ message: 'If an account exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    const langDomains = {
      en: 'https://www.serpsupport.com',
      fi: 'https://fi.serpsupport.com',
      nl: 'https://nl.serpsupport.com',
    };
    const userLangForReset = user.language || 'en';
    const frontendUrl = process.env.NODE_ENV === 'production'
      ? (langDomains[userLangForReset] || langDomains.en)
      : (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim().replace(/\/$/, '') : 'http://localhost:3000');

    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    sendPasswordResetEmail(user.email, user.name, resetLink, userLangForReset).catch(err => console.error('Non-fatal: Error sending password reset email:', err.message || err));

    res.json({ message: 'If an account exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Error in forgotPassword:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset link' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Error in resetPassword:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateLanguage = async (req, res) => {
  const { language } = req.body;
  if (!language || !['en', 'fi', 'nl'].includes(String(language).toLowerCase().trim())) {
    return res.status(400).json({ error: 'Valid language (en, fi, nl) is required' });
  }

  try {
    const cleanLang = String(language).toLowerCase().trim();
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { language: cleanLang },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name, role: user.role, language: user.language || 'en' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    }).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, language: user.language || 'en' },
    });
  } catch (err) {
    console.error('Error in updateLanguage:', err);
    res.status(500).json({ error: 'Server error updating language' });
  }
};

const logout = (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  });
  res.status(200).json({ success: true, message: 'User logged out successfully' });
};

module.exports = {
  register,
  login,
  google,
  getMe,
  forgotPassword,
  resetPassword,
  updateLanguage,
  logout
};
