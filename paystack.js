// webhooks/paystack.js
// ─── Paystack Webhook Handler · AmbientScribe ─────────────────────────────────
// Paystack POSTs signed events here for every billing lifecycle event.
// This is how your DB stays in sync with what Paystack actually charged.
'use strict';

const crypto       = require('crypto');
const express      = require('express');
const User         = require('../models/User');
const Subscription = require('../models/Subscription');

const router = express.Router();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// ── Signature verification ────────────────────────────────────────────────────
// IMPORTANT: this route must receive the RAW body (not JSON-parsed).
// In server.js, mount BEFORE express.json() middleware, or use express.raw() here.
function verifyPaystackSignature(req, res, next) {
  const signature = req.headers['x-paystack-signature'];
  if (!signature) {
    return res.status(400).json({ message: 'Missing Paystack signature.' });
  }

  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(req.body) // req.body must be raw Buffer here
    .digest('hex');

  if (hash !== signature) {
    console.warn('[Webhook] Invalid Paystack signature — possible spoofed request.');
    return res.status(401).json({ message: 'Invalid signature.' });
  }

  // Parse body now that signature is verified
  try {
    req.paystackEvent = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ message: 'Invalid JSON body.' });
  }

  next();
}

// ── Map Paystack plan codes back to our tier names ────────────────────────────
function planFromCode(planCode) {
  if (planCode === process.env.PAYSTACK_PRO_PLAN_CODE)        return 'pro';
  if (planCode === process.env.PAYSTACK_ENTERPRISE_PLAN_CODE) return 'enterprise';
  return 'free';
}

// ── Upsert subscription helper ────────────────────────────────────────────────
async function upsertSubscription(userId, updates) {
  return Subscription.findOneAndUpdate(
    { user: userId },
    { $set: updates },
    { upsert: true, new: true }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/webhooks/paystack
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/',
  express.raw({ type: 'application/json' }), // raw body for HMAC verification
  verifyPaystackSignature,
  async (req, res) => {
    // Always respond 200 immediately — Paystack retries if it doesn't get one
    res.status(200).json({ received: true });

    const event = req.paystackEvent;
    const data  = event?.data;

    console.log(`[Webhook] Paystack event received: ${event.event}`);

    try {
      switch (event.event) {

        // ── New subscription created (after checkout) ─────────────────────
        case 'subscription.create': {
          const email = data.customer?.email;
          if (!email) break;

          const user = await User.findOne({ email: email.toLowerCase() });
          if (!user) { console.warn('[Webhook] subscription.create: user not found for', email); break; }

          await upsertSubscription(user._id, {
            plan:                    planFromCode(data.plan?.plan_code),
            status:                  'active',
            paystackCustomerId:      data.customer?.customer_code,
            paystackSubscriptionId:  data.id?.toString(),
            paystackSubscriptionCode: data.subscription_code,
            paystackEmailToken:      data.email_token,
            currentPeriodStart:      new Date(data.created_at),
            currentPeriodEnd:        new Date(data.next_payment_date),
          });

          console.log(`[Webhook] Subscription activated for ${email} → ${planFromCode(data.plan?.plan_code)}`);
          break;
        }

        // ── Successful recurring charge ───────────────────────────────────
        case 'charge.success': {
          if (data.plan?.plan_code) {
            const email = data.customer?.email;
            if (!email) break;
            const user = await User.findOne({ email: email.toLowerCase() });
            if (!user) break;

            await upsertSubscription(user._id, {
              status:           'active',
              currentPeriodEnd: new Date(data.paid_at
                ? new Date(data.paid_at).getTime() + 30 * 24 * 60 * 60 * 1000
                : Date.now()  + 30 * 24 * 60 * 60 * 1000
              ),
            });
            console.log(`[Webhook] Renewal confirmed for ${email}`);
          }
          break;
        }

        // ── Payment failed ────────────────────────────────────────────────
        case 'invoice.payment_failed': {
          const email = data.customer?.email;
          if (!email) break;
          const user = await User.findOne({ email: email.toLowerCase() });
          if (!user) break;

          await upsertSubscription(user._id, { status: 'past_due' });
          console.log(`[Webhook] Payment failed for ${email} — marked past_due`);
          // TODO: trigger email to doctor via SendGrid/Resend
          break;
        }

        // ── Subscription disabled / cancelled ─────────────────────────────
        case 'subscription.disable': {
          const subscriptionCode = data.subscription_code;
          if (!subscriptionCode) break;

          const sub = await Subscription.findOne({
            paystackSubscriptionCode: subscriptionCode,
          });
          if (!sub) break;

          sub.status      = 'cancelled';
          sub.cancelledAt = new Date();
          // Keep currentPeriodEnd — they still have access until that date
          await sub.save();
          console.log(`[Webhook] Subscription cancelled: ${subscriptionCode}`);
          break;
        }

        // ── Subscription fully expired ────────────────────────────────────
        case 'subscription.expiry_reminder':
          // No DB change needed — just log. Could trigger reminder email here.
          console.log(`[Webhook] Expiry reminder for subscription: ${data.subscription_code}`);
          break;

        default:
          console.log(`[Webhook] Unhandled event type: ${event.event} — ignoring.`);
      }
    } catch (err) {
      // Don't re-throw — we already sent 200. Log for investigation.
      console.error('[Webhook] Handler error:', err.name, err.message);
    }
  }
);

module.exports = router;
