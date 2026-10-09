/**
 * CoWiTa API — admin authentication and authorisation.
 *
 * Admin requests carry a Supabase access token in the Authorization header.
 * We verify the token, look the user up in admin_users for their role, and
 * require an MFA-verified session (AAL2) for anything that reads or changes
 * submissions.
 *
 * Role ranking: owner > admin > viewer.
 *   viewer  — read submissions and export
 *   admin   — viewer plus status changes, notes and deletion
 *   owner   — admin plus managing the admin list
 */

import { getEnv } from './config.mjs';
import { getPublicClient, getServiceClient } from './supabase.mjs';

const ROLE_RANK = { viewer: 1, admin: 2, owner: 3 };

/** Decode a JWT payload without verifying it (the token is verified by Supabase). */
function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split('.');
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8'
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

/**
 * Resolve the caller.
 *
 * @returns {Promise<
 *   | { ok: true, user: object, role: string, email: string }
 *   | { ok: false, status: number, error: string }
 * >}
 */
export async function authenticate(req) {
  const token = getBearerToken(req);

  if (!token) {
    return { ok: false, status: 401, error: 'Authentication required.' };
  }

  let user;

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return { ok: false, status: 401, error: 'Your session has expired. Please sign in again.' };
    }

    user = data.user;
  } catch (error) {
    console.error('auth: token verification failed:', error.message);
    return { ok: false, status: 401, error: 'Authentication could not be verified.' };
  }

  // MFA: the dashboard must present an AAL2 token.
  const claims = decodeJwtPayload(token);
  const aal = claims?.aal || 'aal1';

  if (aal !== 'aal2') {
    return {
      ok: false,
      status: 403,
      error:
        'Two-factor authentication is required for the admin area. Please complete MFA setup and sign in again.',
      code: 'mfa_required',
    };
  }

  let adminRow;

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('admin_users')
      .select('role, email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    adminRow = data;
  } catch (error) {
    console.error('auth: admin lookup failed:', error.message);
    return { ok: false, status: 500, error: 'Could not check your access level.' };
  }

  if (!adminRow) {
    return { ok: false, status: 403, error: 'This account does not have admin access.' };
  }

  return {
    ok: true,
    user,
    role: adminRow.role,
    email: adminRow.email || user.email || '',
  };
}

export function hasRole(role, required) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[required] || 0);
}

/**
 * Guard helper used by every admin endpoint.
 * Returns the auth context, or writes the error response and returns null.
 */
export async function requireAdmin(req, res, { role = 'viewer' } = {}) {
  const auth = await authenticate(req);

  if (!auth.ok) {
    sendAuthError(res, auth);
    return null;
  }

  if (!hasRole(auth.role, role)) {
    sendAuthError(res, {
      status: 403,
      error: 'You do not have permission to do that.',
    });
    return null;
  }

  return auth;
}

function sendAuthError(res, auth) {
  const payload = { ok: false, error: auth.error };
  if (auth.code) payload.code = auth.code;
  res.writeHead(auth.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

/** Record an admin action in the audit trail. */
export async function recordAudit(auth, { submissionId, action, fromStatus, toStatus, note }) {
  try {
    const supabase = getServiceClient();
    await supabase.from('submission_events').insert({
      submission_id: submissionId || null,
      actor_id: auth.user.id,
      actor_email: auth.email,
      action,
      from_status: fromStatus || null,
      to_status: toStatus || null,
      note: note || null,
    });
  } catch (error) {
    console.error('audit log write failed:', error.message);
  }
}

export { getEnv, getPublicClient };
