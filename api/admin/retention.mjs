/**
 * POST /api/admin/retention
 *
 * Scheduled cleanup (Vercel Cron). Protected by the CRON_SECRET header rather
 * than a user session, because no human is present. It:
 *
 *   1. Deletes submissions older than RETENTION_DAYS (default 730 / 2 years).
 *   2. Purges rate-limit windows older than a day.
 *
 * Configure in vercel.json:
 *   { "crons": [{ "path": "/api/admin/retention", "schedule": "0 3 * * *" }] }
 * and let Vercel send the CRON_SECRET bearer token.
 */

import { sendError, sendJson } from '../_lib/http.mjs';
import { getServiceClient } from '../_lib/supabase.mjs';
import { logEvent } from '../_lib/logger.mjs';
import { getEnv } from '../_lib/config.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'POST, GET');
    return sendError(res, 405, 'Method not allowed.');
  }

  const secret = process.env.CRON_SECRET || '';

  if (!secret) {
    return sendError(res, 503, 'Retention job is not configured.');
  }

  const provided =
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    String(req.headers['x-cron-secret'] || '');

  if (provided !== secret) {
    logEvent('warn', 'retention_unauthorised');
    return sendError(res, 401, 'Not authorised.');
  }

  const retentionDays = Number.parseInt(process.env.RETENTION_DAYS || '730', 10);
  const supabase = getServiceClient();

  const { data: purged, error: purgeError } = await supabase.rpc(
    'purge_expired_submissions',
    { p_retention_days: retentionDays }
  );

  if (purgeError) {
    console.error('retention purge failed:', purgeError.message);
    return sendError(res, 500, 'Retention job failed.');
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { error: rateError } = await supabase
    .from('rate_limits')
    .delete()
    .lt('window_start', cutoff);

  if (rateError) {
    console.error('rate limit purge failed:', rateError.message);
  }

  logEvent('info', 'retention_run', {
    purged: purged || 0,
    retention_days: retentionDays,
    site: getEnv().siteUrl,
  });

  return sendJson(res, 200, {
    ok: true,
    purged_submissions: purged || 0,
    retention_days: retentionDays,
    rate_limit_windows_cleared: !rateError,
  });
}
