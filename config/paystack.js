// config/paystack.js
// ─── Paystack API Service · AmbientScribe ────────────────────────────────────
'use strict';

const https = require('https');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET) {
  console.warn('[Paystack] WARNING: PAYSTACK_SECRET_KEY not set. Payment routes will fail.');
}

const BASE_URL = 'api.paystack.co';

// ── Plan codes (set in .env, sourced from Paystack dashboard) ─────────────────
// Monthly plans — all amounts in NGN
const PLAN_CODES = {
  // Clinical Pro — ₦ equivalent of $300/month
  pro_monthly:        process.env.PAYSTACK_PRO_MONTHLY_PLAN_CODE        || 'PLN_bhwojzlyqlcjwpu',

  // Clinic — ₦ equivalent of $400/month
  clinic_monthly:     process.env.PAYSTACK_CLINIC_MONTHLY_PLAN_CODE     || 'PLN_e37xlb078c3t1y4',

  // Enterprise — ₦ equivalent of $450/month
  enterprise_monthly: process.env.PAYSTACK_ENTERPRISE_MONTHLY_PLAN_CODE || 'PLN_4udww3kyncpzxaz',

  // Annual plans — add codes when created in dashboard
  pro_annual:         process.env.PAYSTACK_PRO_ANNUAL_PLAN_CODE         || null,
  clinic_annual:      process.env.PAYSTACK_CLINIC_ANNUAL_PLAN_CODE      || null,
  enterprise_annual:  process.env.PAYSTACK_ENTERPRISE_ANNUAL_PLAN_CODE  || null,
};

// ── Pricing reference (for display only — actual amounts live in Paystack) ────
const PRICES_NGN = {
  pro:        { monthly: null, annual: null }, // pulled from Paystack dashboard
  clinic:     { monthly: null, annual: null },
  enterprise: { monthly: null, annual: null },
};

// ── Core HTTP helper ──────────────────────────────────────────────────────────
function paystackRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: BASE_URL,
      port:     443,
      path,
      method,
      headers: {
        Authorization:  `Bearer ${PAYSTACK_SECRET}`,
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
          if (!parsed.status) {
            reject(new Error(parsed.message || 'Paystack API error'));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error('Invalid JSON from Paystack'));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Resolve plan code from plan name + billing cycle ─────────────────────────
function resolvePlanCode(plan, cycle = 'monthly') {
  const key  = `${plan}_${cycle}`;
  const code = PLAN_CODES[key];

  if (!code) {
    // Annual plans not set up yet — fall back to monthly
    if (cycle === 'annual') {
      console.warn(`[Paystack] Annual plan code for ${plan} not configured. Falling back to monthly.`);
      return PLAN_CODES[`${plan}_monthly`];
    }
    throw new Error(
      `No Paystack plan code for: ${key}. ` +
      `Add PAYSTACK_${plan.toUpperCase()}_${cycle.toUpperCase()}_PLAN_CODE to .env`
    );
  }
  return code;
}

// ── Resolve plan tier name from a Paystack plan code ─────────────────────────
function planFromCode(planCode) {
  for (const [key, code] of Object.entries(PLAN_CODES)) {
    if (code && code === planCode) {
      return key.split('_')[0]; // "pro_monthly" → "pro"
    }
  }
  return 'free';
}

// ── Initialize a subscription checkout ───────────────────────────────────────
// Returns { authorization_url, access_code, reference }
// Frontend opens authorization_url — Paystack shows the customer a page with
// ALL enabled channels: Card, Bank Transfer, USSD, Mobile Money, QR.
// Channels are controlled in Paystack Dashboard → Settings → Preferences,
// but we also pass them explicitly here so checkout always offers the full set.
async function initializeTransaction({ email, plan, cycle = 'monthly', callbackUrl, metadata = {} }) {
  const planCode = resolvePlanCode(plan, cycle);

  const response = await paystackRequest('POST', '/transaction/initialize', {
    email,
    plan:         planCode,
    callback_url: callbackUrl || process.env.PAYSTACK_CALLBACK_URL,
    currency:     process.env.PAYSTACK_CURRENCY || 'NGN',
    // Offer every supported channel — customer picks on Paystack's page
    channels: ['card', 'bank', 'bank_transfer', 'ussd', 'qr', 'mobile_money'],
    metadata: {
      plan,
      cycle,
      custom_fields: [
        { display_name: 'Plan',    variable_name: 'plan',  value: plan  },
        { display_name: 'Billing', variable_name: 'cycle', value: cycle },
      ],
      ...metadata,
    },
  });

  return response.data;
}

// ── One-time payment (non-subscription) — for invoices, top-ups, USD billing ──
// Use this when you want a one-off charge instead of a recurring plan,
// e.g. an annual Enterprise contract invoice paid manually.
async function initializeOneTimePayment({ email, amount, currency, callbackUrl, metadata = {} }) {
  const response = await paystackRequest('POST', '/transaction/initialize', {
    email,
    amount:       Math.round(amount * 100), // Paystack expects amount in kobo/cents
    currency:     currency || process.env.PAYSTACK_CURRENCY || 'NGN',
    callback_url: callbackUrl || process.env.PAYSTACK_CALLBACK_URL,
    channels:     ['card', 'bank', 'bank_transfer', 'ussd', 'qr', 'mobile_money'],
    metadata,
  });
  return response.data;
}

// ── Verify a transaction after Paystack redirects back ────────────────────────
async function verifyTransaction(reference) {
  const response = await paystackRequest(
    'GET',
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
  return response.data;
}

// ── Fetch a subscription by code ──────────────────────────────────────────────
async function fetchSubscription(subscriptionCode) {
  const response = await paystackRequest(
    'GET',
    `/subscription/${encodeURIComponent(subscriptionCode)}`
  );
  return response.data;
}

// ── Disable (cancel) a subscription ──────────────────────────────────────────
async function cancelSubscription(subscriptionCode, emailToken) {
  const response = await paystackRequest('POST', '/subscription/disable', {
    code:  subscriptionCode,
    token: emailToken,
  });
  return response.data;
}

// ── Create a Paystack customer ────────────────────────────────────────────────
async function createCustomer({ email, first_name, last_name }) {
  const response = await paystackRequest('POST', '/customer', {
    email,
    first_name,
    last_name,
  });
  return response.data;
}

// ── Fetch all active plans from Paystack (for pricing page) ──────────────────
async function fetchPlans() {
  const response = await paystackRequest('GET', '/plan?status=active&perPage=20');
  return response.data;
}

module.exports = {
  initializeTransaction,
  initializeOneTimePayment,
  verifyTransaction,
  fetchSubscription,
  cancelSubscription,
  createCustomer,
  fetchPlans,
  resolvePlanCode,
  planFromCode,
  PLAN_CODES,
  PRICES_NGN,
};
