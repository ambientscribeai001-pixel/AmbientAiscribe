// models/Subscription.js
// ─── Subscription Schema · AmbientScribe ─────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

// ── PLAN DEFINITIONS (single source of truth) ─────────────────────────────────
const PLANS = {
  free: {
    name:           'Free',
    priceMonthly:   0,
    notesPerMonth:  5,      // 5 notes/month on free tier
    trialDays:      0,
    features:       ['5 notes/month', 'SOAP generation', 'Basic CMO audit', 'Copy-paste export'],
  },
  pro: {
    name:           'Clinical Pro',
    priceMonthly:   300,    // $300/month
    priceAnnual:    2880,   // $240/month billed annually (20% off)
    notesPerMonth:  Infinity,
    trialDays:      3,      // 3-day free trial
    features:       [
      'Unlimited notes',
      'Full 5-pass AI pipeline',
      'CMO safety audit — allergy & diagnosis conflict detection',
      'CPT billing codes',
      'Clinical decision support',
      'Note quality scoring',
      'Style learning engine',
      '6 specialty templates',
      'Referral letter generator',
      'Take-home patient instructions',
      'Multi-language (35+)',
      'EHR copy-paste export',
      'Batch end-of-shift signing',
    ],
  },
  clinic: {
    name:           'Clinic',
    priceMonthly:   400,    // $400/month — per provider, billed at clinic level
    priceAnnual:    3840,   // $320/month billed annually
    notesPerMonth:  Infinity,
    trialDays:      3,
    features:       [
      'Everything in Clinical Pro',
      'Up to 10 providers',
      'Shared session history across team',
      'Clinic-wide analytics dashboard',
      'Custom note templates per provider',
      'Priority support',
      'Bulk provider onboarding',
      'Monthly billing report',
    ],
  },
  enterprise: {
    name:           'Enterprise',
    priceMonthly:   450,    // $450/provider/month — custom contracts
    priceAnnual:    null,   // negotiated annually
    notesPerMonth:  Infinity,
    trialDays:      3,
    features:       [
      'Everything in Clinic',
      'Unlimited providers',
      'Direct EHR push (Epic / Cerner via FHIR R4)',
      'SSO & SAML',
      'SOC 2 Type II BAA',
      'Dedicated onboarding & implementation',
      'Custom specialty AI tuning',
      'Immutable audit logs & compliance reports',
      'SLA 99.9% uptime guarantee',
      'Volume pricing & annual contracts',
      'White-label option',
    ],
  },
};

const SubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      unique:   true,
      index:    true,
    },

    // ── Plan tier ──────────────────────────────────────────────────────────
    plan: {
      type:    String,
      enum:    ['free', 'pro', 'clinic', 'enterprise'],
      default: 'free',
    },

    // ── Status ────────────────────────────────────────────────────────────
    // trialing  → within 3-day free trial (Pro/Clinic/Enterprise)
    // active    → paid and within billing period
    // past_due  → payment failed, 3-day grace period
    // cancelled → user cancelled, access until currentPeriodEnd
    // expired   → access fully ended
    // free      → on permanent free tier
    status: {
      type:    String,
      enum:    ['trialing', 'active', 'past_due', 'cancelled', 'expired', 'free'],
      default: 'free',
    },

    // ── Paystack identifiers ───────────────────────────────────────────────
    paystackCustomerId:       { type: String, default: null },
    paystackSubscriptionId:   { type: String, default: null },
    paystackSubscriptionCode: { type: String, default: null },
    paystackEmailToken:       { type: String, default: null },

    // ── Billing period ─────────────────────────────────────────────────────
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd:   { type: Date, default: null },
    billingCycle:       { type: String, enum: ['monthly', 'annual'], default: 'monthly' },

    // ── 3-day trial ────────────────────────────────────────────────────────
    trialStart:    { type: Date, default: null },
    trialEnd:      { type: Date, default: null },
    trialUsed:     { type: Boolean, default: false }, // prevent repeat trials

    // ── Free tier usage tracking ───────────────────────────────────────────
    notesThisMonth:    { type: Number, default: 0 },
    notesMonthResetAt: { type: Date,   default: null },

    // ── Cancellation ──────────────────────────────────────────────────────
    cancelledAt:        { type: Date,   default: null },
    cancellationReason: { type: String, default: null },
  },
  { timestamps: true }
);

