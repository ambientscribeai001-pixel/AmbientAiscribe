// config/styleEngine.js
// ─── Doctor Style Learning Engine · AmbientScribe ────────────────────────────
// Analyses a doctor's historical edits and produces a compact style profile
// that gets injected into the Pass 1 system prompt so notes come out
// matching their voice from the first draft.
'use strict';

const Note = require('../models/Note');

/**
 * buildStyleProfile(doctorId)
 *
 * Looks at the last 50 signed notes for this doctor.
 * Extracts every field where the AI output differed from the signed version.
 * Returns a plain-English paragraph suitable for injection into a system prompt.
 *
 * Returns null if < 3 notes exist (not enough signal yet).
 */
async function buildStyleProfile(doctorId) {
  // Pull recent notes that had edits
  const notes = await Note.find({
    doctor: doctorId,
    status: 'signed',
    'styleDiffs.0': { $exists: true }, // at least one diff recorded
  })
    .sort({ signedAt: -1 })
    .limit(50)
    .select('styleDiffs')
    .lean();

  if (notes.length < 3) return null; // not enough data yet

  // Flatten all diffs across all notes
  const allDiffs = notes.flatMap(n => n.styleDiffs || []);
  if (allDiffs.length === 0) return null;

  // ── Pattern detection ─────────────────────────────────────────────────────

  // 1. Abbreviation preference
  //    If doctor consistently replaces full words with abbreviations (or vice versa)
  const abbreviationPairs = [
    ['hypertension',          'HTN'],
    ['diabetes mellitus',     'DM'],
    ['shortness of breath',   'SOB'],
    ['history of',            'h/o'],
    ['chief complaint',       'CC'],
    ['physical examination',  'PE'],
    ['blood pressure',        'BP'],
    ['heart rate',            'HR'],
    ['temperature',           'Temp'],
    ['respiratory rate',      'RR'],
    ['oxygen saturation',     'O2 sat'],
    ['milligrams',            'mg'],
    ['twice daily',           'BID'],
    ['three times daily',     'TID'],
    ['as needed',             'PRN'],
  ];

  const prefersAbbrev = [];
  const prefersFull   = [];

  for (const [full, abbrev] of abbreviationPairs) {
    let toAbbrev = 0, toFull = 0;
    for (const d of allDiffs) {
      const orig = (d.original || '').toLowerCase();
      const edit = (d.edited   || '').toLowerCase();
      if (orig.includes(full.toLowerCase()) && edit.includes(abbrev.toLowerCase())) toAbbrev++;
      if (orig.includes(abbrev.toLowerCase()) && edit.includes(full.toLowerCase())) toFull++;
    }
    if (toAbbrev > toFull && toAbbrev >= 2) prefersAbbrev.push(abbrev);
    if (toFull > toAbbrev && toFull >= 2)   prefersFull.push(full);
  }

  // 2. Phrases the doctor always adds (appear in edited but not original, 3+ times)
  const addedPhrases = new Map();
  for (const d of allDiffs) {
    const origWords = new Set((d.original || '').toLowerCase().split(/\s+/));
    const editSentences = (d.edited || '').split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    for (const sentence of editSentences) {
      const sentLower = sentence.toLowerCase();
      // Only count sentences where most words are NOT in the original
      const sentWords = sentLower.split(/\s+/);
      const newWords  = sentWords.filter(w => !origWords.has(w));
      if (newWords.length > sentWords.length * 0.6 && sentence.length > 20) {
        const key = sentence.toLowerCase().slice(0, 40);
        addedPhrases.set(key, (addedPhrases.get(key) || 0) + 1);
      }
    }
  }
  const commonAdditions = [...addedPhrases.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase]) => phrase);

  // 3. Tone detection — formal vs conversational
  let formalCount = 0, conversationalCount = 0;
  const formalMarkers        = ['the patient', 'was noted', 'examination revealed', 'it was determined'];
  const conversationalMarkers= ['patient reports', 'patient denies', 'patient states', 'presents with'];
  for (const d of allDiffs) {
    const edit = (d.edited || '').toLowerCase();
    if (formalMarkers.some(m => edit.includes(m)))         formalCount++;
    if (conversationalMarkers.some(m => edit.includes(m))) conversationalCount++;
  }
  const tone = formalCount > conversationalCount * 1.5 ? 'formal'
    : conversationalCount > formalCount * 1.5 ? 'conversational'
    : 'neutral';

  // 4. Length preference per section
  const lengthPrefs = {};
  for (const field of ['subjective','objective','assessment','plan']) {
    const fieldDiffs = allDiffs.filter(d => d.field === field && d.edited);
    if (fieldDiffs.length >= 3) {
      const avgLen = fieldDiffs.reduce((s, d) => s + d.edited.length, 0) / fieldDiffs.length;
      lengthPrefs[field] = avgLen < 150 ? 'concise' : avgLen > 400 ? 'detailed' : 'moderate';
    }
  }

  // ── Build the profile string ──────────────────────────────────────────────
  const lines = [
    `DOCTOR STYLE PREFERENCES (learned from ${notes.length} signed notes — apply these exactly):`,
  ];

  if (prefersAbbrev.length > 0) {
    lines.push(`- Use medical abbreviations: ${prefersAbbrev.join(', ')}`);
  }
  if (prefersFull.length > 0) {
    lines.push(`- Write out in full (no abbreviations): ${prefersFull.join(', ')}`);
  }
  if (tone !== 'neutral') {
    lines.push(`- Tone: ${tone} — ${tone === 'formal' ? 'use third-person formal phrasing' : 'use direct patient-centric language'}`);
  }
  if (commonAdditions.length > 0) {
    lines.push(`- This doctor consistently adds these types of statements — include them when clinically appropriate:`);
    commonAdditions.forEach(p => lines.push(`  • "${p}"`));
  }
  Object.entries(lengthPrefs).forEach(([field, pref]) => {
    lines.push(`- ${field.charAt(0).toUpperCase() + field.slice(1)} section: ${pref} length preferred`);
  });

  if (lines.length === 1) return null; // no patterns detected

  return lines.join('\n');
}

/**
 * extractStyleDiffs(aiDraft, signedDraft)
 *
 * Compares AI output to final signed version field by field.
 * Returns an array of StyleDiff objects to store on the Note.
 * Called by the notes route when a note is signed.
 */
function extractStyleDiffs(aiDraft, signedDraft) {
  if (!aiDraft || !signedDraft) return [];
  const diffs = [];
  for (const field of ['subjective','objective','assessment','plan']) {
    const original = (aiDraft[field] || '').trim();
    const edited   = (signedDraft[field] || '').trim();
    // Only record if meaningfully different (not just whitespace)
    if (original !== edited && Math.abs(original.length - edited.length) > 5) {
      diffs.push({ field, original, edited });
    }
  }
  return diffs;
}

module.exports = { buildStyleProfile, extractStyleDiffs };
