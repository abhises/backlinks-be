const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

// Verifies a session token and checks it against the database, so revoked
// sessions (logout, password reset) and role changes take effect immediately
// instead of when the 7-day token expires. Returns the user or null.
async function resolveSession(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, name: true, role: true, language: true, tokenVersion: true },
  });
  if (!user || (decoded.tv || 0) !== user.tokenVersion) return null;

  // Role/name/language come from the database, never from the (possibly stale) token.
  return {
    ...decoded,
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language || 'en',
  };
}

const authMiddleware = async (req, res, next) => {
  let token = req.cookies.token;

  // Fallback to Authorization header if no cookie exists
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const user = await resolveSession(token);
    if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth check failed:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = authMiddleware;
module.exports.resolveSession = resolveSession;
