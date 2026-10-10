/**
 * POST /api/forms/:type
 *
 * Accepts a CoWiTa form submission, validates and sanitises it server-side,
 * verifies the CAPTCHA and rate limits, stores it in Supabase and sends the
 * admin and user emails.
 *
 * Response contract
 *   200 { ok: true, id }
 *   400 { ok: false, error }
 *   403 { ok: false, error }
 *   405 { ok: false, error }
 *   413 { ok: false, error }
 *   422 { ok: false, error, errors: { field: message } }
 *   429 { ok: false, error, retryAfterSeconds }
 *   500 { ok: false, error }
 *
 * When the request looks like a no-JavaScript form post (Accept: text/html)
 * a successful submission redirects to the thank-you page instead of JSON.
 */

import {
  FORM_TYPES,
  HONEYPOT_FIELD,
  CONSENT_VERSION,
  LIMITS,
  getEnv,
} from '../_lib/config.mjs';
import {
  getClientIp,
  hashIp,
  hashValue,
  isTrustedRequest,
  looksLikeBot,
  methodNotAllowed,
  readBody,
  sendError,
  sendOk,
} from '../_lib/http.mjs';
import { validateSubmission } from '../_lib/validation.mjs';
import { getServiceClient } from '../_lib/supabase.mjs';
import { consume } from '../_lib/ratelimit.mjs';
import { verifyTurnstile } from '../_lib/turnstile.mjs';
import { logEvent, logSubmission } from '../_lib/logger.mjs';
import { sendAdminNotification, sendUserConfirmation } from '../_lib/email.mjs';
import { initErrorTracking, captureError } from '../_lib/sentry.mjs';

const CAPTCHA_FIELDS = ['turnstile_token', 'cf-turnstile-response', 'captchaToken'];

