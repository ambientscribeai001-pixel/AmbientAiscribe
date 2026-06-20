// config/localization.js
// ─── African Localization Engine · AmbientScribe ────────────────────────────
// Injects accent-awareness, Nigerian Pidgin / local English handling, and
// local medical phrasing recognition into the AI pipeline prompts.
// This is what lets the AI correctly transcribe and interpret a Nigerian
// doctor saying "the patient is feeling typhoid" or a patient saying
// "my body dey scratch me" without losing clinical meaning.
'use strict';

// ── Supported African locales ─────────────────────────────────────────────────
// Each entry has display info (for the frontend dropdown) and a prompt block
// (injected into the AI system prompt so transcription + SOAP generation
// understands accent, code-switching, and local phrasing patterns).
const AFRICAN_LOCALES = {
  'en-NG': {
    label:  'Nigerian English',
    flag:   '🇳🇬',
    region: 'Nigeria',
    promptBlock: `
LOCALIZATION — Nigerian English & Pidgin:
The speaker may use Nigerian English, Nigerian Pidgin, or code-switch between both within the same sentence. Apply these rules:
- Recognize Pidgin phrases and translate their CLINICAL MEANING into standard medical English in the SOAP note, while preserving exact symptom meaning. Examples:
  • "My body dey scratch me" / "I dey itch" → pruritus / itching
  • "Belle dey pain me" / "My belle de run" → abdominal pain / diarrhea
  • "I no fit chop" → loss of appetite / anorexia
  • "Catarrh dey worry me" → nasal congestion / rhinorrhea
  • "Wahala dey for my chest" → chest discomfort/pain
  • "My eye dey turn" → dizziness / vertigo
  • "Body dey hot me" / "I dey hot for body" → fever / pyrexia
  • "Waist dey pain me" → lower back pain
  • "I dey feel craze-craze" → confusion / altered mental status (flag for urgent review)
- Do NOT transcribe Pidgin verbatim into the clinical note — convert to standard medical terminology while keeping a verbatim quote available for audit traceability if needed.
- Recognize Nigerian-accented pronunciation patterns that may affect speech-to-text accuracy (e.g. consonant/vowel shifts common in Nigerian English) and infer intended medical terms from context rather than literal phonetic transcription.
- Recognize common Nigerian patient self-diagnosis language and convert appropriately:
  • "I think na typhoid" → patient reports suspected typhoid fever (do not assume confirmed diagnosis — flag as patient-reported, pending clinical/lab confirmation)
  • "Na malaria be this" → patient reports suspected malaria (same caveat — flag as unconfirmed until tested)
  • "I get ulcer" → patient reports history of/suspected peptic ulcer disease
`,
  },

  'en-GH': {
    label:  'Ghanaian English',
    flag:   '🇬🇭',
    region: 'Ghana',
    promptBlock: `
LOCALIZATION — Ghanaian English:
The speaker may use Ghanaian English with local idiom. Apply these rules:
- "My body is paining me" → generalized body pain / myalgia
- "I have catarrh" → nasal congestion / rhinorrhea
- "Stomach is running" → diarrhea
- Recognize Twi/Ga loanwords describing symptoms when used in English sentences and convert to clinical terminology with a verbatim note for traceability.
`,
  },

  'en-KE': {
    label:  'Kenyan English',
    flag:   '🇰🇪',
    region: 'Kenya',
    promptBlock: `
LOCALIZATION — Kenyan English:
The speaker may use Kenyan English or Sheng-influenced phrasing. Apply these rules:
- "I have homa" (Swahili: fever) → fever / pyrexia
- "Tumbo inauma" (stomach pain, code-switched) → abdominal pain
- "Naskia baridi" (feeling cold/chills) → chills, possible febrile illness
- Recognize Swahili medical/symptom loanwords embedded in English sentences and convert to standard clinical terminology.
`,
  },

  'en-ZA': {
    label:  'South African English',
    flag:   '🇿🇦',
    region: 'South Africa',
    promptBlock: `
LOCALIZATION — South African English:
The speaker may use South African English with Afrikaans- or Zulu-influenced terms. Apply standard South African English interpretation, recognizing regional medical idiom (e.g. "the flu" used broadly, "tummy bug" for gastroenteritis) and convert to precise clinical terminology.
`,
  },

  'en-US': {
    label:  'English (Standard/US)',
    flag:   '🌐',
    region: 'International',
    promptBlock: '', // no special localization needed
  },
};

// ── Local disease/condition phrasing — high-frequency African clinical context ─
// This block is appended REGARDLESS of locale when the region is African,
// because endemic disease patterns differ from US/UK training data defaults.
const AFRICAN_CLINICAL_CONTEXT_BLOCK = `
REGIONAL CLINICAL CONTEXT — West/East/Southern Africa:
When generating the Assessment and Plan sections, weight differential diagnoses according to regional disease burden rather than defaulting to Western-context assumptions:
- Fever of unknown origin in this region should always include malaria and typhoid fever in the differential, alongside standard considerations (viral illness, UTI, etc.) — do not omit these even if not explicitly stated by the clinician, but only ADD them as differential considerations, never as confirmed diagnoses.
- "Typhoid" and "malaria" are extremely common patient-reported and clinician-suspected diagnoses in this region. Treat clinician statements of these as clinical impressions warranting standard confirmatory workup (e.g. blood film/RDT for malaria, Widal test or blood culture for typhoid) unless the clinician explicitly states confirmatory testing was already done.
- Recognize regionally common conditions in differential reasoning: malaria, typhoid fever, schistosomiasis, sickle cell crisis, tuberculosis, HIV-related opportunistic conditions, hypertension, and diabetes — these have markedly different regional prevalence than US/UK baselines.
- For pediatric cases, weight malnutrition indicators and vaccine-preventable illness (measles, pertussis) appropriately for the region.
- Sickle cell disease is highly prevalent in West Africa — if patient reports recurrent "bone pain," "joint pain crisis," or family history of sickle cell, ensure this is captured precisely and not generalized as simple musculoskeletal pain.
`;

// ── Build the full localization block for a given locale code ─────────────────
function getLocalizationPrompt(localeCode) {
  const locale = AFRICAN_LOCALES[localeCode];
  if (!locale) return '';

  const isAfrican = locale.region !== 'International';
  return [
    locale.promptBlock || '',
    isAfrican ? AFRICAN_CLINICAL_CONTEXT_BLOCK : '',
  ].filter(Boolean).join('\n');
}

// ── List of locales for frontend dropdown ──────────────────────────────────────
function listLocales() {
  return Object.entries(AFRICAN_LOCALES).map(([code, l]) => ({
    code,
    label:  l.label,
    flag:   l.flag,
    region: l.region,
  }));
}

module.exports = {
  AFRICAN_LOCALES,
  getLocalizationPrompt,
  listLocales,
};
