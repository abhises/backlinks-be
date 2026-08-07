const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each email (or IP if no email) to 20 requests per window
  validate: { ip: false },
  keyGenerator: (req, res) => {
    // Track by email if provided, otherwise fallback to IP address safely
    if (req.body && req.body.email) {
      return req.body.email.toLowerCase().trim();
    }
    return ipKeyGenerator(req, res);
  },
  message: {
    error: 'Too many requests for this account, please try again after 15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Applied after authMiddleware, so req.user is always populated.
const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each authenticated user to 30 billing requests per window
  validate: { ip: false },
  keyGenerator: (req, res) => {
    if (req.user && req.user.userId) {
      return req.user.userId;
    }
    return ipKeyGenerator(req, res);
  },
  message: {
    error: 'Too many billing requests, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  billingLimiter
};
