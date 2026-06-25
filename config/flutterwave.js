// config/flutterwave.js
// ─── Flutterwave API Service · AmbientScribe ─────────────────────────────────
// All Flutterwave HTTP calls go through this module.
// Keys are read ONLY from process.env — never hardcoded, never logged in full.
'use strict';

const https = require('https');

const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

if (!FLW_SECRET) {
  console.warn('[Flutterwave] WARNING: FLUTTERWAVE_SECRET_KEY not set. Flutterwave routes will fail.');
}

const BASE_URL = 'api.flutterwave.com';

// ── Plan pricing reference (Flutterwave uses one-time tx + tx_ref for subs) ──
// Unlike Paystack's plan-code model, Flutterwave subscriptions are typically
// built as: initialize a payment_plan via dashboard, OR charge one-time and
// track renewal yourself. We use payment_plan IDs from your dashboard.
const PLAN_IDS = {
  pro_monthly:        process.env.FLW_PRO_MONTHLY_PLAN_ID        || null,
  clinic_monthly:     process.env.FLW_CLINIC_MONTHLY_PLAN_ID     || null,
  enterprise_monthly: process.env.FLW_ENTERPRISE_MONTHLY_PLAN_ID || null,
};

// ── Core HTTP helper ──────────────────────────────────────────────────────────
function flwRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: BASE_URL,
      port:     443,
      path,
      method,
      headers: {
        Authorization:  `Bearer ${FLW_SECRET}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === 'error') {
            reject(new Error(parsed.message || 'Flutterwave API error'));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error('Invalid JSON from Flutterwave'));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Initialize a payment (one-time OR subscription via payment_plan) ─────────
// Returns { link, tx_ref } — frontend redirects user to `link`.
async function initializePayment({ email, name, plan, cycle = 'monthly', amount, currency, callbackUrl, metadata = {} }) {
  const tx_ref = `AMB-${plan}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const body = {
    tx_ref,
    amount:        amount,              // numeric amount, no kobo conversion needed for Flutterwave
    currency:      currency || process.env.FLUTTERWAVE_CURRENCY || 'NGN',
    redirect_url:  callbackUrl || process.env.FLUTTERWAVE_CALLBACK_URL,
    customer: {
      email,
      name: name || 'AmbientScribe User',
    },
    customizations: {
      title:       'AmbientScribe AI',
      description: `${plan} plan — ${cycle} billing`,
      logo:        process.env.APP_LOGO_URL || undefined,
    },
    meta: { plan, cycle, ...metadata },
  };

  // If a payment_plan ID exists for this plan/cycle, attach it for recurring billing
  const planKey = `${plan}_${cycle}`;
  if (PLAN_IDS[planKey]) {
    body.payment_plan = PLAN_IDS[planKey];
  }

  const response = await flwRequest('POST', '/v3/payments', body);
  return { link: response.data.link, tx_ref };
}

// ── Verify a transaction after redirect ───────────────────────────────────────
async function verifyTransaction(transactionId) {
  const response = await flwRequest('GET', `/v3/transactions/${encodeURIComponent(transactionId)}/verify`);
  return response.data;
}

// ── Verify by tx_ref (alternative lookup) ─────────────────────────────────────
async function verifyByReference(tx_ref) {
  const response = await flwRequest('GET', `/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(tx_ref)}`);
  return response.data;
}

// ── Cancel a subscription (payment plan) ──────────────────────────────────────
async function cancelSubscription(subscriptionId) {
  const response = await flwRequest('PUT', `/v3/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`);
  return response.data;
}

module.exports = {
  initializePayment,
  verifyTransaction,
  verifyByReference,
  cancelSubscription,
  PLAN_IDS,
};
