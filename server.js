// server.js
// ─── AmbientScribe · Backend Entry Point ─────────────────────────────────────
'use strict';

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const connectDB = require('./config/database');

// ── Fail fast on missing critical env vars ────────────────────────────────────
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[Server] FATAL: Missing env vars: ${missing.join(', ')}`);
  console.error('[Server] Copy .env.example to .env and fill in all values.');
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin:         process.env.NODE_ENV === 'production' ? ALLOWED_ORIGINS : '*',
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Subscription-Warning'],
}));

// ── CRITICAL: Paystack webhook BEFORE express.json() ─────────────────────────
// Needs raw body for HMAC signature verification.
// Mount this before any body parser middleware.
app.use('/api/v1/webhooks/paystack', require('./webhooks/paystack'));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// ── Request logging ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Health check — for Railway/Render/uptime monitors
app.get('/health', (req, res) => {
  res.status(200).json({
    status:      'ok',
    service:     'AmbientScribe API',
    version:     '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp:   new Date().toISOString(),
    payments:    !!(process.env.PAYSTACK_SECRET_KEY) ? 'configured' : 'pending',
  });
});

// Auth — register, login, /me
app.use('/api/v1/auth',          require('./routes/auth'));

// Clinical notes — save, list, sign, EHR sync, style profile
app.use('/api/v1/notes',         require('./routes/notes'));

// Subscriptions — quota check, plan info, usage
app.use('/api/v1/subscriptions', require('./routes/subscriptions'));

// Payments — trial, checkout, callback, cancel, status
app.use('/api/v1/payments',      require('./routes/payments'));

// AI pipeline proxy — Gemini now, Claude-ready later. Key never touches frontend.
app.use('/api/v1/ai',            require('./routes/ai'));

// Localization & compliance — locale dropdown options + trust/compliance page data
app.use('/api/v1/localization',  require('./routes/localization'));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.name, err.message);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
  });
});

// ─── BOOT ────────────────────────────────────────────────────────────────────
async function startServer() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`\n[Server] ✅ AmbientScribe API v2.0 running on port ${PORT}`);
      console.log(`[Server] Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`[Server] Payments    : ${process.env.PAYSTACK_SECRET_KEY ? '✅ Configured' : '⏳ Pending (BVN/Paystack setup)'}`);
      console.log(`[Server] Routes:`);
      console.log(`          POST /api/v1/auth/register`);
      console.log(`          POST /api/v1/auth/login`);
      console.log(`          GET  /api/v1/auth/me`);
      console.log(`          GET  /api/v1/notes`);
      console.log(`          POST /api/v1/notes`);
      console.log(`          GET  /api/v1/notes/shift-summary`);
      console.log(`          GET  /api/v1/notes/style-profile`);
      console.log(`          GET  /api/v1/notes/:id`);
      console.log(`          PATCH /api/v1/notes/:id/sign`);
      console.log(`          PATCH /api/v1/notes/:id/ehr-sync`);
      console.log(`          GET  /api/v1/subscriptions/check`);
      console.log(`          GET  /api/v1/subscriptions/me`);
      console.log(`          GET  /api/v1/subscriptions/plans`);
      console.log(`          POST /api/v1/payments/trial`);
      console.log(`          POST /api/v1/payments/checkout`);
      console.log(`          GET  /api/v1/payments/callback`);
      console.log(`          GET  /api/v1/payments/status`);
      console.log(`          POST /api/v1/payments/cancel`);
      console.log(`          POST /api/v1/webhooks/paystack\n`);
    });
  } catch (err) {
    console.error('[Server] Startup failed:', err.name, err.message);
    process.exit(1);
  }
}

startServer();
