// config/compliance.js
// ─── Global Data Protection & Compliance Registry · AmbientScribe ───────────
// Single source of truth for every region's data protection framework that
// AmbientScribe aligns with. Used by:
//   - The /api/v1/compliance route (frontend trust/compliance page)
//   - Marketing copy generation
//   - Future BAA/DPA document generation
//
// IMPORTANT: This describes ALIGNMENT WITH regulatory principles, not formal
// certification. Formal certification (e.g. SOC 2 Type II audit, ISO 27001)
// requires actual third-party audits — update the `certified` field only when
// that audit is actually complete. Do not claim certification you don't have.
'use strict';

const COMPLIANCE_FRAMEWORKS = [
  {
    region:      'Nigeria',
    continent:   'Africa',
    framework:   'NDPA',
    fullName:    'Nigeria Data Protection Act 2023',
    authority:   'Nigeria Data Protection Commission (NDPC)',
    certified:   false, // set true only after formal registration/audit complete
    summary:     'Governs collection, processing, and storage of personal data of Nigerian data subjects. Requires lawful basis for processing, data subject rights (access, correction, deletion), and breach notification.',
    alignmentNotes: [
      'Patient data encrypted in transit and at rest',
      'Data subject access and deletion requests supported via account settings',
      'Data Protection Officer registration in progress',
      'Breach notification process aligned with NDPA 72-hour requirement',
    ],
  },
  {
    region:      'United States',
    continent:   'North America',
    framework:   'HIPAA',
    fullName:    'Health Insurance Portability and Accountability Act',
    authority:   'U.S. Department of Health & Human Services (HHS) / OCR',
    certified:   false,
    summary:     'Governs protected health information (PHI) for covered entities and business associates. Requires administrative, physical, and technical safeguards, plus a signed Business Associate Agreement (BAA).',
    alignmentNotes: [
      'BAA available on all paid plans before any PHI is processed',
      'End-to-end encryption of PHI in transit (TLS 1.2+) and at rest',
      'Audio recordings deleted immediately after note generation — not retained',
      'Access controls and audit logging on all patient record access',
      'Minimum necessary standard applied to data collection',
    ],
  },
  {
    region:      'United States (California)',
    continent:   'North America',
    framework:   'CCPA / CPRA',
    fullName:    'California Consumer Privacy Act / California Privacy Rights Act',
    authority:   'California Privacy Protection Agency (CPPA)',
    certified:   false,
    summary:     'Grants California residents rights over personal data collection, sale, and deletion, including sensitive personal information protections relevant to health data.',
    alignmentNotes: [
      'No sale of personal or health data — ever',
      'Data deletion requests honored within statutory timeframes',
      'Clear privacy notice covering categories of data collected',
    ],
  },
  {
    region:      'European Union',
    continent:   'Europe',
    framework:   'GDPR',
    fullName:    'General Data Protection Regulation',
    authority:   'European Data Protection Board (EDPB) / national DPAs',
    certified:   false,
    summary:     'Comprehensive data protection law covering lawful basis, data subject rights, data minimization, and cross-border transfer restrictions. Health data is a "special category" requiring explicit consent or another Article 9 basis.',
    alignmentNotes: [
      'Explicit patient consent captured before every recorded session',
      'Data Processing Agreement (DPA) available for clinic/enterprise customers',
      'Right to access, rectify, and erase data supported',
      'Data minimization — only clinically necessary data collected',
    ],
  },
  {
    region:      'United Kingdom',
    continent:   'Europe',
    framework:   'UK GDPR / DPA 2018',
    fullName:    'UK General Data Protection Regulation & Data Protection Act 2018',
    authority:   'Information Commissioner\'s Office (ICO)',
    certified:   false,
    summary:     'UK\'s post-Brexit data protection framework, materially aligned with EU GDPR, with NHS Digital and Caldicott Principles relevant for health data specifically.',
    alignmentNotes: [
      'Aligned with Caldicott Principles for confidential patient information',
      'UK data residency option available for Enterprise customers',
    ],
  },
  {
    region:      'Canada',
    continent:   'North America',
    framework:   'PIPEDA',
    fullName:    'Personal Information Protection and Electronic Documents Act',
    authority:   'Office of the Privacy Commissioner of Canada (OPC)',
    certified:   false,
    summary:     'Governs private-sector collection, use, and disclosure of personal information, including health information, across most Canadian provinces.',
    alignmentNotes: [
      'Consent-based collection model',
      'Breach notification process aligned with PIPEDA requirements',
    ],
  },
  {
    region:      'South Africa',
    continent:   'Africa',
    framework:   'POPIA',
    fullName:    'Protection of Personal Information Act',
    authority:   'Information Regulator (South Africa)',
    certified:   false,
    summary:     'Governs processing of personal information including health data ("special personal information"), requiring explicit justification and safeguards.',
    alignmentNotes: [
      'Special category safeguards applied to health information',
      'Information Officer designation process in progress',
    ],
  },
  {
    region:      'Kenya',
    continent:   'Africa',
    framework:   'KDPA',
    fullName:    'Kenya Data Protection Act 2019',
    authority:   'Office of the Data Protection Commissioner (ODPC)',
    certified:   false,
    summary:     'Governs personal data processing including health data, modeled significantly on GDPR principles.',
    alignmentNotes: [
      'Data subject rights supported (access, correction, deletion)',
      'Cross-border transfer safeguards in place',
    ],
  },
  {
    region:      'Ghana',
    continent:   'Africa',
    framework:   'DPA (Act 843)',
    fullName:    'Ghana Data Protection Act, 2012 (Act 843)',
    authority:   'Data Protection Commission (Ghana)',
    certified:   false,
    summary:     'Governs the processing of personal data including sensitive personal data such as health records.',
    alignmentNotes: [
      'Consent-based processing for health data',
      'Data Protection Commission registration in progress',
    ],
  },
  {
    region:      'India',
    continent:   'Asia',
    framework:   'DPDP Act',
    fullName:    'Digital Personal Data Protection Act, 2023',
    authority:   'Data Protection Board of India',
    certified:   false,
    summary:     'Governs digital personal data processing, with health data treated as requiring heightened care under consent-based principles.',
    alignmentNotes: [
      'Consent manager framework compatibility planned',
      'Data localization options under evaluation for Enterprise',
    ],
  },
  {
    region:      'Singapore',
    continent:   'Asia',
    framework:   'PDPA',
    fullName:    'Personal Data Protection Act 2012',
    authority:   'Personal Data Protection Commission (PDPC)',
    certified:   false,
    summary:     'Governs collection, use, and disclosure of personal data, with healthcare-specific guidance from MOH for clinical data handling.',
    alignmentNotes: [
      'Consent-based collection and use',
      'Data breach notification aligned with PDPA timelines',
    ],
  },
  {
    region:      'United Arab Emirates',
    continent:   'Asia',
    framework:   'PDPL',
    fullName:    'UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021)',
    authority:   'UAE Data Office',
    certified:   false,
    summary:     'Federal data protection law governing personal data processing, with DHA/DOH health data handling rules applicable for clinical use in the UAE.',
    alignmentNotes: [
      'Consent-based processing model',
      'Regional data residency option under evaluation for Enterprise',
    ],
  },
  {
    region:      'Australia',
    continent:   'Oceania',
    framework:   'Privacy Act 1988 (APPs)',
    fullName:    'Privacy Act 1988 — Australian Privacy Principles',
    authority:   'Office of the Australian Information Commissioner (OAIC)',
    certified:   false,
    summary:     'Governs handling of personal information including health information, which is treated as "sensitive information" requiring heightened protection.',
    alignmentNotes: [
      'Sensitive information handling safeguards applied to health data',
      'Notifiable Data Breaches scheme alignment',
    ],
  },
];

