/**
 * CoWiTa API — environment + form registry.
 *
 * Every form type on the website maps to a schema here. The schema drives
 * server-side validation, sanitisation and the shape of stored payloads,
 * and is the source of truth for what the API accepts.
 *
 * No values in this file are secrets; secrets live in environment variables.
 */

export const FORM_TYPES = /** @type {const} */ ([
  'contact',
  'talent',
  'mentor',
  'partner',
  'collaborate',
  'learn',
  'support',
]);

export const SUBMISSION_STATUSES = ['new', 'reviewed', 'contacted', 'closed'];
export const ADMIN_ROLES = ['owner', 'admin', 'viewer'];

/** Maximum JSON body accepted for a submission, in bytes. */
export const MAX_BODY_BYTES = 32 * 1024; // 32 KB

export const LIMITS = {
  /** Requests per window, per bucket. */
  windowSeconds: 900, // 15 minutes
  perIp: 8,
  perEmail: 4,
  perFormType: 60,
  /** Maximum length of a single text answer before truncation is rejected. */
  maxTextLength: 5000,
};

export function getEnv() {
  return {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    resendApiKey: process.env.RESEND_API_KEY || '',
    adminEmail: process.env.ADMIN_EMAIL || 'info@cowita.org',
    fromEmail: process.env.FROM_EMAIL || 'CoWiTa <no-reply@cowita.org>',
    turnstileSecret: process.env.TURNSTILE_SECRET_KEY || '',
    allowedOrigins: (
      process.env.ALLOWED_ORIGINS ||
      'https://cowita.org,https://www.cowita.org'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    ipHashPepper: process.env.IP_HASH_PEPPER || '',
    siteUrl: process.env.SITE_URL || 'https://cowita.org',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  };
}

/* ---------------------------------------------------------------- helpers */

const text = (label, { required = false, min = 1, max = 300 } = {}) => ({
  label,
  type: 'text',
  required,
  min,
  max,
});

const textarea = (label, { required = false, min = 10, max = 5000 } = {}) => ({
  label,
  type: 'textarea',
  required,
  min,
  max,
});

const email = (label, { required = true } = {}) => ({
  label,
  type: 'email',
  required,
  max: 254,
});

const phone = (label) => ({ label, type: 'phone', required: false, max: 30 });

const url = (label) => ({ label, type: 'url', required: false, max: 300 });

const choice = (label, values, { required = false } = {}) => ({
  label,
  type: 'enum',
  values: [...values],
  required,
});

const multi = (label, values, { maxItems = 12 } = {}) => ({
  label,
  type: 'multi-enum',
  values: [...values],
  maxItems,
});

const yesNo = (label) => ({ label, type: 'boolean' });

/* ----------------------------------------------------------------- enums */

const CONTACT_INTERESTS = [
  'talent',
  'learning',
  'mentorship',
  'collaboration',
  'partnership',
  'financial-support',
  'general',
];

const DISCIPLINES = ['dance', 'acting', 'drawing', 'music', 'writing', 'other'];

const TALENT_EXPERIENCE = [
  'just-starting',
  'developing',
  'experienced',
  'advanced',
  'professional',
];

const TALENT_FORMAT = ['in-person', 'online', 'either', 'not-sure'];

const MENTOR_YEARS = ['under-2', '2-5', '6-10', '11-15', '16-plus'];

const MENTOR_AGE_GROUP = ['under-13', '13-15', '16-18', '18-plus', 'flexible'];

const MENTOR_FORMAT = ['in-person', 'online', 'hybrid', 'flexible'];

const MENTOR_COMMITMENT = ['short-term', 'ongoing', 'project-based', 'flexible'];

const MENTOR_EXPERTISE = [
  'creative-practice',
  'dance',
  'acting',
  'music',
  'writing',
  'visual-arts',
  'production',
  'business',
  'career-development',
  'entrepreneurship',
  'other',
];

const LEARN_AGE_RANGE = ['Under 10', '10–12', '13–15', '16–18', '19–24', '25+'];

const LEARN_LEVEL = [
  'Just starting',
  'Beginner',
  'Intermediate',
  'Advanced',
  'Professional',
];

const LEARN_FORMAT = ['In person', 'Online', 'Either'];

const LEARN_AVAILABILITY = [
  'Weekday mornings',
  'Weekday afternoons',
  'Weekday evenings',
  'Weekends',
  'Flexible',
];

const LEARN_AREAS = [
  'Dance',
  'Acting',
  'Drawing and Visual Art',
  'Music',
  'Writing and Storytelling',
  'Creative Production',
  'Digital and Creative Skills',
  'Professional and Industry Skills',
];

const PARTNER_TYPES = [
  'Schools and educational institutions',
  'Creative professionals and businesses',
  'Community organisations',
  'Companies and brands',
  'Foundations and development organisations',
  'Public institutions',
];

const PARTNER_CAN_BRING = [
  'Expertise and knowledge',
  'Mentorship',
  'Space or venue',
  'Equipment or technology',
  'Networks and connections',
  'Creative or professional opportunities',
  'Funding or programme resources',
  'Other',
];

const PARTNER_LOOKING_FOR = [
  'Young people or participants',
  'Creative collaborators',
  'Technical or specialist skills',
  'Space or venue',
  'Equipment or production resources',
  'Networks or introductions',
  'Expertise or guidance',
  'Other',
];

const COLLAB_BRINGING = [
  'creative-project',
  'event',
  'workshop',
  'community-initiative',
  'content-media',
  'skills-expertise',
  'space',
  'equipment-resources',
  'network-platform',
  'other',
];

const COLLAB_NEEDS = [
  'collaborators',
  'creative-skills',
  'technical-skills',
  'space',
  'equipment',
  'participants',
  'expertise',
  'network-connections',
  'resources',
  'other',
];

const SUPPORT_TYPES = [
  'one-time',
  'recurring',
  'specific-initiative',
  'general-support',
];

const SUPPORT_FREQUENCY = ['one-time', 'monthly', 'quarterly', 'annual', 'other'];

const SUPPORT_PURPOSE = [
  'general-support',
  'creative-development',
  'learning',
  'mentorship',
  'opportunities',
  'specific-initiative',
  'other',
];

/* --------------------------------------------------------------- registry */

export const FORM_SCHEMAS = {
  contact: {
    summaryField: 'message',
    fields: {
      name: text('Full name', { required: true, max: 120 }),
      email: email('Email address'),
      phone: phone('Phone number'),
      interest: choice('What is this about?', CONTACT_INTERESTS, { required: true }),
      subject: text('Subject', { required: true, max: 200 }),
      message: textarea('Message', { required: true, min: 10, max: 5000 }),
    },
  },

  talent: {
    summaryField: 'talent_description',
    fields: {
      full_name: text('Full name', { required: true, max: 120 }),
      age: { label: 'Age', type: 'age', required: false, min: 5, max: 120 },
      email: email('Email address'),
      phone: phone('Phone number'),
      location: text('Location', { max: 160 }),
      discipline: choice('Discipline', DISCIPLINES, { required: true }),
      talent_preview: choice('Quick-pick discipline', DISCIPLINES),
      specific_talent: text('Specific talent', { required: true, max: 200 }),
      experience_level: choice('Experience level', TALENT_EXPERIENCE),
      talent_description: textarea('About your talent', { required: true, min: 10 }),
      portfolio: url('Portfolio link'),
      development_goal: text('Development goal', { max: 1000 }),
      availability: text('Availability', { max: 200 }),
      preferred_format: choice('Preferred format', TALENT_FORMAT),
      other_information: textarea('Anything else', { min: 1, max: 5000 }),
    },
  },

  mentor: {
    summaryField: 'introduction',
    fields: {
      full_name: text('Full name', { required: true, max: 120 }),
      email: email('Email address'),
      phone: phone('Phone number'),
      location: text('Location', { max: 160 }),
      profession: text('Profession', { required: true, max: 160 }),
      organisation: text('Organisation', { max: 160 }),
      years_experience: choice('Years of experience', MENTOR_YEARS),
      website: url('Website'),
      expertise: multi('Areas of expertise', MENTOR_EXPERTISE),
      mentoring_focus: text('Mentoring focus', { required: true, max: 1000 }),
      preferred_age_group: choice('Preferred age group', MENTOR_AGE_GROUP),
      preferred_format: choice('Preferred format', MENTOR_FORMAT),
      availability: text('Availability', { max: 200 }),
      preferred_commitment: choice('Preferred commitment', MENTOR_COMMITMENT),
      introduction: textarea('About you', { required: true, min: 20 }),
      why_mentor: textarea('Why you want to mentor', { required: true, min: 10 }),
    },
  },

  partner: {
    summaryField: 'description',
    fields: {
      full_name: text('Full name', { required: true, max: 120 }),
      organisation: text('Organisation', { max: 160 }),
      email: email('Email address'),
      phone: phone('Phone number'),
      website: url('Website'),
      location: text('Location', { max: 160 }),
      partner_type: multi('Type of organisation', PARTNER_TYPES),
      can_bring: multi('What you can bring', PARTNER_CAN_BRING),
      looking_for: multi('What you are looking for', PARTNER_LOOKING_FOR),
      partnership_title: text('Partnership title', { required: true, max: 200 }),
      audience: text('Audience', { max: 200 }),
      description: textarea('Partnership description', { required: true, min: 20 }),
      contribution: textarea('Your contribution', { required: false, min: 1, max: 2000 }),
      support_needed: textarea('Support needed', { required: false, min: 1, max: 2000 }),
      participants: text('Participants', { max: 200 }),
      project_location: text('Project location', { max: 160 }),
      timeline: text('Timeline', { max: 200 }),
      relevant_links: text('Relevant links', { max: 1000 }),
      additional_information: textarea('Anything else', { min: 1, max: 5000 }),
    },
  },

  collaborate: {
    summaryField: 'description',
    fields: {
      bringing: multi('What you are bringing', COLLAB_BRINGING),
      needs: multi('What you need', COLLAB_NEEDS),
      full_name: text('Full name', { required: true, max: 120 }),
      organisation: text('Organisation', { max: 160 }),
      email: email('Email address'),
      phone: phone('Phone number'),
      location: text('Location', { max: 160 }),
      website: url('Website'),
      collaboration_title: text('Collaboration title', { required: true, max: 200 }),
      target_audience: text('Target audience', { max: 200 }),
      expected_participants: text('Expected participants', { max: 200 }),
      proposed_location: text('Proposed location', { max: 160 }),
      proposed_timeline: text('Proposed timeline', { max: 200 }),
      description: textarea('Description', { required: true, min: 20 }),
      relevant_links: text('Relevant links', { max: 1000 }),
      additional_information: textarea('Anything else', { min: 1, max: 5000 }),
    },
  },

  learn: {
    summaryField: 'learning_goal',
    fields: {
      full_name: text('Full name', { required: true, max: 120 }),
      age_range: choice('Age range', LEARN_AGE_RANGE, { required: true }),
      email: email('Email address'),
      phone: phone('Phone number'),
      location: text('Location', { max: 160 }),
      learning_area: multi('Learning areas', LEARN_AREAS),
      current_level: choice('Current level', LEARN_LEVEL),
      learning_goal: textarea('Learning goal', { required: true, min: 10 }),
      reason: textarea('Reason', { min: 1, max: 5000 }),
      desired_outcome: textarea('Desired outcome', { min: 1, max: 5000 }),
      previous_experience: textarea('Previous experience', { min: 1, max: 5000 }),
      preferred_format: choice('Preferred format', LEARN_FORMAT),
      availability: choice('Availability', LEARN_AVAILABILITY),
      additional_information: textarea('Anything else', { min: 1, max: 5000 }),
    },
  },

  support: {
    summaryField: 'support_purpose',
    fields: {
      support_type: choice('Support type', SUPPORT_TYPES, { required: true }),
      amount: { label: 'Amount', type: 'integer', required: true, min: 1, max: 10000000 },
      frequency: choice('Frequency', SUPPORT_FREQUENCY, { required: true }),
      support_purpose: choice('Support purpose', SUPPORT_PURPOSE, { required: true }),
      full_name: text('Full name', { required: true, max: 120 }),
      email: email('Email address'),
      phone: phone('Phone number'),
      organisation: text('Organisation', { max: 160 }),
      message: textarea('Message', { min: 1, max: 5000 }),
      anonymous: yesNo('Give anonymously'),
    },
  },
};

/** Field that is always stripped from the payload. */
export const HONEYPOT_FIELD = 'honeypot';

/** Consent checkbox name on every form. */
export const CONSENT_FIELD = 'consent';

/** Version string recorded with each accepted submission. */
export const CONSENT_VERSION = '2026-10-09';
