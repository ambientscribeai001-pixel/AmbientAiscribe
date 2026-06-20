// routes/localization.js
// ─── Localization & Compliance Routes · AmbientScribe ───────────────────────
// Public routes (no auth) — used by the frontend to populate the language/
// accent dropdown and render the trust/compliance page.
'use strict';

const express = require('express');
const { listLocales } = require('../config/localization');
const { CLINICAL_DISCLAIMER } = require('../config/disclaimer');
const {
  COMPLIANCE_FRAMEWORKS,
  GLOBAL_SECURITY_POSTURE,
  PAYMENT_INFRASTRUCTURE,
  BAA_REQUIREMENT,
  DATA_RESIDENCY_NOTES,
  ENTERPRISE_PROCUREMENT_CHECKLIST,
  byContinent,
} = require('../config/compliance');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/localization/locales
// Returns supported accent/locale options for the session config dropdown
// ─────────────────────────────────────────────────────────────────────────────
router.get('/locales', (req, res) => {
  res.status(200).json({
    success: true,
    locales: listLocales(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/localization/compliance
// Returns full compliance framework registry — for a trust/compliance page
// ?continent=Africa filters by continent
// ─────────────────────────────────────────────────────────────────────────────
router.get('/compliance', (req, res) => {
  const { continent } = req.query;

  let frameworks = COMPLIANCE_FRAMEWORKS;
  if (continent) {
    frameworks = frameworks.filter(f => f.continent.toLowerCase() === continent.toLowerCase());
  }

  res.status(200).json({
    success:  true,
    frameworks,
    grouped:  byContinent(),
    security: GLOBAL_SECURITY_POSTURE,
    payments: PAYMENT_INFRASTRUCTURE,
    baa:      BAA_REQUIREMENT,
    dataResidency: DATA_RESIDENCY_NOTES,
    enterpriseReadiness: ENTERPRISE_PROCUREMENT_CHECKLIST,
    disclaimer: 'AmbientScribe aligns its data handling practices with the principles of each listed framework. Formal third-party certification (e.g. SOC 2 Type II, ISO 27001) is noted separately and only claimed once an audit is complete. Payment provider statuses reflect actual current integration state, not aspirational claims.',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/localization/disclaimer
// Returns the clinical disclaimer text — frontend shows this before first sign
// ─────────────────────────────────────────────────────────────────────────────
router.get('/disclaimer', (req, res) => {
  res.status(200).json({
    success: true,
    disclaimer: CLINICAL_DISCLAIMER,
  });
});

module.exports = router;
