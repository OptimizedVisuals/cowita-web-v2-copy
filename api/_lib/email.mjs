/**
 * CoWiTa API — transactional email (Resend).
 *
 * Two emails go out per accepted submission:
 *   1. Admin notification with every answer, reply-to set to the sender.
 *   2. Confirmation to the person who submitted the form.
 *
 * Every interpolated value is HTML-escaped. If Resend is not configured the
 * submission is still stored and the failure is logged — email must never be
 * the reason a child's enquiry is lost.
 */

import { Resend } from 'resend';
import { CONSENT_FIELD, HONEYPOT_FIELD, getEnv } from './config.mjs';
import { escapeHtml } from './sanitize.mjs';

const FORM_LABELS = {
  contact: 'Contact message',
  talent: 'Talent expression of interest',
  mentor: 'Mentor expression of interest',
  partner: 'Partnership enquiry',
  collaborate: 'Collaboration idea',
  learn: 'Learning enquiry',
  support: 'Support offer',
};

const PRETTY_LABELS = {
  full_name: 'Full name',
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  age: 'Age',
  location: 'Location',
  organisation: 'Organisation',
  website: 'Website',
  discipline: 'Discipline',
  specific_talent: 'Specific talent',
  experience_level: 'Experience level',
  talent_description: 'About their talent',
  development_goal: 'Development goal',
  availability: 'Availability',
  preferred_format: 'Preferred format',
  interest: 'Enquiry type',
  subject: 'Subject',
  message: 'Message',
  profession: 'Profession',
  years_experience: 'Years of experience',
  expertise: 'Expertise',
  mentoring_focus: 'Mentoring focus',
  preferred_age_group: 'Preferred age group',
  preferred_commitment: 'Preferred commitment',
  introduction: 'Introduction',
  why_mentor: 'Why they want to mentor',
  partnership_title: 'Partnership title',
  partner_type: 'Organisation type',
  can_bring: 'Can bring',
  looking_for: 'Looking for',
  audience: 'Audience',
  description: 'Description',
  contribution: 'Contribution',
  support_needed: 'Support needed',
  participants: 'Participants',
  project_location: 'Project location',
  timeline: 'Timeline',
  relevant_links: 'Relevant links',
  additional_information: 'Additional information',
  bringing: 'Bringing',
  needs: 'Needs',
  collaboration_title: 'Collaboration title',
  target_audience: 'Target audience',
  expected_participants: 'Expected participants',
  proposed_location: 'Proposed location',
  proposed_timeline: 'Proposed timeline',
  age_range: 'Age range',
  learning_area: 'Learning area',
  current_level: 'Current level',
  learning_goal: 'Learning goal',
  reason: 'Reason',
  desired_outcome: 'Desired outcome',
  previous_experience: 'Previous experience',
  support_type: 'Support type',
  amount: 'Amount',
  frequency: 'Frequency',
  support_purpose: 'Support purpose',
  anonymous: 'Give anonymously',
  other_information: 'Other information',
};

function labelFor(key) {
  return PRETTY_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => escapeHtml(item)).join(', ') || '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function renderRows(data) {
  return Object.entries(data)
    .filter(([key]) => key !== HONEYPOT_FIELD && key !== CONSENT_FIELD)
    .map(
      ([key, value]) =>
        `<tr><th align="left" style="padding:6px 12px 6px 0;vertical-align:top;white-space:nowrap">` +
        `${escapeHtml(labelFor(key))}</th><td style="padding:6px 0">${renderValue(value)}</td></tr>`
    )
    .join('');
}

function wrap(title, bodyHtml) {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1c1c;line-height:1.6">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#1a5c56;margin:0 0 8px">CoWiTa</p>
    <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
    ${bodyHtml}
  </div>
</body></html>`;
}

function getResend() {
  const { resendApiKey } = getEnv();

  if (!resendApiKey) {
    return null;
  }

  return new Resend(resendApiKey);
}

/**
 * Notify the admin inbox about a new submission.
 */
export async function sendAdminNotification({ formType, submissionId, data, replyTo }) {
  const { adminEmail, fromEmail, siteUrl } = getEnv();
  const resend = getResend();

  if (!resend) {
    console.warn('email: RESEND_API_KEY not set — admin notification skipped');
    return { skipped: true };
  }

  const title = `New ${FORM_LABELS[formType] || formType} submission`;
  const body = `
    <p style="margin:0 0 16px">
      A new submission was received through the CoWiTa website.
      Review it in the admin dashboard:
      <a href="${escapeHtml(siteUrl)}/admin/">${escapeHtml(siteUrl)}/admin/</a>
    </p>
    <table style="border-collapse:collapse;font-size:14px">${renderRows(data)}</table>
    <p style="margin:20px 0 0;font-size:12px;color:#666">
      Submission ID: ${escapeHtml(submissionId)}
      &nbsp;·&nbsp; Reply directly to this email to answer the sender.
    </p>`;

  const { data: result, error } = await resend.emails.send({
    from: fromEmail,
    to: [adminEmail],
    replyTo: replyTo || undefined,
    subject: `${title} — ${data.full_name || data.name || 'no name'}`,
    html: wrap(title, body),
  });

  if (error) {
    console.error('email: admin notification failed:', error.message || error);
    return { ok: false, error: String(error.message || error) };
  }

  return { ok: true, id: result?.id };
}

/**
 * Send the person who submitted the form a confirmation.
 */
export async function sendUserConfirmation({ formType, data, to }) {
  const { fromEmail, siteUrl } = getEnv();
  const resend = getResend();

  if (!resend || !to) {
    return { skipped: true };
  }

  const firstName = String(data.full_name || data.name || '').split(' ')[0];

  const body = `
    <p style="margin:0 0 16px">
      ${firstName ? escapeHtml(firstName) + ',' : 'Hello,'}
    </p>
    <p style="margin:0 0 16px">
      Thank you for contacting CoWiTa. We have received your
      <strong>${escapeHtml(FORM_LABELS[formType] || formType)}</strong>
      and a member of our team will review it and get back to you.
    </p>
    <p style="margin:0 0 16px">
      If you need to add anything, reply to this email.
    </p>
    <table style="border-collapse:collapse;font-size:14px">${renderRows(data)}</table>
    <p style="margin:20px 0 0;font-size:12px;color:#666">
      You agreed to our privacy policy when you submitted this form.
      Read it at <a href="${escapeHtml(siteUrl)}/legal/privacy.html">${escapeHtml(siteUrl)}/legal/privacy.html</a>.
    </p>`;

  const { data: result, error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject: 'We have received your message — CoWiTa',
    html: wrap('Thank you for reaching out', body),
  });

  if (error) {
    console.error('email: user confirmation failed:', error.message || error);
    return { ok: false, error: String(error.message || error) };
  }

  return { ok: true, id: result?.id };
}
