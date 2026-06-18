// middleware/subscription.js
// ─── Subscription Gate Middleware · AmbientScribe ────────────────────────────
'use strict';

const Subscription = require('../models/Subscription');

// ── requireActiveSubscription ─────────────────────────────────────────────────
// Run AFTER protect() on any route that creates or reads clinical notes.
// Attaches req.subscription — does NOT block free tier users.
async function requireActiveSubscription(req, res, next) {
  try {
    let sub = await Subscription.findOne({ user: req.user.id });

    // New user — create free tier automatically
    if (!sub) {
      sub = await Subscription.create({ user: req.user.id, plan: 'free', status: 'free' });
    }

    // Auto-expire stale trials
    if (sub.status === 'trialing' && sub.trialEnd && sub.trialEnd < new Date()) {
      sub.status = 'expired';
      sub.plan   = 'free';
      await sub.save();
    }

    // Hard block only fully expired accounts
    if (sub.status === 'expired' && sub.plan === 'free') {
      return res.status(402).json({
        success:    false,
        message:    'Subscription expired. Please renew to continue.',
        upgrade:    true,
        upgradeUrl: '/api/v1/payments/checkout',
      });
    }

    req.subscription = sub;
    next();
  } catch (err) {
    console.error('[Subscription] requireActiveSubscription:', err.name);
    // Fail open — never block doctors from the app due to our own errors
    next();
  }
}

// ── requireNoteQuota ──────────────────────────────────────────────────────────
// Enforces per-plan note limits. Run AFTER requireActiveSubscription.
// Increments free tier counter when note is created successfully.
async function requireNoteQuota(req, res, next) {
  try {
    const sub = req.subscription;
    if (!sub) return next(); // fail open if subscription missing

    const check = sub.canCreateNote();

    if (!check.allowed) {
      return res.status(402).json({
        success:    false,
        message:    check.reason,
        upgrade:    check.upgrade || false,
        upgradeUrl: '/api/v1/payments/checkout',
        plan:       sub.plan,
        notesUsed:  sub.notesThisMonth,
        limit:      Subscription.PLANS?.free?.notesPerMonth || 5,
      });
    }

    // Warn header for approaching limits or billing issues
    if (check.warning) {
      res.set('X-Subscription-Warning', check.warning);
    }

    // Only increment counter for free tier — paid plans are unlimited
    if (sub.plan === 'free') {
      sub._resetMonthlyCountIfNeeded();
      sub.notesThisMonth += 1;
      await sub.save();
    }

    req.subscription = sub;
    next();
  } catch (err) {
    console.error('[Subscription] requireNoteQuota:', err.name);
    next(); // fail open
  }
}

// ── requirePlan(...plans) ─────────────────────────────────────────────────────
// Gate a specific route to one or more plan tiers.
// Run AFTER requireActiveSubscription.
// Example: router.get('/ehr', protect, requireActiveSubscription, requirePlan('clinic','enterprise'), handler)
function requirePlan(...plans) {
  return (req, res, next) => {
    const sub = req.subscription;
    // Allow trialing users on ANY plan to access all features
    if (sub?.status === 'trialing') return next();

    if (!sub || !plans.includes(sub.plan)) {
      return res.status(403).json({
        success:     false,
        message:     `This feature requires a ${plans.join(' or ')} plan.`,
        currentPlan: sub?.plan || 'free',
        upgrade:     true,
        upgradeUrl:  '/api/v1/payments/checkout',
      });
    }
    next();
  };
}

module.exports = { requireActiveSubscription, requireNoteQuota, requirePlan };
