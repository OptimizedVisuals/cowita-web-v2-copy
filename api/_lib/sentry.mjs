/**
 * CoWiTa API — GlitchTip error tracking.
 *
 * GlitchTip is Sentry-protocol compatible, so we use the Sentry SDK and
 * point it at the GlitchTip DSN. When GLITCHTIP_DSN is unset (tests,
 * local dev without a .env) the integration is a no-op.
 *
 * Vercel freezes serverless functions the moment the response is sent, so
 * events must be flushed with waitUntil() rather than awaited inline.
 */

import * as Sentry from '@sentry/node';

let initialised = false;

/**
 * Initialise error tracking. Safe to call on every request; does nothing
 * after the first successful call.
 */
export function initErrorTracking() {
  if (initialised) return;

  const dsn = process.env.GLITCHTIP_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    // GlitchTip does not support sessions or performance transactions.
    autoSessionTracking: false,
    tracesSampleRate: 0,
    // Never send PII to GlitchTip; the API already hashes identifiers.
    sendDefaultPii: false,
    // Reduce noise: ignore expected validation / auth failures.
    ignoreErrors: [
      'Payload too large',
      'Invalid JSON body',
      'Unsupported content type',
      'Not authorised',
    ],
  });

  initialised = true;
}

/**
 * Report an error to GlitchTip without blocking the response.
 *
 * Call this from a catch block. It always logs locally (so Vercel log
 * search still works) and, if GlitchTip is configured, sends the event in
 * the background via waitUntil().
 *
 * @param {unknown} error
 * @param {Record<string, unknown>} [context] — extra tags/fields
 */
export async function captureError(error, context = {}) {
  const message =
    error && error.message ? error.message : String(error);

  console.error(message, context);

  if (!initialised) return;

  try {
    const { waitUntil } = await import('@vercel/functions');

    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, String(value));
      }
      Sentry.captureException(error);
    });

    // Do not await; let the function return while GlitchTip sends.
    waitUntil(Sentry.flush(2000));
  } catch {
    // If anything above fails, the local log already happened.
  }
}

/**
 * Report a non-error message (e.g. degraded configuration). Useful for
 * "this shouldn't happen but isn't fatal" cases.
 *
 * @param {string} message
 * @param {Record<string, unknown>} [context]
 */
export async function captureMessage(message, context = {}) {
  console.warn(message, context);

  if (!initialised) return;

  try {
    const { waitUntil } = await import('@vercel/functions');

    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, String(value));
      }
      Sentry.captureMessage(message, 'warning');
    });

    waitUntil(Sentry.flush(2000));
  } catch {
    // Already logged locally.
  }
}