// routes/ai.js
// ─── AI Pipeline Proxy · AmbientScribe ───────────────────────────────────────
// All AI calls (currently Gemini, swappable to Claude later) go through here.
// The frontend NEVER holds an AI API key — it calls these backend routes,
// which read the key from process.env and call the AI provider server-side.
//
// To switch providers later: change callAI() below. Nothing else changes.
'use strict';

const express      = require('express');
const rateLimit    = require('express-rate-limit');
const { protect }  = require('../middleware/auth');
const {
  requireActiveSubscription,
  requireNoteQuota,
} = require('../middleware/subscription');
const { getLocalizationPrompt } = require('../config/localization');

const router = express.Router();

// ── Rate limiter: 60 AI calls per 10 min per user (5-pass pipeline = ~5-7 calls per note) ─
const aiLimiter = rateLimit({
  windowMs:        10 * 60 * 1000,
  max:             60,
  keyGenerator:    req => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'AI rate limit reached. Please wait a few minutes.' },
});

router.use(protect);
router.use(aiLimiter);

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini'; // 'gemini' | 'claude' — swap later

if (!GEMINI_KEY && AI_PROVIDER === 'gemini') {
  console.warn('[AI] WARNING: GEMINI_API_KEY not set. AI routes will fail until configured.');
}

// ── Strip markdown fences and parse JSON safely ───────────────────────────────
function parseAIJson(raw) {
  const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('AI returned malformed JSON. Please retry.');
  }
}

// ── Core AI call — currently Gemini, swap-ready for Claude ───────────────────
async function callAI(systemPrompt, userMessage) {
  if (AI_PROVIDER === 'gemini') {
    return callGemini(systemPrompt, userMessage);
  }
  if (AI_PROVIDER === 'claude') {
    return callClaude(systemPrompt, userMessage);
  }
  throw new Error(`Unknown AI_PROVIDER: ${AI_PROVIDER}`);
}

// ── Gemini implementation ─────────────────────────────────────────────────────
async function callGemini(systemPrompt, userMessage) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured on server.');

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
      generationConfig: {
        temperature:      0.3,
        maxOutputTokens:  1500,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Gemini API error ${res.status}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response.');

  return parseAIJson(text);
}

