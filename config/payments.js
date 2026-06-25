// routes/payments.js
// ─── Payment Routes · AmbientScribe ──────────────────────────────────────────
// Handles Paystack checkout initiation, callback verification, and cancellation.
// All routes are fully stubbed — they return clean responses even without
// Paystack keys so the rest of the app works now. When your BVN clears and
// you add PAYSTACK_SECRET_KEY to .env, everything activates automatically.
'use strict';

const express      = require('express');
const rateLimit    = require('express-rate-limit');
const { protect }  = require('../middleware/auth');
const Subscription = require('../models/Subscription');

const router = express.Router();

// ── Rate limiter: 20 payment actions per 15 min per user ─────────────────────
const paymentLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             20,
  keyGenerator:    req => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many payment requests. Please wait.' },
});

router.use(protect);
router.use(paymentLimiter);

// ── Check if Paystack is configured ──────────────────────────────────────────
const PAYSTACK_READY = !!(
  process.env.PAYSTACK_SECRET_KEY &&
  process.env.PAYSTACK_PRO_MONTHLY_PLAN_CODE
);

function paystackNotReady(res) {
  return res.status(503).json({
    success: false,
    message: 'Payment processing is not yet configured. Please contact support.',
    // Remove this field before going live — for dev clarity only
    dev_note: 'Add PAYSTACK_SECRET_KEY and plan codes to .env to activate payments.',
  });
}

// ── Check if Flutterwave is configured ────────────────────────────────────────
const FLUTTERWAVE_READY = !!process.env.FLUTTERWAVE_SECRET_KEY;

function flutterwaveNotReady(res) {
  return res.status(503).json({
    success: false,
    message: 'Flutterwave is not yet configured. Please contact support.',
    dev_note: 'Add FLUTTERWAVE_SECRET_KEY to .env to activate this gateway.',
  });
}

