const stripe = require('../lib/stripe');
const prisma = require('../lib/prisma');
const wsManager = require('../lib/ws');
const { sendSubscriptionActiveEmail } = require('../lib/email');
const { isBetaMode } = require('../lib/platformMode');

const getUserWorkspace = async (userId) => {
  const member = await prisma.teamMember.findFirst({ where: { userId }, select: { workspaceId: true } });
  return member?.workspaceId || null;
};

const PRICE_ID = process.env.STRIPE_PRICE_ID;
const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',')[0].trim().replace(/\/$/, '')
  : 'http://localhost:3000';
const ALLOWED_FRONTEND_URLS = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim().replace(/\/$/, ''))
  : [DEFAULT_FRONTEND_URL];

// Stripe must redirect back to the same origin the user checked out from,
// or their session cookie won't be visible on the domain they land on.
const getReturnUrl = (req) => {
  const origin = req.headers.origin ? req.headers.origin.replace(/\/$/, '') : null;
  return origin && ALLOWED_FRONTEND_URLS.includes(origin) ? origin : DEFAULT_FRONTEND_URL;
};

// Stripe subscription statuses -> our simplified enum
const mapStripeStatus = (stripeStatus) => {
  if (stripeStatus === 'trialing' || stripeStatus === 'active') return 'ACTIVE';
  if (stripeStatus === 'past_due') return 'PAST_DUE';
  if (['canceled', 'unpaid', 'incomplete_expired'].includes(stripeStatus)) return 'CANCELED';
  return 'TRIALING';
};

