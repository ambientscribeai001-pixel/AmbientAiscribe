# AmbientScribe Backend API

Node.js + Express + MongoDB Atlas authentication backend.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# → Open .env and fill in MONGO_URI and JWT_SECRET

# 3. Generate a secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Paste the output as JWT_SECRET in .env

# 4. Start dev server
npm run dev

# 5. Production
npm start
```

---

## Project structure

```
ambientscribe-backend/
├── server.js            ← Entry point — boot order, middleware stack, routes
├── config/
│   └── database.js      ← MongoDB Atlas connection with graceful shutdown
├── models/
│   └── User.js          ← User schema, password hashing, lockout fields
├── middleware/
│   └── auth.js          ← protect(), requireRole(), lockout helpers
├── routes/
│   └── auth.js          ← /register, /login, /me with rate limiters
├── .env.example         ← Template — copy to .env, never commit .env
├── .gitignore
└── package.json
```

---

## API endpoints

### `POST /api/v1/auth/register`
Create a new provider or clinic admin account.

**Body:**
```json
{
  "fullName": "Dr. Sarah Chen",
  "email": "sarah@clinic.com",
  "password": "SecurePass1",
  "role": "provider"
}
```

**Password rules:** min 8 chars, at least one uppercase, one lowercase, one digit.

---

### `POST /api/v1/auth/login`
Authenticate and receive a 24-hour JWT.

**Body:**
```json
{
  "email": "sarah@clinic.com",
  "password": "SecurePass1"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "expiresIn": "24h",
  "user": { "id": "...", "fullName": "Dr. Sarah Chen", "role": "provider" }
}
```

---

### `GET /api/v1/auth/me`
Returns the currently authenticated user's profile.

**Header:** `Authorization: Bearer <token>`

---

### `GET /health`
Health check for load balancers / uptime monitors. No auth required.

---

## Test with curl

```bash
# Register
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Dr. Test","email":"test@clinic.com","password":"SecurePass1","role":"provider"}'

# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@clinic.com","password":"SecurePass1"}'

# Get profile (replace TOKEN)
curl http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer TOKEN"

# Health check
curl http://localhost:5000/health
```

---

## Protecting your own routes

```js
const { protect, requireRole } = require('./middleware/auth');

// Any logged-in user
router.get('/sessions', protect, getSessionsHandler);

// Clinic admins only
router.delete('/user/:id', protect, requireRole('clinic_admin'), deleteUserHandler);
```

---

## Security checklist

- [ ] `MONGO_URI` and `JWT_SECRET` set in `.env` (never committed to git)
- [ ] `.env` is in `.gitignore`
- [ ] JWT secret is ≥64 random bytes (use the `crypto` command above)
- [ ] MongoDB Atlas: IP allowlist set to your server IP only (not 0.0.0.0/0)
- [ ] MongoDB Atlas: database user has only `readWrite` on `AmbientScribeProduction` — not `atlasAdmin`
- [ ] `NODE_ENV=production` set in your hosting environment
- [ ] `ALLOWED_ORIGINS` set to your exact frontend domain in production
- [ ] HTTPS enforced on your hosting layer (not handled here — use nginx / Render / Railway)
- [ ] Signed BAA with Anthropic (Claude API) before processing any real PHI