// ── Claude implementation (ready for when budget allows the switch) ──────────
async function callClaude(systemPrompt, userMessage) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not configured on server.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':          ANTHROPIC_KEY,
      'anthropic-version':  '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1500,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Claude API error ${res.status}`);

  const raw = data.content.map(b => b.text || '').join('');
  return parseAIJson(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/ai/soap
// Pass 1 — Generate SOAP note from transcript
// ─────────────────────────────────────────────────────────────────────────────
router.post('/soap', requireActiveSubscription, requireNoteQuota, async (req, res) => {
  try {
    const { transcript, specialty, specialtyLabel, specialtyFocus, language, styleProfile, locale } = req.body;

    if (!transcript || !transcript.trim()) {
      return res.status(422).json({ success: false, message: 'transcript is required.' });
    }

    const styleBlock = styleProfile ? `\n\n${styleProfile}` : '';
    const localizationBlock = locale ? `\n\n${getLocalizationPrompt(locale)}` : '';

    const result = await callAI(
      `You are a clinical documentation specialist. Extract a SOAP note ONLY from explicitly stated facts in this ${specialtyLabel || specialty || 'general'} consultation. Focus on: ${specialtyFocus || 'clinical data'}. Each value is one concise paragraph. Output language: ${language || 'English'}.${styleBlock}${localizationBlock}\nReturn ONLY valid JSON: {"subjective":"...","objective":"...","assessment":"...","plan":"..."}`,
      transcript
    );

    return res.status(200).json({ success: true, soap: result });
  } catch (err) {
    console.error('[AI] /soap error:', err.message);
    return res.status(502).json({ success: false, message: err.message || 'SOAP generation failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/ai/audit
// Pass 2 — CMO safety audit
// ─────────────────────────────────────────────────────────────────────────────
router.post('/audit', async (req, res) => {
  try {
    const { transcript, soap, allergies = [], locale } = req.body;
    if (!soap) return res.status(422).json({ success: false, message: 'soap is required.' });

    const regionalBlock = locale ? `\n\n${getLocalizationPrompt(locale)}` : '';

    const result = await callAI(
      `You are a Chief Medical Officer safety auditor. Detect: (1) allergy violations — drug belongs to same class as stated allergy (e.g. Amoxicillin IS penicillin-class); (2) exam/diagnosis contradictions — objective findings directly contradict assessment.${regionalBlock}\nPatient known allergies: ${allergies.length ? allergies.join(', ') : 'None'}.\nReturn ONLY valid JSON: {"conflicts":[{"severity":"CRITICAL|WARNING|INFO","target_section":"...","description":"...","resolution_suggestion":"...","transcript_quote":"short verbatim phrase"}],"audit_passed":true|false}`,
      `Transcript:\n${transcript || ''}\n\nDraft SOAP:\n${JSON.stringify(soap)}`
    );

    return res.status(200).json({ success: true, audit: result });
  } catch (err) {
    console.error('[AI] /audit error:', err.message);
    return res.status(502).json({ success: false, message: err.message || 'Safety audit failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/ai/cpt
// Pass 3 — CPT billing code suggestions
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cpt', async (req, res) => {
  try {
    const { soap } = req.body;
    if (!soap) return res.status(422).json({ success: false, message: 'soap is required.' });

    const result = await callAI(
      `You are a medical billing specialist. Suggest the 3 most relevant CPT codes for this SOAP note. Return ONLY valid JSON: {"codes":[{"code":"XXXXX","description":"...","confidence":"high|medium|low","rationale":"one sentence","fee_range":"$X–$Y"}]}`,
      JSON.stringify(soap)
    );

    return res.status(200).json({ success: true, cpt: result });
  } catch (err) {
    console.error('[AI] /cpt error:', err.message);
    return res.status(502).json({ success: false, message: err.message || 'CPT lookup failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/ai/dss
// Pass 4 — Clinical decision support
// ─────────────────────────────────────────────────────────────────────────────
router.post('/dss', async (req, res) => {
  try {
    const { soap, specialty } = req.body;
    if (!soap) return res.status(422).json({ success: false, message: 'soap is required.' });

    const result = await callAI(
      `You are a clinical decision support AI reviewing a ${specialty || 'general'} SOAP note. Provide evidence-based suggestions. Return ONLY valid JSON: {"suggestions":[{"type":"guideline|drug_interaction|red_flag|follow_up","priority":"high|medium|low","title":"...","body":"...","source":"reference name"}]}`,
      JSON.stringify(soap)
    );

    return res.status(200).json({ success: true, dss: result });
  } catch (err) {
    console.error('[AI] /dss error:', err.message);
    return res.status(502).json({ success: false, message: err.message || 'Decision support failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/ai/score
// Pass 5 — Note quality score
// ─────────────────────────────────────────────────────────────────────────────
router.post('/score', async (req, res) => {
  try {
    const { transcript, soap } = req.body;
    if (!soap) return res.status(422).json({ success: false, message: 'soap is required.' });

    const result = await callAI(
      `Score this SOAP note on clinical quality 0–100. Return ONLY valid JSON: {"score":0,"breakdown":{"completeness":0,"specificity":0,"accuracy":0,"billing_readiness":0},"feedback":["improvement tip 1","tip 2"]}`,
      `Transcript:\n${transcript || ''}\n\nSOAP:\n${JSON.stringify(soap)}`
    );

    return res.status(200).json({ success: true, score: result });
  } catch (err) {
    console.error('[AI] /score error:', err.message);
    return res.status(502).json({ success: false, message: err.message || 'Quality scoring failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/ai/takehome
// Patient take-home instructions
// ─────────────────────────────────────────────────────────────────────────────
router.post('/takehome', async (req, res) => {
  try {
    const { soap, patientName, language } = req.body;
    if (!soap) return res.status(422).json({ success: false, message: 'soap is required.' });

    const result = await callAI(
      `You are a patient education specialist. Convert this SOAP note into a friendly plain-language take-home summary. No medical jargon. Output language: ${language || 'English'}. Return ONLY valid JSON: {"greeting":"...","what_we_found":["..."],"your_treatment":["..."],"important_warnings":["..."],"follow_up":"...","closing":"..."}`,
      `Patient: ${patientName || 'Patient'}\n${JSON.stringify(soap)}`
    );

    return res.status(200).json({ success: true, takehome: result });
  } catch (err) {
    console.error('[AI] /takehome error:', err.message);
    return res.status(502).json({ success: false, message: err.message || 'Take-home generation failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/ai/referral
// Referral letter generator
// ─────────────────────────────────────────────────────────────────────────────
router.post('/referral', async (req, res) => {
  try {
    const { soap, patientName, dob, mrn, referringDoctor } = req.body;
    if (!soap) return res.status(422).json({ success: false, message: 'soap is required.' });

    const result = await callAI(
      `Write a professional medical referral letter. Return ONLY valid JSON: {"to":"Specialist type","subject":"Referral: [condition]","body":"Full formal letter text with date, patient demographics, reason, clinical summary, specific request, signature block"}`,
      `Patient: ${patientName || 'Patient'}, DOB: ${dob || 'N/A'}, MRN: ${mrn || 'N/A'}\nReferring: ${referringDoctor || 'Physician'}\nSOAP:\n${JSON.stringify(soap)}`
    );

    return res.status(200).json({ success: true, referral: result });
  } catch (err) {
    console.error('[AI] /referral error:', err.message);
    return res.status(502).json({ success: false, message: err.message || 'Referral generation failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/ai/status
// Health check — confirms which AI provider is active and configured
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.status(200).json({
    success:  true,
    provider: AI_PROVIDER,
    ready:    AI_PROVIDER === 'gemini' ? !!GEMINI_KEY : !!process.env.ANTHROPIC_API_KEY,
  });
});

module.exports = router;
