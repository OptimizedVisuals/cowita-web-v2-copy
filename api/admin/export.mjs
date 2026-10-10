/**
 * GET /api/admin/export
 *
 * Streams a CSV of submissions honouring the same filters as the list
 * endpoint (form_type, status, q, from, to). Every cell is escaped and
 * formula-injection guarded.
 */

import { FORM_SCHEMAS, FORM_TYPES, SUBMISSION_STATUSES } from '../_lib/config.mjs';
import { sendError } from '../_lib/http.mjs';
import { requireAdmin, recordAudit } from '../_lib/auth.mjs';
import { getServiceClient } from '../_lib/supabase.mjs';
import { escapeCsv } from '../_lib/sanitize.mjs';
import { logEvent } from '../_lib/logger.mjs';
import { initErrorTracking, captureError } from '../_lib/sentry.mjs';

const META_COLUMNS = [
  'id',
  'created_at',
  'form_type',
  'status',
  'full_name',
  'email',
  'phone',
  'age',
];

const MAX_ROWS = 10000;

function allAnswerColumns() {
  const columns = new Set();
  for (const schema of Object.values(FORM_SCHEMAS)) {
    for (const key of Object.keys(schema.fields)) columns.add(key);
  }
  return [...columns].sort();
}

function cell(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return value;
}

export default async function handler(req, res) {
  initErrorTracking();

  const auth = await requireAdmin(req, res, { role: 'viewer' });
  if (!auth) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'Method not allowed.');
  }

  const query = req.query || {};

  let builder = getServiceClient()
    .from('submissions')
    .select('*')
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

  if (query.from) builder = builder.gte('created_at', new Date(query.from).toISOString());
  if (query.to) builder = builder.lte('created_at', new Date(query.to).toISOString());

  if (query.q) {
    const term = String(query.q).slice(0, 100).replace(/[%,()*\\]/g, ' ').trim();
    if (term) {
      builder = builder.or(
        ['full_name', 'email', 'phone', 'form_type']
          .map((column) => `${column}.ilike.%${term}%`)
          .join(',')
      );
    }
  }

  const { data, error } = await builder
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    await captureError(error, { stage: 'admin_export', actor: auth.email });
    return sendError(res, 500, 'Could not build the export.');
  }

  const rows = data || [];
  const answerColumns = allAnswerColumns();
  const header = [...META_COLUMNS, ...answerColumns];

  const lines = [header.join(',')];

  for (const row of rows) {
    const payload = row.payload || {};
    const values = [
      ...META_COLUMNS.map((column) => cell(row[column])),
      ...answerColumns.map((column) => cell(payload[column])),
    ];
    lines.push(values.map(escapeCsv).join(','));
  }

  const csv = `\uFEFF${lines.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10);

  await recordAudit(auth, {
    submissionId: null,
    action: 'exported',
    note: `${rows.length} rows exported as CSV.`,
  });

  logEvent('info', 'admin_export', { actor: auth.email, rows: rows.length });

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="cowita-submissions-${stamp}.csv"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(csv);
}