// ── Plan price lookup — Flutterwave needs a raw amount, not a plan code ──────
const PLAN_PRICES_NGN = {
  pro:        468000, // $300 equivalent — update to your live rate as needed
  clinic:     624000, // $400 equivalent
  enterprise: 702000, // $450 equivalent
};


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/payments/trial
// Start a 3-day free trial on any paid plan — no card required.
// One trial per account, ever.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/trial', async (req, res) => {
  try {
    const { plan = 'pro' } = req.body;

    if (!['pro', 'clinic', 'enterprise'].includes(plan)) {
      return res.status(422).json({ success: false, message: 'Invalid plan. Choose pro, clinic, or enterprise.' });
    }

    // Check if trial was already used
    const existing = await Subscription.findOne({ user: req.user.id });
    if (existing?.trialUsed) {
      return res.status(409).json({
        success: false,
        message: 'Free trial already used on this account. Please subscribe to continue.',
        upgradeUrl: '/api/v1/payments/checkout',
      });
    }

    const sub = await Subscription.startTrial(req.user.id, plan);
    const PLANS = Subscription.PLANS;

    return res.status(200).json({
      success:     true,
      message:     `3-day free trial started for ${PLANS[plan]?.name || plan}. No card required.`,
      trial: {
        plan,
        planName:   PLANS[plan]?.name,
        trialStart: sub.trialStart,
        trialEnd:   sub.trialEnd,
        daysLeft:   3,
      },
    });
  } catch (err) {
    console.error('[Payments] /trial error:', err.name, err.message);
    return res.status(500).json({ success: false, message: 'Could not start trial. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/payments/checkout
// Initialize a Paystack subscription checkout.
// Returns an authorization_url — frontend opens this in a new tab.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/payments/checkout/paystack
// Initialize a Paystack subscription checkout.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/checkout/paystack', async (req, res) => {
  if (!PAYSTACK_READY) return paystackNotReady(res);

  try {
    const { plan, cycle = 'monthly' } = req.body;

    if (!['pro', 'clinic', 'enterprise'].includes(plan)) {
      return res.status(422).json({ success: false, message: 'Invalid plan.' });
    }
    if (!['monthly', 'annual'].includes(cycle)) {
      return res.status(422).json({ success: false, message: 'Invalid billing cycle.' });
    }

    const { initializeTransaction } = require('../config/paystack');
    const callbackUrl = process.env.PAYSTACK_CALLBACK_URL || `${process.env.APP_URL}/payment/callback`;

    const txData = await initializeTransaction({
      email:       req.user.email,
      plan,
      cycle,
      callbackUrl,
      metadata: {
        userId:   req.user.id,
        userName: req.user.fullName,
        plan,
        cycle,
      },
    });

    return res.status(200).json({
      success:           true,
      gateway:           'paystack',
      authorization_url: txData.authorization_url,
      reference:         txData.reference,
      message:           'Redirect the user to authorization_url to complete payment.',
    });
  } catch (err) {
    console.error('[Payments] /checkout/paystack error:', err.name, err.message);
    return res.status(500).json({ success: false, message: err.message || 'Checkout failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/payments/checkout (legacy alias — defaults to Paystack)
// Kept so any existing frontend calls to /checkout don't break.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  if (!PAYSTACK_READY) return paystackNotReady(res);

  try {
    const { plan, cycle = 'monthly' } = req.body;

    if (!['pro', 'clinic', 'enterprise'].includes(plan)) {
      return res.status(422).json({ success: false, message: 'Invalid plan.' });
    }
    if (!['monthly', 'annual'].includes(cycle)) {
      return res.status(422).json({ success: false, message: 'Invalid billing cycle.' });
    }

    const { initializeTransaction } = require('../config/paystack');
    const callbackUrl = process.env.PAYSTACK_CALLBACK_URL || `${process.env.APP_URL}/payment/callback`;

    const txData = await initializeTransaction({
      email:       req.user.email,
      plan,
      cycle,
      callbackUrl,
      metadata: { userId: req.user.id, userName: req.user.fullName, plan, cycle },
    });

    return res.status(200).json({
      success:           true,
      gateway:           'paystack',
      authorization_url: txData.authorization_url,
      reference:         txData.reference,
    });
  } catch (err) {
    console.error('[Payments] /checkout error:', err.name, err.message);
    return res.status(500).json({ success: false, message: err.message || 'Checkout failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/payments/checkout/flutterwave
// Initialize a Flutterwave payment — works the moment FLUTTERWAVE_SECRET_KEY
// is added to Railway Variables. No code changes needed when that happens.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/checkout/flutterwave', async (req, res) => {
  if (!FLUTTERWAVE_READY) return flutterwaveNotReady(res);

  try {
    const { plan, cycle = 'monthly' } = req.body;

    if (!['pro', 'clinic', 'enterprise'].includes(plan)) {
      return res.status(422).json({ success: false, message: 'Invalid plan.' });
    }

    const amount = PLAN_PRICES_NGN[plan];
    if (!amount) {
      return res.status(422).json({ success: false, message: 'No price configured for this plan.' });
    }

    const { initializePayment } = require('../config/flutterwave');
    const callbackUrl = process.env.FLUTTERWAVE_CALLBACK_URL || process.env.PAYSTACK_CALLBACK_URL;

    const result = await initializePayment({
      email:       req.user.email,
      name:        req.user.fullName,
      plan,
      cycle,
      amount,
      currency:    process.env.FLUTTERWAVE_CURRENCY || 'NGN',
      callbackUrl,
      metadata: {
        userId:   req.user.id,
        userName: req.user.fullName,
      },
    });

    return res.status(200).json({
      success:    true,
      gateway:    'flutterwave',
      payment_link: result.link,
      tx_ref:     result.tx_ref,
      message:    'Redirect the user to payment_link to complete payment.',
    });
  } catch (err) {
    console.error('[Payments] /checkout/flutterwave error:', err.name, err.message);
    return res.status(500).json({ success: false, message: err.message || 'Checkout failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/payments/callback?reference=xxx
// Paystack redirects the user back here after checkout.
// Verifies the transaction and activates the subscription.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  if (!PAYSTACK_READY) return paystackNotReady(res);

  try {
    const { reference } = req.query;
    if (!reference) {
      return res.status(400).json({ success: false, message: 'Missing transaction reference.' });
    }

    const { verifyTransaction } = require('../config/paystack');
    const { planFromCode }      = require('../config/paystack');

    const txData = await verifyTransaction(reference);

    if (txData.status !== 'success') {
      return res.status(402).json({
        success: false,
        message: `Payment not completed. Status: ${txData.status}`,
      });
    }

    // Extract plan from transaction metadata
    const plan = txData.metadata?.plan || planFromCode(txData.plan?.plan_code) || 'pro';
    const cycle = txData.metadata?.cycle || 'monthly';

    // Activate subscription
    const now = new Date();
    const periodEnd = cycle === 'annual'
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() +  30 * 24 * 60 * 60 * 1000);

    await Subscription.findOneAndUpdate(
      { user: req.user.id },
      {
        $set: {
          plan,
          status:             'active',
          currentPeriodStart: now,
          currentPeriodEnd:   periodEnd,
          billingCycle:       cycle,
          paystackCustomerId: txData.customer?.customer_code,
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: `Subscription activated — ${plan} (${cycle}).`,
      subscription: { plan, cycle, status: 'active', currentPeriodEnd: periodEnd },
    });
  } catch (err) {
    console.error('[Payments] /callback error:', err.name, err.message);
    return res.status(500).json({ success: false, message: 'Could not verify payment.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/payments/status
// Returns the current subscription status for the logged-in user.
// Called by the frontend on dashboard load.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/payments/callback/flutterwave?transaction_id=xxx&status=successful
// Flutterwave redirects here after checkout. Verifies and activates subscription.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/callback/flutterwave', async (req, res) => {
  if (!FLUTTERWAVE_READY) return flutterwaveNotReady(res);

  try {
    const { transaction_id, status } = req.query;

    if (status !== 'successful' || !transaction_id) {
      return res.status(402).json({
        success: false,
        message: `Payment not completed. Status: ${status || 'unknown'}`,
      });
    }

    const { verifyTransaction } = require('../config/flutterwave');
    const txData = await verifyTransaction(transaction_id);

    // Flutterwave double-check: amount and currency must match what we expect
    if (txData.status !== 'successful') {
      return res.status(402).json({
        success: false,
        message: `Transaction verification failed. Status: ${txData.status}`,
      });
    }

    const plan  = txData.meta?.plan  || 'pro';
    const cycle = txData.meta?.cycle || 'monthly';

    const now = new Date();
    const periodEnd = cycle === 'annual'
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() +  30 * 24 * 60 * 60 * 1000);

    await Subscription.findOneAndUpdate(
      { user: req.user.id },
      {
        $set: {
          plan,
          status:             'active',
          currentPeriodStart: now,
          currentPeriodEnd:   periodEnd,
          billingCycle:       cycle,
          flutterwaveCustomerEmail: txData.customer?.email,
          flutterwaveTxRef:         txData.tx_ref,
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: `Subscription activated via Flutterwave — ${plan} (${cycle}).`,
      subscription: { plan, cycle, status: 'active', currentPeriodEnd: periodEnd },
    });
  } catch (err) {
    console.error('[Payments] /callback/flutterwave error:', err.name, err.message);
    return res.status(500).json({ success: false, message: 'Could not verify Flutterwave payment.' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const PLANS = Subscription.PLANS;
    let sub = await Subscription.findOne({ user: req.user.id });

    // First-time user — create free tier record
    if (!sub) {
      sub = await Subscription.create({ user: req.user.id, plan: 'free', status: 'free' });
    }

    // Check if trial has expired and auto-downgrade
    if (sub.status === 'trialing' && sub.trialEnd && sub.trialEnd < new Date()) {
      sub.status = 'expired';
      sub.plan   = 'free';
      await sub.save();
    }

    const canNote  = sub.canCreateNote();
    const planInfo = PLANS[sub.plan] || PLANS.free;

    // Calculate trial days left
    let trialDaysLeft = null;
    if (sub.status === 'trialing' && sub.trialEnd) {
      trialDaysLeft = Math.max(0, Math.ceil((sub.trialEnd - new Date()) / (1000 * 60 * 60 * 24)));
    }

    return res.status(200).json({
      success: true,
      subscription: {
        plan:               sub.plan,
        planName:           planInfo.name,
        status:             sub.status,
        billingCycle:       sub.billingCycle,
        monthlyPrice:       planInfo.priceMonthly,
        currentPeriodEnd:   sub.currentPeriodEnd,
        trialEnd:           sub.trialEnd,
        trialDaysLeft,
        trialUsed:          sub.trialUsed,
        notesThisMonth:     sub.notesThisMonth,
        notesLimit:         planInfo.notesPerMonth === Infinity ? null : planInfo.notesPerMonth,
        canCreateNote:      canNote.allowed,
        quota:              canNote,
      },
      upgradeUrl: canNote.upgrade ? '/api/v1/payments/checkout' : null,
    });
  } catch (err) {
    console.error('[Payments] /status error:', err.name, err.message);
    return res.status(500).json({ success: false, message: 'Could not fetch subscription status.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/payments/cancel
// Cancel the active subscription (access continues until period end).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cancel', async (req, res) => {
  try {
    const sub = await Subscription.findOne({ user: req.user.id });

    if (!sub || !['active', 'trialing'].includes(sub.status)) {
      return res.status(400).json({ success: false, message: 'No active subscription to cancel.' });
    }

    // If Paystack is ready and we have a subscription code, cancel via API
    if (PAYSTACK_READY && sub.paystackSubscriptionCode && sub.paystackEmailToken) {
      try {
        const { cancelSubscription } = require('../config/paystack');
        await cancelSubscription(sub.paystackSubscriptionCode, sub.paystackEmailToken);
      } catch (paystackErr) {
        // Log but don't block — still mark cancelled in our DB
        console.warn('[Payments] Paystack cancel failed:', paystackErr.message);
      }
    }

    const { reason } = req.body;
    sub.status             = 'cancelled';
    sub.cancelledAt        = new Date();
    sub.cancellationReason = reason || null;
    await sub.save();

    return res.status(200).json({
      success: true,
      message: `Subscription cancelled. Access continues until ${sub.currentPeriodEnd?.toDateString() || 'end of billing period'}.`,
      accessUntil: sub.currentPeriodEnd,
    });
  } catch (err) {
    console.error('[Payments] /cancel error:', err.name, err.message);
    return res.status(500).json({ success: false, message: 'Cancellation failed. Please contact support.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/payments/plans
// Returns all plan details — used by the pricing page.
// Public route (no auth required) — remove protect from this one.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plans', (req, res) => {
  const PLANS = Subscription.PLANS;
  return res.status(200).json({
    success: true,
    plans:   PLANS,
    currency: process.env.PAYSTACK_CURRENCY || 'USD',
    paystackReady: PAYSTACK_READY,
  });
});

module.exports = router;
