// models/User.js
// ─── User Schema · AmbientScribe ─────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;

const UserSchema = new mongoose.Schema(
  {
    fullName: {
      type:     String,
      required: [true, 'Full name is required'],
      trim:     true,
      minlength: [2,  'Full name must be at least 2 characters'],
      maxlength: [100,'Full name must be under 100 characters'],
    },
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,   // always stored lower-case
      trim:      true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
      index: true,
    },
    password: {
      type:      String,
      required:  [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      // Never returned in queries by default
      select:    false,
    },
    role: {
      type:    String,
      enum:    {
        values:  ['provider', 'clinic_admin'],
        message: 'Role must be either provider or clinic_admin',
      },
      default: 'provider',
    },
    // Tracks failed login attempts for lockout logic
    loginAttempts: { type: Number, default: 0, select: false },
    lockUntil:     { type: Date,   default: null, select: false },

    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true, // adds createdAt, updatedAt automatically
  }
);

// ── Pre-save: hash password only when it has been modified ────────────────────
UserSchema.pre('save', async function (next) {
  // Skip hashing if password field wasn't touched
  if (!this.isModified('password')) return next();

  try {
    this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
    next();
  } catch (err) {
    next(err);
  }
});

// ── Instance method: constant-time password comparison ────────────────────────
UserSchema.methods.comparePassword = async function (candidatePassword) {
  // this.password is not selected by default — caller must use .select('+password')
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Instance method: check if account is currently locked ─────────────────────
UserSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

// ── Strip sensitive fields from any JSON serialization ────────────────────────
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
