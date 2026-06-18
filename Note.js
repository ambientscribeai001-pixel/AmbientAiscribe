// models/Note.js
// ─── Clinical Note Schema · AmbientScribe ────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

// ── Style diff — one field edit captured for learning ─────────────────────────
const StyleDiffSchema = new mongoose.Schema({
  field:    { type: String, enum: ['subjective','objective','assessment','plan'], required: true },
  original: { type: String, required: true },  // what AI generated
  edited:   { type: String, required: true },  // what doctor changed it to
  capturedAt: { type: Date, default: Date.now },
}, { _id: false });

// ── CPT code sub-doc ──────────────────────────────────────────────────────────
const CptCodeSchema = new mongoose.Schema({
  code:        String,
  description: String,
  confidence:  { type: String, enum: ['high','medium','low'] },
  fee_range:   String,
}, { _id: false });

// ── Conflict sub-doc ──────────────────────────────────────────────────────────
const ConflictSchema = new mongoose.Schema({
  severity:              { type: String, enum: ['CRITICAL','WARNING','INFO'] },
  target_section:        String,
  description:           String,
  resolution_suggestion: String,
  transcript_quote:      String,
}, { _id: false });

// ── Main Note schema ──────────────────────────────────────────────────────────
const NoteSchema = new mongoose.Schema(
  {
    // ── Ownership ──────────────────────────────────────────────────────────
    doctor: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },

    // ── Patient identifiers (no full PHI stored — just enough to identify) ─
    patientName: { type: String, required: true, trim: true },
    mrn:         { type: String, required: true, trim: true, index: true },
    patientDob:  { type: String, default: null },
    patientAge:  { type: Number, default: null },
    gender:      { type: String, default: null },
    allergies:   [{ type: String }],

    // ── Encounter metadata ─────────────────────────────────────────────────
    specialty:      { type: String, default: 'general' },
    chiefComplaint: { type: String, default: null },
    language:       { type: String, default: 'English' },
    inputMode:      { type: String, enum: ['voice','type','both'], default: 'voice' },

    // ── SOAP content ──────────────────────────────────────────────────────
    // aiGenerated = raw Pass 1 output
    // final       = what the doctor signed (may differ after edits)
    soapAiGenerated: {
      subjective: String,
      objective:  String,
      assessment: String,
      plan:       String,
    },
    soapFinal: {
      subjective: { type: String, required: true },
      objective:  { type: String, required: true },
      assessment: { type: String, required: true },
      plan:       { type: String, required: true },
    },

    // ── Safety audit results ──────────────────────────────────────────────
    auditPassed:   { type: Boolean, default: false },
    conflicts:     [ConflictSchema],
    overrideUsed:  { type: Boolean, default: false },  // MD checked override box

    // ── Billing ───────────────────────────────────────────────────────────
    cptCodes: [CptCodeSchema],
    icd10Codes: [{ code: String, description: String }],

    // ── Note quality score ────────────────────────────────────────────────
    qualityScore: { type: Number, min: 0, max: 100, default: null },
    qualityBreakdown: {
      completeness:      Number,
      specificity:       Number,
      accuracy:          Number,
      billing_readiness: Number,
    },

    // ── Style diffs for learning engine ──────────────────────────────────
    // Stored whenever the doctor edits the AI output before signing
    styleDiffs: [StyleDiffSchema],

    // ── Signing ───────────────────────────────────────────────────────────
    status:   { type: String, enum: ['draft','signed'], default: 'draft' },
    signedAt: { type: Date,   default: null },

    // ── EHR sync ──────────────────────────────────────────────────────────
    ehrSynced:   { type: Boolean, default: false },
    ehrSyncedAt: { type: Date,    default: null },
    ehrSystem:   { type: String,  default: null }, // 'epic' | 'cerner' | 'manual'

    // ── Raw transcript (optional — for audio traceability) ─────────────────
    transcriptSnippet: { type: String, default: null, select: false }, // excluded by default
  },
  {
    timestamps: true, // createdAt = session start, updatedAt = last edit
  }
);

// ── Indexes for common queries ────────────────────────────────────────────────
NoteSchema.index({ doctor: 1, createdAt: -1 }); // list my notes, newest first
NoteSchema.index({ doctor: 1, status: 1 });      // filter by draft/signed
NoteSchema.index({ doctor: 1, mrn: 1 });         // look up patient history

// ── Virtual: did the doctor edit the AI output? ───────────────────────────────
NoteSchema.virtual('wasEdited').get(function () {
  if (!this.soapAiGenerated || !this.soapFinal) return false;
  return ['subjective','objective','assessment','plan'].some(
    k => (this.soapAiGenerated[k] || '') !== (this.soapFinal[k] || '')
  );
});

module.exports = mongoose.model('Note', NoteSchema);