// ── General security posture (applies globally, independent of region) ───────
const GLOBAL_SECURITY_POSTURE = {
  encryption: {
    inTransit: 'TLS 1.2+ enforced on all API and web traffic',
    atRest:    'AES-256 encryption for stored patient records',
  },
  dataRetention: {
    audio:   'Deleted immediately after note generation — never stored long-term',
    notes:   'Retained per customer-configured retention policy; deletable on request',
    backups: 'Encrypted, access-controlled, rotated per retention policy',
  },
  accessControl: {
    authentication: 'Bcrypt-hashed credentials, JWT session tokens, account lockout after repeated failed attempts',
    authorization:  'Role-based access control — providers only access their own patient records unless explicitly shared within a Clinic/Enterprise team',
  },
  aiProcessing: {
    note: 'Clinical text is sent to the configured AI provider (currently Google Gemini, upgradeable to Anthropic Claude) solely for note generation. Provider-side data retention is governed by that provider\'s API terms — AmbientScribe does not use patient data to train any AI model.',
  },
  vendorIntent: [
    'SOC 2 Type II audit — planned, not yet completed (do not claim until audit report exists)',
    'ISO 27001 — under evaluation for future certification',
  ],
};

// ── International payment infrastructure — current state + roadmap ───────────
// Status flags matter here: 'live' means it actually works today,
// 'planned' means it's a real next step, not a claim of current capability.
// Never flip a status to 'live' until it's actually wired and tested.
const PAYMENT_INFRASTRUCTURE = {
  current: [
    {
      provider: 'Paystack',
      status:   'live',
      coverage: 'Nigeria — card, bank transfer, USSD, mobile money',
      currency: 'NGN',
      note:     'Primary collection method today. Account partially activated; full activation in progress.',
    },
  ],
  roadmap: [
    {
      provider: 'Lemon Squeezy',
      status:   'pending_review',
      coverage: 'Global — Merchant of Record, handles international cards, VAT/sales tax automatically',
      currency: 'USD (and others via MoR conversion)',
      note:     'Application submitted, awaiting approval. App URL required for verification — blocked until frontend is live.',
    },
    {
      provider: 'Paddle',
      status:   'not_started',
      coverage: 'Global — Merchant of Record alternative to Lemon Squeezy',
      currency: 'Multi-currency',
      note:     'Evaluate as a second MoR option once Lemon Squeezy is live, for redundancy and to compare conversion rates.',
    },
    {
      provider: 'Paystack International Toggle',
      status:   'not_started',
      coverage: 'International cards via existing Paystack account',
      currency: 'USD',
      note:     'Requires explicit request to Paystack to activate international acceptance. Worth exploring as a lower-friction interim step before MoR platforms are live, but historically lower approval rates on US corporate cards.',
    },
    {
      provider: 'Virtual corporate banking (Payoneer / Grey / similar)',
      status:   'not_started',
      coverage: 'B2B wire transfers (ACH, SEPA, SWIFT) for Enterprise/hospital contracts',
      currency: 'USD, GBP, EUR',
      note:     'Relevant only once Enterprise deals require invoice-based payment rather than card checkout. Each platform requires its own separate business verification — do not assume quick setup.',
    },
  ],
};

