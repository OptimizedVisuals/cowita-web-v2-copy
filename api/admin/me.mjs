/**
 * GET /api/admin/me
 *
 * Returns the signed-in admin's email and role so the dashboard can show the
 * right controls. Confirms MFA is complete (an AAL1 session gets a 403 with
 * code "mfa_required").
 */

import { sendError, sendJson } from '../_lib/http.mjs';
import { authenticate } from '../_lib/auth.mjs';
import { initErrorTracking } from '../_lib/sentry.mjs';

export default async function handler(req, res) {
  initErrorTracking();

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'Method not allowed.');
  }

  const auth = await authenticate(req);

  if (!auth.ok) {
    const payload = { ok: false, error: auth.error };
    if (auth.code) payload.code = auth.code;
    res.writeHead(auth.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    return res.end(JSON.stringify(payload));
  }

  return sendJson(res, 200, {
    ok: true,
    email: auth.email,
    role: auth.role,
  });
}