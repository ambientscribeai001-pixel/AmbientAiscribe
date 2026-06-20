// middleware/auth.js
// ─── Authentication & Authorization Middleware ────────────────────────────────
'use strict';

const jwt  = require('jsonwebtoken');
const User = require('./User');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('[Auth] FATAL: JWT_SECRET is not defined. Refusing to start.');
  process.exit(1);
}

// ── LOCKOUT CONSTANTS ─────────────────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS   = 15 * 60 * 1000; // 15 minutes

// ── protect() ─────────────────────────────────────────────────────────────────
// Verifies the Bearer JWT on every protected route.
// Attaches the decoded user payload to req.user.
//
// Usage:
//   router.get('/profile', protect, (req, res) => { ... })
//
async function protect(req, res, next) {
  try {
    // 1. Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    // 2. Verify signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Session expired. Please log in again.'
          : 'Invalid token. Please log in again.';
      return res.status(401).json({ success: false, message });
    }

    // 3. Confirm the user still exists and is active
    const user = await User.findById(decoded.userId).select('+isActive');
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account not found or deactivated.',
      });
    }

    // 4. Attach clean user object to request — no password, no internals
    req.user = {
      id:       user._id.toString(),
      fullName: user.fullName,
      email:    user.email,
      role:     user.role,
    };

    next();
  } catch (err) {
    // Never expose internal error detail to the client
    console.error('[Auth] protect middleware error:', err.name);
    res.status(500).json({ success: false, message: 'Authentication error.' });
  }
}

// ── requireRole(...roles) ─────────────────────────────────────────────────────
// Role-based access control gate. Must run AFTER protect().
//
// Usage:
//   router.delete('/user/:id', protect, requireRole('clinic_admin'), handler)
//
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      // Defensive: protect() should have run first
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }
    next();
  };
}

// ── recordFailedAttempt() ─────────────────────────────────────────────────────
// Increments loginAttempts on the user document.
// Locks the account for LOCK_DURATION_MS after MAX_LOGIN_ATTEMPTS failures.
// Called internally by the login route — not exported as middleware.
//
async function recordFailedAttempt(user) {
  const update = { $inc: { loginAttempts: 1 } };

  if (user.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
    update.$set = { lockUntil: new Date(Date.now() + LOCK_DURATION_MS) };
  }

  await User.updateOne({ _id: user._id }, update);
}

// ── resetLoginAttempts() ──────────────────────────────────────────────────────
// Clears failure counter on successful login.
//
async function resetLoginAttempts(userId) {
  await User.updateOne(
    { _id: userId },
    { $set: { loginAttempts: 0, lockUntil: null } }
  );
}

module.exports = {
  protect,
  requireRole,
  recordFailedAttempt,
  resetLoginAttempts,
  MAX_LOGIN_ATTEMPTS,
  LOCK_DURATION_MS,
};
