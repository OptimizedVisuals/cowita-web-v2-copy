/**
 * CoWiTa API — Cloudflare Turnstile verification.
 *
 * The token is verified against Cloudflare's siteverify endpoint using the
 * secret key, which never leaves the server. In production a missing or
 * invalid token is a hard failure.
 */

import { getEnv } from './config.mjs';

const VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token, remoteIp) {
  const { turnstileSecret, environment } = getEnv();

  if (!turnstileSecret) {
    if (environment === 'production') {
      return {
        ok: false,
        error: 'Form protection is not configured on the server.',
        configuration: true,
      };
    }

    // Local development without keys: allow, but make it obvious in the log.
    console.warn('turnstile: TURNSTILE_SECRET_KEY not set — skipping in dev');
    return { ok: true, skipped: true };
  }

  if (!token || typeof token !== 'string' || token.length > 4096) {
    return { ok: false, error: 'Please complete the verification challenge.' };
  }

  const form = new URLSearchParams();
  form.set('secret', turnstileSecret);
  form.set('response', token);
  if (remoteIp) form.set('remoteip', remoteIp);

  let payload;

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    payload = await response.json();
  } catch (error) {
    console.error('turnstile verification request failed:', error);
    return { ok: false, error: 'Verification is temporarily unavailable. Please try again.' };
  }

  if (payload && payload.success === true) {
    return { ok: true };
  }

  return {
    ok: false,
    error: 'Verification failed. Please refresh the page and try again.',
    codes: payload && payload['error-codes'],
  };
}
