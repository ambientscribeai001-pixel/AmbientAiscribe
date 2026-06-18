# AmbientScribe Backend API · v2.0

Node.js + Express + MongoDB Atlas — production-grade medical scribe backend.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Environment
cp .env.example .env
# Fill in MONGO_URI and JWT_SECRET

# 3. Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 4. Dev server
npm run dev

# 5. Production
npm start
```

---

## Project structure

```
ambientscribe-backend/
├── server.js                    ← Entry point — boot order, all routes
├── config/
│   ├── database.js              ← MongoDB Atlas connection
│   ├── paystack.js              ← Paystack API service (activates when keys added)
│   └── styleEngine.js           ← Per-doctor style learning engine
├── models/
│   ├── User.js                  ← Auth — bcrypt hashing, lockout fields
│   ├── Note.js                  ← Clinical notes — SOAP, audit, CPT, style diffs
│   └── Subscription.js          ← Plans, trial, quota — single source of truth
├── middleware/
│   ├── auth.js                  ← protect(), requireRole(), lockout helpers
│   └── subscription.js          ← requireActiveSubscription, requireNoteQuota, requirePlan
├── routes/
│   ├── auth.js                  ← /register /login /me
│   ├── notes.js                 ← CRUD + /sign /ehr-sync /style-profile /shift-summary
│   ├── payments.js              ← /trial /checkout /callback /status /cancel /plans
│   └── subscriptions.js         ← /check /me /plans
├── webhooks/
│   └── paystack.js              ← Billing lifecycle events from Paystack
├── .env.example
├── .gitignore
└── package.json
```

---

## All API endpoints

### Auth
```
POST  /api/v1/auth/register     Create account
POST  /api/v1/auth/login        Login → JWT
GET   /api/v1/auth/me           Get profile (auth required)
```

### Notes
```
POST  /api/v1/notes                    Save new note (auth + quota)
GET   /api/v1/notes                    List notes (?status=draft|signed&limit=20&page=1)
GET   /api/v1/notes/shift-summary      Today's session stats
GET   /api/v1/notes/style-profile      Learned style for Pass 1 prompt injection
GET   /api/v1/notes/:id                Full note detail
PATCH /api/v1/notes/:id                Update draft SOAP
PATCH /api/v1/notes/:id/sign           MD sign-off (locks note)
PATCH /api/v1/notes/:id/ehr-sync       Mark as synced to EHR
DELETE /api/v1/notes/:id               Delete draft only (never signed)
```

### Subscriptions
```
GET  /api/v1/subscriptions/check       Can this user create a note? (call before pipeline)
GET  /api/v1/subscriptions/me          Full plan + usage details
GET  /api/v1/subscriptions/plans       All plan definitions (public)
```

### Payments  ← Stubbed until Paystack BVN/account is active
```
POST /api/v1/payments/trial            Start 3-day free trial (no card)
POST /api/v1/payments/checkout         Initialize Paystack subscription
GET  /api/v1/payments/callback         Paystack redirect after payment
GET  /api/v1/payments/status           Current subscription status
POST /api/v1/payments/cancel           Cancel subscription
GET  /api/v1/payments/plans            Plan prices (public)
POST /api/v1/webhooks/paystack         Paystack billing events
```

### Health
```
GET  /health                           Uptime check — returns payments status too
```

---

## Pricing tiers

| Plan | Price | Notes/month | Trial |
|---|---|---|---|
| Free | $0 | 5/month | — |
| Clinical Pro | $300/month | Unlimited | 3 days |
| Clinic | $400/month | Unlimited | 3 days |
| Enterprise | $450/month | Unlimited | 3 days |

Annual billing: 20% discount on Pro and Clinic.

---

## Curl test commands

```bash
# Register
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Dr. Test","email":"test@clinic.com","password":"SecurePass1","role":"provider"}'

# Login (save the token)
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@clinic.com","password":"SecurePass1"}'

# Check subscription quota (replace TOKEN)
curl http://localhost:5000/api/v1/subscriptions/check \
  -H "Authorization: Bearer TOKEN"

# Start 3-day trial
curl -X POST http://localhost:5000/api/v1/payments/trial \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"plan":"pro"}'

# Health check (shows payment status)
curl http://localhost:5000/health
```

---

## Protecting your own routes

```js
const { protect, requireRole }                  = require('./middleware/auth');
const { requireActiveSubscription, requirePlan } = require('./middleware/subscription');

// Any logged-in user
router.get('/sessions', protect, handler);

// Active subscription required
router.post('/notes', protect, requireActiveSubscription, requireNoteQuota, handler);

// Clinic or Enterprise only
router.get('/team', protect, requireActiveSubscription, requirePlan('clinic','enterprise'), handler);

// Admin only
router.delete('/user/:id', protect, requireRole('clinic_admin'), handler);
```

---

## Security checklist

- [ ] `MONGO_URI` and `JWT_SECRET` in `.env`, never committed to git
- [ ] JWT secret is ≥ 64 random bytes
- [ ] MongoDB Atlas: IP allowlist set to your server IP only
- [ ] MongoDB Atlas: DB user has `readWrite` only, not `atlasAdmin`
- [ ] `NODE_ENV=production` on your hosting platform
- [ ] `ALLOWED_ORIGINS` set to your exact frontend domain
- [ ] HTTPS enforced at hosting layer (Railway/Render handle this)
- [ ] Paystack webhook URL registered in Paystack dashboard
- [ ] BAA signed with Anthropic (Claude API) before processing real PHI

---

## When your Paystack BVN clears

1. Create plans in Paystack dashboard → Subscriptions → Plans
   - Clinical Pro Monthly: $300 → code → `PAYSTACK_PRO_MONTHLY_PLAN_CODE`
   - Clinical Pro Annual: $240 → code → `PAYSTACK_PRO_ANNUAL_PLAN_CODE`
   - Clinic Monthly: $400 → `PAYSTACK_CLINIC_MONTHLY_PLAN_CODE`
   - Clinic Annual: $320 → `PAYSTACK_CLINIC_ANNUAL_PLAN_CODE`
   - Enterprise Monthly: $450 → `PAYSTACK_ENTERPRISE_MONTHLY_PLAN_CODE`
2. Add `PAYSTACK_SECRET_KEY` and all plan codes to `.env`
3. Register webhook URL in Paystack dashboard:
   `https://your-backend.railway.app/api/v1/webhooks/paystack`
4. Restart server — payments activate automatically.
