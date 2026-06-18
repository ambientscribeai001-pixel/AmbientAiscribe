// routes/subscriptions.js
// ─── Subscription Routes · AmbientScribe ─────────────────────────────────────
// These are the routes the frontend calls constantly:
//   - Before every note: GET /check (can this user create a note?)
//   - On dashboard load: GET /me (show plan badge and usage)
//   - On pricing page:   GET /plans (public — no auth)
'use strict';

const express      = require('express');
const { protect }  = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const Note         = require('../models/Note');

const router = express.Router();

// ── All subscription routes require auth except /plans ────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/subscriptions/check
// Called by the frontend BEFORE running the Claude pipeline.
// Returns whether the user can create a note right now.
// Fast — single DB read, no Claude calls.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/check', protect, async (req, res) => {
  try {
    let sub = await Subscription.findOne({ user: req.user.id });

    // Auto-create free tier for new users
    if (!sub) {
      sub = await Subscription.create({ user: req.user.id, plan: 'free', status: 'free' });
    }

    // Auto-expire trials
    if (sub.status === 'trialing' && sub.trialEnd && sub.trialEnd < new Date()) {
      sub.status = 'expired';
      sub.plan   = 'free';
      await sub.save();
    }

    const result = sub.canCreateNote();

    return res.status(result.allowed ? 200 : 402).json({
      success:  result.allowed,
      allowed:  result.allowed,
      plan:     sub.plan,
      status:   sub.status,
      trial:    result.trial || false,
      warning:  result.warning || null,
      reason:   result.reason  || null,
      upgrade:  result.upgrade || false,
      upgradeUrl: result.upgrade ? '/api/v1/payments/checkout' : null,
      // For free tier — show usage
      ...(sub.plan === 'free' ? {
        notesUsed:  sub.notesThisMonth,
        notesLimit: Subscription.PLANS.free.notesPerMonth,
        notesLeft:  Math.max(0, Subscription.PLANS.free.notesPerMonth - sub.notesThisMonth),
      } : {}),
    });
  } catch (err) {
    console.error('[Subscriptions] /check error:', err.name);
    // Fail open in production — don't block doctors from documenting
    // if our subscription check itself crashes
    return res.status(200).json({
      success: true,
      allowed: true,
      warning: 'Subscription check unavailable — proceeding.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/subscriptions/me
// Full subscription details for the settings / account page.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    let sub = await Subscription.findOne({ user: req.user.id });
    if (!sub) {
      sub = await Subscription.create({ user: req.user.id, plan: 'free', status: 'free' });
    }

    const PLANS = Subscription.PLANS;
    const planInfo = PLANS[sub.plan] || PLANS.free;

    // Count total notes for this doctor
    const [totalNotes, signedNotes] = await Promise.all([
      Note.countDocuments({ doctor: req.user.id }),
      Note.countDocuments({ doctor: req.user.id, status: 'signed' }),
    ]);

    let trialDaysLeft = null;
    if (sub.status === 'trialing' && sub.trialEnd) {
      trialDaysLeft = Math.max(0, Math.ceil((sub.trialEnd - new Date()) / (1000 * 60 * 60 * 24)));
    }

    let periodDaysLeft = null;
    if (sub.currentPeriodEnd) {
      periodDaysLeft = Math.max(0, Math.ceil((sub.currentPeriodEnd - new Date()) / (1000 * 60 * 60 * 24)));
    }

    return res.status(200).json({
      success: true,
      subscription: {
        plan:             sub.plan,
        planName:         planInfo.name,
        status:           sub.status,
        billingCycle:     sub.billingCycle,
        monthlyPrice:     planInfo.priceMonthly,
        annualPrice:      planInfo.priceAnnual,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd:   sub.currentPeriodEnd,
        periodDaysLeft,
        trialStart:       sub.trialStart,
        trialEnd:         sub.trialEnd,
        trialDaysLeft,
        trialUsed:        sub.trialUsed,
        cancelledAt:      sub.cancelledAt,
        notesThisMonth:   sub.notesThisMonth,
        notesLimit:       planInfo.notesPerMonth === Infinity ? null : planInfo.notesPerMonth,
        features:         planInfo.features,
      },
      usage: {
        totalNotes,
        signedNotes,
        draftNotes: totalNotes - signedNotes,
      },
    });
  } catch (err) {
    console.error('[Subscriptions] /me error:', err.name);
    return res.status(500).json({ success: false, message: 'Could not fetch subscription details.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/subscriptions/plans
// Public — no auth required. Returns all plan details for the pricing page.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plans', (req, res) => {
  return res.status(200).json({
    success:  true,
    currency: process.env.PAYSTACK_CURRENCY || 'USD',
    plans:    Subscription.PLANS,
  });
});

module.exports = router;