// ── BAA (Business Associate Agreement) requirement — US healthcare specific ──
const BAA_REQUIREMENT = {
  applies_to: 'United States customers only — required under HIPAA before any PHI is processed',
  status:     'template_needed', // flip to 'available' only once a real, legally-reviewed BAA exists
  summary:    'Under HIPAA, a US hospital, clinic, or private practice cannot legally use AmbientScribe with real patient data until a signed Business Associate Agreement is in place between AmbientScribe and the covered entity.',
  required_sections: [
    'Permitted uses and disclosures of PHI by AmbientScribe (the business associate)',
    'Safeguards — administrative, physical, and technical — AmbientScribe commits to',
    'Breach notification obligations and timelines',
    'Subcontractor flow-down requirements (e.g. AI provider, cloud host, MongoDB Atlas)',
    'Term and termination, including data return/destruction on contract end',
    'Audit and access rights for the covered entity',
  ],
  action_needed: 'Have a healthcare-specialized lawyer draft or review the BAA before offering it to any real US customer. Do not use a generic template without legal review — this is a contract with real liability exposure.',
};

// ── Data residency considerations for EU/Canada enterprise buyers ────────────
const DATA_RESIDENCY_NOTES = {
  current_state: 'MongoDB Atlas cluster region should be confirmed and documented — this determines actual data residency today.',
  eu_expectation: 'EU enterprise buyers under GDPR often expect or require data to stay within the EU/EEA. Confirm actual Atlas region; do not claim EU residency unless the cluster is actually provisioned in an EU region.',
  canada_expectation: 'Some Canadian provincial health privacy acts (e.g. PHIPA in Ontario) have data residency preferences for health information. Treat as a sales conversation point for Enterprise, not a current guarantee.',
  action_needed: 'Before marketing EU or Canada data residency, either provision a region-specific database cluster or clearly state data is processed in [actual region] in the privacy policy.',
};