// ── Static: expose plan definitions to the rest of the app ───────────────────
SubscriptionSchema.statics.PLANS = PLANS;

// ── Method: is the user within their active 3-day trial? ─────────────────────
SubscriptionSchema.methods.isInTrial = function () {
  return this.status === 'trialing' && this.trialEnd && this.trialEnd > new Date();
};

// ── Method: is the account locked? ───────────────────────────────────────────
SubscriptionSchema.methods.isLocked = function () {
  return ['expired'].includes(this.status);
};

// ── Method: can this user create a note right now? ───────────────────────────
SubscriptionSchema.methods.canCreateNote = function () {
  const plan = this.plan;
  const status = this.status;

  // ── Trialing: 3-day full access on any paid plan ──────────────────────
  if (this.isInTrial()) {
    return { allowed: true, trial: true };
  }

  // ── Active paid plans: unlimited ──────────────────────────────────────
  if (['pro', 'clinic', 'enterprise'].includes(plan) && status === 'active') {
    return { allowed: true };
  }

  // ── Past due: 3-day grace period, still allow with warning ────────────
  if (status === 'past_due') {
    return {
      allowed: true,
      warning: 'Payment overdue. Update your billing details to avoid interruption.',
    };
  }

  // ── Cancelled but within paid period ─────────────────────────────────
  if (status === 'cancelled' && this.currentPeriodEnd && this.currentPeriodEnd > new Date()) {
    const daysLeft = Math.ceil((this.currentPeriodEnd - new Date()) / (1000 * 60 * 60 * 24));
    return {
      allowed: true,
      warning: `Subscription cancelled. Access ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`,
    };
  }

  // ── Free tier: 5 notes/month cap ──────────────────────────────────────
  if (plan === 'free' || status === 'free') {
    this._resetMonthlyCountIfNeeded();
    const limit = PLANS.free.notesPerMonth;
    if (this.notesThisMonth >= limit) {
      return {
        allowed:    false,
        reason:     `Free plan limit reached (${limit} notes/month). Start your 3-day free trial of Clinical Pro — no card required for the first 3 days.`,
        upgrade:    true,
        upgradeUrl: '/pricing',
      };
    }
    return {
      allowed:      true,
      notesUsed:    this.notesThisMonth,
      notesLimit:   limit,
      notesLeft:    limit - this.notesThisMonth,
    };
  }

  // ── Fully expired ─────────────────────────────────────────────────────
  return {
    allowed:    false,
    reason:     'Your subscription has expired. Renew to continue documenting.',
    upgrade:    true,
    upgradeUrl: '/pricing',
  };
};

// ── Method: reset monthly counter when calendar month rolls over ──────────────
SubscriptionSchema.methods._resetMonthlyCountIfNeeded = function () {
  const now = new Date();
  const r   = this.notesMonthResetAt;
  if (!r || now.getMonth() !== r.getMonth() || now.getFullYear() !== r.getFullYear()) {
    this.notesThisMonth    = 0;
    this.notesMonthResetAt = now;
  }
};

// ── Static: start a 3-day trial for a user ────────────────────────────────────
SubscriptionSchema.statics.startTrial = async function (userId, plan = 'pro') {
  const now      = new Date();
  const trialEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days

  return this.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        plan,
        status:     'trialing',
        trialStart: now,
        trialEnd,
        trialUsed:  true,
      },
    },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model('Subscription', SubscriptionSchema);
