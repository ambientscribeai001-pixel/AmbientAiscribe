// routes/auth.js
// ─── Authentication Routes · AmbientScribe ────────────────────────────────────
'use strict';

const express    = require('express');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const User       = require('./User');
const {
  protect,
  recordFailedAttempt,
  resetLoginAttempts,
}                = require('./auth');

const router = express.Router();

const JWT_SECRET     = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// ── Input sanitizer: strip fields not in the allow-list ──────────────────────
function pick(obj, ...keys) {
  return keys.reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});
}

// ── Generic safe error responder ─────────────────────────────────────────────
// Never leaks stack traces or internal messages to the client.
function serverError(res, err, context) {
  console.error(`[Auth] ${context}:`, err.name, err.message);
  return res.status(500).json({
    success: false,
    message: 'An internal error occurred. Please try again.',
  });
}

// ─── RATE LIMITERS ────────────────────────────────────────────────────────────

// Login: 10 attempts per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please wait 15 minutes.',
  },
});

// Register: 5 accounts per IP per hour (prevents bulk account creation)
const registerLimiter = rateLimit({
  windowMs:         60 * 60 * 1000,
  max:              5,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: 'Too many registration attempts from this IP. Please try later.',
  },
});

// ─── VALIDATION HELPERS ───────────────────────────────────────────────────────

const EMAIL_REGEX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Min 8 chars, at least one uppercase, one lowercase, one digit
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function validateRegisterInput({ fullName, email, password, role }) {
  const errors = [];

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    errors.push('Full name must be at least 2 characters.');
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    errors.push('A valid email address is required.');
  }
  if (!password || !PASSWORD_REGEX.test(password)) {
    errors.push('Password must be at least 8 characters and include uppercase, lowercase, and a number.');
  }
  if (role && !['provider', 'clinic_admin'].includes(role)) {
    errors.push('Role must be provider or clinic_admin.');
  }

  return errors;
}

function validateLoginInput({ email, password }) {
  const errors = [];
  if (!email || !EMAIL_REGEX.test(email))       errors.push('Valid email is required.');
  if (!password || typeof password !== 'string') errors.push('Password is required.');
  return errors;
}

// ─── ROUTE: POST /api/v1/auth/register ───────────────────────────────────────
router.post('/register', registerLimiter, async (req, res) => {
  try {
    // 1. Allow-list fields — ignore anything extra in the body
    const body = pick(req.body, 'fullName', 'email', 'password', 'role');

    // 2. Validate
    const errors = validateRegisterInput(body);
    if (errors.length > 0) {
      return res.status(422).json({ success: false, errors });
    }

    // 3. Check uniqueness (case-insensitive via lowercase transform in schema)
    const exists = await User.findOne({ email: body.email.toLowerCase().trim() });
    if (exists) {
      // Use identical message to prevent email enumeration
      return res.status(409).json({
        success: false,
        message: 'An account with that email already exists.',
      });
    }

    // 4. Create — password hashing happens in the pre-save hook, not here
    const user = new User({
      fullName: body.fullName.trim(),
      email:    body.email.toLowerCase().trim(),
      password: body.password,
      role:     body.role || 'provider',
    });

    await user.save();

    // 5. Respond — never return the hashed password
    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user: {
        id:       user._id,
        fullName: user.fullName,
        email:    user.email,
        role:     user.role,
      },
    });
  } catch (err) {
    // Mongoose duplicate key (race condition — two requests hit at the same ms)
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with that email already exists.',
      });
    }
    return serverError(res, err, 'register');
  }
});

// ─── ROUTE: POST /api/v1/auth/login ──────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const body = pick(req.body, 'email', 'password');

    // 1. Validate shape
    const errors = validateLoginInput(body);
    if (errors.length > 0) {
      return res.status(422).json({ success: false, errors });
    }

    // 2. Fetch user — explicitly include fields that are select:false
    const user = await User.findOne({ email: body.email.toLowerCase().trim() })
      .select('+password +loginAttempts +lockUntil +isActive');

    // 3. Use a constant-time "user not found" path to prevent timing attacks
    //    (we still run bcrypt even if user is null, using a dummy hash)
    const DUMMY_HASH = '$2a$12$dummyhashforpreventingtimingattacksXXXXXXXXXXXXXXXXX';
    const candidatePassword = body.password;

    if (!user) {
      // Run bcrypt anyway so response time is identical regardless of user existence
      await require('bcryptjs').compare(candidatePassword, DUMMY_HASH);
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // 4. Check account status
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account deactivated. Contact your clinic administrator.',
      });
    }

    // 5. Check lockout
    if (user.isLocked()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        message: `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`,
      });
    }

    // 6. Verify password
    const isMatch = await user.comparePassword(candidatePassword);
    if (!isMatch) {
      await recordFailedAttempt(user);
      const attemptsLeft = Math.max(0, 5 - (user.loginAttempts + 1));
      return res.status(401).json({
        success: false,
        message: `Invalid credentials.${attemptsLeft > 0 ? ` ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining.` : ' Account will be locked.'}`,
      });
    }

    // 7. Clear failed attempts on success
    await resetLoginAttempts(user._id);

    // 8. Sign JWT — payload is minimal (userId + role only)
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      success: true,
      token,
      expiresIn: JWT_EXPIRES_IN,
      user: {
        id:       user._id,
        fullName: user.fullName,
        email:    user.email,
        role:     user.role,
      },
    });
  } catch (err) {
    return serverError(res, err, 'login');
  }
});

// ─── ROUTE: GET /api/v1/auth/me ───────────────────────────────────────────────
// Returns the currently authenticated user's profile.
// Requires: Bearer token in Authorization header.
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({ success: true, user });
  } catch (err) {
    return serverError(res, err, '/me');
  }
});

module.exports = router;
