const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const emailFrom = (req) =>
  req.body && typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';

// Per IP + account: slows guessing one account's password from one address,
// without letting a stranger lock the real owner out from elsewhere.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  validate: { ip: false },
  keyGenerator: (req, res) => `${ipKeyGenerator(req.ip)}|${emailFrom(req)}`,
  message: {
    error: 'Too many attempts, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Per IP across all accounts: stops one address spraying passwords over many
// emails (which the per-account limiter alone would allow).
const authIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  validate: { ip: false },
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: {
    error: 'Too many requests from this network, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Applied after authMiddleware, so req.user is always populated.
const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each authenticated user to 30 billing requests per window
  validate: { ip: false },
  keyGenerator: (req) => {
    if (req.user && req.user.userId) {
      return req.user.userId;
    }
    return ipKeyGenerator(req.ip);
  },
  message: {
    error: 'Too many billing requests, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  authIpLimiter,
  billingLimiter
};
