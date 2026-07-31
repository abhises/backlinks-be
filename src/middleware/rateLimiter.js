const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each email (or IP if no email) to 20 requests per window
  keyGenerator: (req) => {
    // Track by email if provided, otherwise fallback to IP address
    if (req.body && req.body.email) {
      return req.body.email.toLowerCase().trim();
    }
    // Prevent IPv6 express-rate-limit warning by bypassing their req.ip regex
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    return String(ip);
  },
  message: {
    error: 'Too many requests for this account, please try again after 15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

module.exports = {
  authLimiter
};
