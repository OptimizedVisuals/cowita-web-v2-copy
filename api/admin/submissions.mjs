/**
 * GET /api/admin/submissions
 *
 * Lists submissions for the admin dashboard.
 *
 * Query parameters
 *   form_type  contact|talent|mentor|partner|collaborate|learn|support
 *   status     new|reviewed|contacted|closed
 *   q          free text search over name, email and answers
 *   from,to    ISO dates (created_at range)
 *   page       1-based page number (default 1)
 *   per_page   1..100 (default 25)
 *   sort       created_at|-created_at|updated_at|-updated_at
 *
 * Requires an authenticated admin with an MFA-verified session.
 */

import { FORM_TYPES, SUBMISSION_STATUSES } from '../_lib/config.mjs';
import { sendError, sendJson } from '../_lib/http.mjs';
import { requireAdmin } from '../_lib/auth.mjs';
import { getServiceClient } from '../_lib/supabase.mjs';
import { logEvent } from '../_lib/logger.mjs';
import { initErrorTracking, captureError } from '../_lib/sentry.mjs';

export default async function handler(req, res) {
  initErrorTracking();

  const auth = await requireAdmin(req, res, { role: 'viewer' });
  if (!auth) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'Method not allowed.');
  }

  const query = req.query || {};
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const perPage = Math.min(100, Math.max(1, Number.parseInt(query.per_page, 10) || 25));
  const sort = ['created_at', '-created_at', 'updated_at', '-updated_at'].includes(query.sort)
    ? query.sort
    : '-created_at';

  const ascending = !sort.startsWith('-');
  const sortColumn = sort.replace(/^-/, '');

  let builder = getServiceClient()
    .from('submissions')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.form_type) {
    if (!FORM_TYPES.includes(query.form_type)) {
      return sendError(res, 400, 'Unknown form type filter.');
    }
    builder = builder.eq('form_type', query.form_type);
  }

  if (query.status) {
    if (!SUBMISSION_STATUSES.includes(query.status)) {
      return sendError(res, 400, 'Unknown status filter.');
    }
    builder = builder.eq('status', query.status);
  }

  if (query.from) {
    builder = builder.gte('created_at', new Date(query.from).toISOString());
  }

  if (query.to) {
    builder = builder.lte('created_at', new Date(query.to).toISOString());
  }

  if (query.q) {
    // PostgREST `or` syntax; strip characters that would break the filter.
    const term = String(query.q).slice(0, 100).replace(/[%,()*\\]/g, ' ').trim();

    if (term) {
      builder = builder.or(
        ['full_name', 'email', 'phone', 'form_type']
          .map((column) => `${column}.ilike.%${term}%`)
          .join(',')
      );
    }
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, error, count } = await builder
    .order(sortColumn, { ascending })
    .range(from, to);

  if (error) {
    await captureError(error, { stage: 'admin_list', actor: auth.email });
    return sendError(res, 500, 'Could not load submissions.');
  }

  logEvent('info', 'admin_list', {
    actor: auth.email,
    filters: { form_type: query.form_type, status: query.status, page },
    count: data?.length || 0,
  });

  return sendJson(res, 200, {
    ok: true,
    submissions: data || [],
    page,
    per_page: perPage,
    total: count || 0,
    total_pages: count ? Math.ceil(count / perPage) : 0,
  });
}