const prisma = require('../lib/prisma');

// Blocks core paid actions once a user's free trial has lapsed and they have
// no active Stripe subscription. Must run after authMiddleware.
const requireActiveAccess = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { role: true, subscriptionStatus: true, trialEndsAt: true },
    });
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (user.role === 'ADMIN') return next();

    const now = new Date();
    const isTrialActive = user.subscriptionStatus === 'TRIALING' && user.trialEndsAt && user.trialEndsAt > now;
    const hasAccess = user.subscriptionStatus === 'ACTIVE' || isTrialActive;

    if (!hasAccess) {
      return res.status(402).json({
        error: 'Your free trial has ended. Subscribe to continue.',
        code: 'SUBSCRIPTION_REQUIRED',
      });
    }

    next();
  } catch (err) {
    console.error('Error in requireActiveAccess:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = requireActiveAccess;