const getStatus = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { subscriptionStatus: true, trialEndsAt: true, stripeSubscriptionId: true, stripeCustomerId: true, subscriptionBonusDays: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const betaMode = await isBetaMode();
    const now = new Date();
    const isTrialActive = user.subscriptionStatus === 'TRIALING' && user.trialEndsAt && user.trialEndsAt > now;
    const hasAccess = betaMode || user.subscriptionStatus === 'ACTIVE' || isTrialActive;
    const trialDaysLeft = isTrialActive
      ? Math.max(0, Math.ceil((user.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;
    const isSubscribed = !!user.stripeSubscriptionId && user.subscriptionStatus === 'ACTIVE';

    let renewalDate = null;
    let daysUntilRenewal = 0;
    let cancelAtPeriodEnd = false;
    if (isSubscribed) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        const periodEndItem = subscription.items?.data?.[0];
        const periodEnd = subscription.current_period_end || periodEndItem?.current_period_end;
        const periodStart = subscription.current_period_start || periodEndItem?.current_period_start;
        if (periodEnd) {
          renewalDate = new Date(periodEnd * 1000);
          daysUntilRenewal = Math.max(0, Math.ceil((renewalDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

          // Any leftover trial days at subscribe time are honored as bonus days
          // on top of the first billing period only — Stripe's own charge/renewal
          // dates are untouched, this only affects what we display.
          const isFirstPeriod = subscription.start_date && periodStart
            && Math.abs(periodStart - subscription.start_date) < 60;
          if (isFirstPeriod && user.subscriptionBonusDays) {
            renewalDate = new Date(renewalDate.getTime() + user.subscriptionBonusDays * 24 * 60 * 60 * 1000);
            daysUntilRenewal += user.subscriptionBonusDays;
          }
        }
        // Stripe uses cancel_at_period_end for normal billing-cycle cancellations,
        // but a separate cancel_at timestamp when cancelling during an active trial.
        cancelAtPeriodEnd = !!subscription.cancel_at_period_end || !!subscription.cancel_at;
      } catch (err) {
        console.error('Failed to retrieve Stripe subscription for renewal info:', err.message);
      }
    }

    res.json({
      subscriptionStatus: user.subscriptionStatus,
      trialEndsAt: user.trialEndsAt,
      isTrialActive,
      trialDaysLeft,
      hasAccess,
      isSubscribed,
      renewalDate,
      daysUntilRenewal,
      cancelAtPeriodEnd,
      stripeCustomerId: user.stripeCustomerId,
      platformMode: betaMode ? 'BETA' : 'PAID',
    });
  } catch (err) {
    console.error('Error in getStatus:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createCheckoutSession = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.subscriptionStatus === 'ACTIVE' && user.stripeSubscriptionId) {
      return res.status(400).json({ error: 'You already have an active subscription' });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    // Subscribing always charges immediately for a fresh 30-day Pro period —
    // the free trial and the paid subscription are tracked separately, so we
    // never blend remaining trial days into Stripe's own trial mechanism.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      subscription_data: {
        metadata: { userId: user.id },
      },
      success_url: `${getReturnUrl(req)}/billing?checkout=success`,
      cancel_url: `${getReturnUrl(req)}/billing?checkout=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error in createCheckoutSession:', err);
    res.status(500).json({ error: 'Server error creating checkout session' });
  }
};

const createPortalSession = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account found. Subscribe first.' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${getReturnUrl(req)}/settings#billing`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    console.error('Error in createPortalSession:', err);
    res.status(500).json({ error: 'Server error creating billing portal session' });
  }
};

const getInvoices = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { stripeCustomerId: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.stripeCustomerId) return res.json({ invoices: [] });

    const result = await stripe.invoices.list({ customer: user.stripeCustomerId, limit: 12 });
    const invoices = result.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status, // draft | open | paid | uncollectible | void
      amountPaid: inv.amount_paid,
      amountDue: inv.amount_due,
      currency: inv.currency,
      created: inv.created * 1000,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdf: inv.invoice_pdf,
    }));

    res.json({ invoices });
  } catch (err) {
    console.error('Error in getInvoices:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const webhook = async (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.userId;
        const subscriptionId = session.subscription;
        const customerId = session.customer;
        if (userId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const newStatus = mapStripeStatus(subscription.status);

          const existingUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { trialEndsAt: true, email: true, name: true, language: true },
          });
          const trialDaysLeft = existingUser?.trialEndsAt && existingUser.trialEndsAt > new Date()
            ? Math.ceil((existingUser.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
            : 0;

          await prisma.user.update({
            where: { id: userId },
            data: {
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              subscriptionStatus: newStatus,
              subscriptionBonusDays: trialDaysLeft,
            },
          });

          if (newStatus === 'ACTIVE') {
            const workspaceId = await getUserWorkspace(userId);
            if (workspaceId) {
              await wsManager.sendNotification(workspaceId, {
                type: 'subscription_active',
                title: 'Welcome to SERPsupport Pro',
                body: 'Your subscription is active. You now have full access to SERPsupport.',
                link: '/billing',
              });
            }
            if (existingUser?.email) {
              sendSubscriptionActiveEmail(existingUser.email, existingUser.name, existingUser.language)
                .catch(err => console.error('Non-fatal: Error sending subscription active email:', err.message || err));
            }
          }
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await prisma.user.updateMany({
          where: { stripeCustomerId: subscription.customer },
          data: {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: mapStripeStatus(subscription.status),
          },
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const affectedUsers = await prisma.user.findMany({
          where: { stripeCustomerId: subscription.customer },
          select: { id: true, trialEndsAt: true },
        });

        const now = new Date();
        for (const affectedUser of affectedUsers) {
          // If they still had free trial days left when they subscribed, give
          // those back instead of cutting them off entirely.
          const revertToTrial = affectedUser.trialEndsAt && affectedUser.trialEndsAt > now;

          await prisma.user.update({
            where: { id: affectedUser.id },
            data: {
              stripeSubscriptionId: null,
              subscriptionStatus: revertToTrial ? 'TRIALING' : 'CANCELED',
            },
          });

          const workspaceId = await getUserWorkspace(affectedUser.id);
          if (workspaceId) {
            await wsManager.sendNotification(workspaceId, {
              type: 'subscription_canceled',
              title: 'Subscription canceled',
              body: revertToTrial
                ? 'Your SERPsupport Pro subscription has ended. You still have free trial days left.'
                : 'Your SERPsupport Pro subscription has ended. Subscribe again anytime to regain access.',
              link: '/billing',
            });
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.customer) {
          await prisma.user.updateMany({
            where: { stripeCustomerId: invoice.customer },
            data: { subscriptionStatus: 'PAST_DUE' },
          });
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Error handling webhook event:', err);
    res.status(500).json({ error: 'Webhook handler error' });
  }
};

module.exports = { getStatus, createCheckoutSession, createPortalSession, getInvoices, webhook };