// ── Enterprise procurement readiness — what large international buyers check ──
// This is what a hospital's CISO or procurement team actually asks for before
// signing. Status flags are deliberately honest: most are 'planned' because
// they're real future work, not things to claim on a sales call today.
const ENTERPRISE_PROCUREMENT_CHECKLIST = [
  {
    requirement: 'EHR Integration (HL7 / FHIR)',
    status:      'planned',
    detail:      'No EHR aggregator integration exists yet. Direct EHR push is listed as an Enterprise-tier feature on the pricing page — that promise needs this work done before any Enterprise contract closes. Building direct integrations per EHR vendor (Epic, Cerner, Athenahealth) is cost-prohibitive at this stage; an aggregator gateway (Redox, Innovaccer, or Healthie) is the realistic path once there is enterprise revenue to fund it.',
    blocksDeal:  true,
  },
  {
    requirement: 'Human-in-the-loop verification',
    status:      'implemented',
    detail:      'Already built: every note requires explicit physician review, edit capability, and a PIN-confirmed sign-off before it is locked. The CMO safety audit additionally blocks signing when critical conflicts (allergy violations, exam/diagnosis contradictions) are detected, requiring explicit liability-acknowledging override.',
    blocksDeal:  false,
  },
  {
    requirement: 'Clinical Decision Support Disclaimer (ToS)',
    status:      'needed',
    detail:      'Terms of Service must explicitly state AmbientScribe is an administrative documentation assistant, not a medical device or licensed practitioner, and that the signing physician bears full responsibility for the accuracy and clinical appropriateness of the final note. Have this reviewed by a healthcare-specialized lawyer alongside the BAA — do not publish disclaimer language that hasn\'t been legally reviewed.',
    blocksDeal:  true,
  },
  {
    requirement: 'SOC 2 Type II certification',
    status:      'planned',
    detail:      'Large enterprise procurement teams will typically block vetting without this. Realistic path is an automated compliance platform (Vanta, Drata, or Secureframe) to fast-track readiness, followed by an actual third-party audit period (typically 3-12 months of observed controls before the audit can complete). This is a real cost and timeline — do not promise a delivery date to a prospect until an auditor has been engaged.',
    blocksDeal:  true,
  },
  {
    requirement: 'Accent-agnostic speech recognition at scale',
    status:      'partial',
    detail:      'Current pipeline handles Nigerian, Ghanaian, Kenyan, and South African English/Pidgin localization at the prompt level (see localization.js). This is text-level interpretation, not a dedicated accent-robust speech-to-text model. For markets with extremely diverse accent populations (e.g. London or Toronto hospitals with globally diverse staff), a dedicated STT engine such as Deepgram Nova or a fine-tuned Whisper variant would materially improve raw transcription accuracy before the text even reaches the AI pipeline. Worth evaluating once volume justifies the added infrastructure cost.',
    blocksDeal:  false,
  },
  {
    requirement: 'Technology E&O and Cyber Liability Insurance',
    status:      'needed',
    detail:      'Enterprise legal departments will typically require proof of this before finalizing a contract. This protects the business if a data breach occurs or a software defect causes clinic downtime. Get quotes once enterprise deals are actually in active negotiation — premature to purchase before there is enterprise pipeline to justify the cost.',
    blocksDeal:  true,
  },
];


function byContinent() {
  const grouped = {};
  for (const f of COMPLIANCE_FRAMEWORKS) {
    if (!grouped[f.continent]) grouped[f.continent] = [];
    grouped[f.continent].push(f);
  }
  return grouped;
}

module.exports = {
  COMPLIANCE_FRAMEWORKS,
  GLOBAL_SECURITY_POSTURE,
  PAYMENT_INFRASTRUCTURE,
  BAA_REQUIREMENT,
  DATA_RESIDENCY_NOTES,
  ENTERPRISE_PROCUREMENT_CHECKLIST,
  byContinent,
};
