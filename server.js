// server.js
// ─── AmbientScribe · Backend Entry Point ─────────────────────────────────────
'use strict';

// Load environment variables FIRST — before any other require
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const connectDB  = require('./database');

// ── Fail fast if critical env vars are missing ────────────────────────────────
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[Server] FATAL: Missing required environment variables: ${missing.join(', ')}`);
  console.error('[Server] Copy .env.example to .env and fill in all values.');
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security headers (helmet sets X-Frame-Options, CSP, HSTS, etc.) ──────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────────────────────
// In production, replace '*' with your exact frontend domain(s)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ALLOWED_ORIGINS
    : '*',
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing — tight size limit prevents oversized payload attacks ─────────
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// ── Request logging (skip in test, use combined format in prod) ───────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Health check — used by load balancers, uptime monitors, k8s probes
app.get('/health', (req, res) => {
  res.status(200).json({
    status:      'ok',
    service:     'AmbientScribe API',
    environment: process.env.NODE_ENV || 'development',
    timestamp:   new Date().toISOString(),
  });
});

// Auth routes — register, login, /me
app.use('/api/v1/auth', require('./auth'));

// ── 404 handler — catches any unmatched route ─────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Must have exactly 4 parameters for Express to treat it as an error handler
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

// ─── BOOT ─────────────────────────────────────────────────────────────────────
async function startServer() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`[Server] AmbientScribe API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });
  } catch (err) {
    console.error('[Server] Startup failed:', err.name);
    process.exit(1);
  }
}

startServer();