export default async function handler(req, res) {
  initErrorTracking();

  const env = getEnv();

  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  const formType = String(req.query?.type || '').toLowerCase();

  if (!FORM_TYPES.includes(formType)) {
    return sendError(res, 404, 'Unknown form type.');
  }

  const wantsHtml = String(req.headers.accept || '').includes('text/html');

  // ---- 1. Origin / Referer check -----------------------------------------
  if (!isTrustedRequest(req, env.allowedOrigins)) {
    logEvent('warn', 'submission_rejected', { form_type: formType, reason: 'origin' });
    return sendError(res, 403, 'This request did not come from the CoWiTa website.');
  }

  // ---- 2. Coarse bot screen ---------------------------------------------
  if (looksLikeBot(req)) {
    logEvent('warn', 'submission_rejected', { form_type: formType, reason: 'user_agent' });
    return sendError(res, 403, 'This request could not be verified.');
  }

  // ---- 3. Body -----------------------------------------------------------
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    if (error.tooLarge) {
      return sendError(res, 413, 'This submission is too large. Please shorten your answers.');
    }
    if (error.badJson || error.badType) {
      return sendError(res, 400, 'The submission could not be read. Please try again.');
    }
    await captureError(error, { form_type: formType, stage: 'read_body' });
    return sendError(res, 400, 'The submission could not be read. Please try again.');
  }

  // ---- 4. Honeypot (silent drop) ----------------------------------------
  if (body && typeof body === 'object' && String(body[HONEYPOT_FIELD] || '').trim()) {
    logEvent('warn', 'submission_rejected', { form_type: formType, reason: 'honeypot' });
    // Pretend success so the bot does not learn anything.
    if (wantsHtml) {
      res.writeHead(303, { Location: '/get-involved/thank-you.html' });
      return res.end();
    }
    return sendOk(res, { id: null });
  }

  // ---- 5. Rate limiting --------------------------------------------------
  const ip = getClientIp(req);
  const ipHash = hashIp(ip, env.ipHashPepper);

  const emailForLimit =
    typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const preEmailHash = emailForLimit
    ? hashValue(emailForLimit, env.ipHashPepper)
    : '';

  try {
    const verdict = await consume([
      { bucket: `ip:${ipHash}`, limit: LIMITS.perIp },
      { bucket: `email:${preEmailHash}`, limit: LIMITS.perEmail },
      { bucket: `form:${formType}:${ipHash}`, limit: LIMITS.perFormType },
    ]);

    if (verdict.limited) {
      res.setHeader('Retry-After', String(verdict.retryAfterSeconds));
      logEvent('warn', 'submission_rejected', { form_type: formType, reason: 'rate_limit' });
      return sendError(
        res,
        429,
        'Too many submissions from this device. Please wait a few minutes and try again.'
      );
    }
  } catch (error) {
    await captureError(error, { form_type: formType, stage: 'rate_limit' });
  }

  // ---- 6. CAPTCHA --------------------------------------------------------
  const token = CAPTCHA_FIELDS.map((field) => body?.[field]).find(Boolean);
  const captcha = await verifyTurnstile(token, ip);

  if (!captcha.ok) {
    logEvent('warn', 'submission_rejected', {
      form_type: formType,
      reason: 'captcha',
      codes: captcha.codes,
    });
    return sendError(res, 403, captcha.error);
  }

  // ---- 7. Validation -----------------------------------------------------
  const result = validateSubmission(formType, body);

  if (!result.ok) {
    return sendError(
      res,
      422,
      result.general || 'Please correct the highlighted fields and try again.',
      result.errors
    );
  }

  if (result.ignored && result.ignored.length) {
    logEvent('warn', 'submission_unexpected_fields', {
      form_type: formType,
      fields: result.ignored.slice(0, 20),
    });
  }

  // ---- 8. Persist --------------------------------------------------------
  const supabase = getServiceClient();

  const record = {
    form_type: formType,
    status: 'new',
    full_name: result.fullName || null,
    email: result.email || null,
    phone: result.phone || null,
    age: typeof result.data.age === 'number' ? result.data.age : null,
    payload: result.data,
    consent: true,
    consent_version: CONSENT_VERSION,
    ip_hash: ipHash,
    user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
    referer: String(req.headers.referer || '').slice(0, 500),
  };

  const { data: inserted, error: insertError } = await supabase
    .from('submissions')
    .insert(record)
    .select('id, created_at')
    .single();

  if (insertError) {
    logSubmission({
      form_type: formType,
      status: 'error',
      ip_hash: ipHash,
      reason: 'insert_failed',
    });
    await captureError(insertError, {
      form_type: formType,
      stage: 'insert',
      ip_hash: ipHash,
    });
    return sendError(
      res,
      500,
      'We could not save your submission. Please try again, or email us at info@cowita.org.'
    );
  }

  const submissionId = inserted.id;

  await supabase.from('submission_events').insert({
    submission_id: submissionId,
    actor_email: result.email || null,
    action: 'created',
    to_status: 'new',
    note: 'Submission received through the website.',
  });

  logSubmission({
    form_type: formType,
    status: 'accepted',
    ip_hash: ipHash,
    email_hash: preEmailHash,
    id: submissionId,
  });

  // ---- 9. Emails (never block the submission) ----------------------------
  const emailResults = await Promise.allSettled([
    sendAdminNotification({
      formType,
      submissionId,
      data: result.data,
      replyTo: result.email || undefined,
    }),
    sendUserConfirmation({
      formType,
      data: result.data,
      to: result.email,
    }),
  ]);

  for (const settled of emailResults) {
    if (settled.status === 'rejected') {
      await captureError(settled.reason, {
        form_type: formType,
        stage: 'email',
        submission_id: submissionId,
      });
    }
  }

  // ---- 10. Respond -------------------------------------------------------
  if (wantsHtml) {
    res.writeHead(303, { Location: '/get-involved/thank-you.html' });
    return res.end();
  }

  return sendOk(res, {
    id: submissionId,
    form_type: formType,
    consent_version: CONSENT_VERSION,
  });
}