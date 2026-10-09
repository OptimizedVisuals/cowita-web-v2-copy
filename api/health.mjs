/**
 * GET /api/health
 *
 * Lightweight health check for uptime monitoring (Better Stack, UptimeRobot,
 * or similar). Reports whether the API can reach its critical dependencies
 * without leaking any configuration values.
 *
 * 200 { ok: true,  checks: { config: "ok", database: "ok" } }
 * 503 { ok: false, checks: { ... } }
 */

import { getEnv } from './_lib/config.mjs';
import { sendError, sendJson } from './_lib/http.mjs';
import { getServiceClient } from './_lib/supabase.mjs';

const STARTED_AT = new Date().toISOString();

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendError(res, 405, 'Method not allowed.');
  }

  const env = getEnv();
  const checks = {
    config: env.supabaseUrl && env.supabaseServiceKey ? 'ok' : 'missing',
    database: 'unknown',
    email: env.resendApiKey ? 'ok' : 'missing',
    captcha: env.turnstileSecret ? 'ok' : 'missing',
  };

  try {
    const supabase = getServiceClient();
    // Cheapest possible round trip: ask for zero rows.
    const { error } = await supabase
      .from('submissions')
      .select('id', { head: true, count: 'exact' })
      .limit(1);

    checks.database = error ? 'error' : 'ok';
  } catch (error) {
    checks.database = 'error';
    console.error('health check failed:', error.message);
  }

  const healthy = checks.config === 'ok' && checks.database === 'ok';

  if (!healthy) {
    return sendJson(res, 503, { ok: false, error: 'The service is not fully healthy.', checks });
  }

  return sendJson(res, 200, {
    ok: true,
    started_at: STARTED_AT,
    checks,
  });
}
