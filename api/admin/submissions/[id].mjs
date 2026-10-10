/**
 * /api/admin/submissions/:id
 *
 *   GET     → one submission (viewer)
 *   PATCH   → update status and/or internal notes (admin)
 *   DELETE  → soft delete (admin); ?hard=1 permanently deletes (owner)
 *   POST    → restore a soft-deleted submission (admin, { action: "restore" })
 *
 * Every state change is written to submission_events (the audit trail).
 */

import { SUBMISSION_STATUSES } from '../../_lib/config.mjs';
import { readBody, sendError, sendJson } from '../../_lib/http.mjs';
import { recordAudit, requireAdmin } from '../../_lib/auth.mjs';
import { getServiceClient } from '../../_lib/supabase.mjs';
import { cleanMultiline } from '../../_lib/sanitize.mjs';
import { logEvent } from '../../_lib/logger.mjs';
import { initErrorTracking, captureError } from '../../_lib/sentry.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  initErrorTracking();

  const id = String(req.query?.id || '');

  if (!UUID_PATTERN.test(id)) {
    return sendError(res, 400, 'Invalid submission id.');
  }

  const minimumRole = req.method === 'GET' ? 'viewer' : 'admin';
  const auth = await requireAdmin(req, res, { role: minimumRole });
  if (!auth) return;

  const supabase = getServiceClient();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      await captureError(error, { stage: 'admin_get', actor: auth.email, id });
      return sendError(res, 500, 'Could not load the submission.');
    }
    if (!data) return sendError(res, 404, 'Submission not found.');

    const { data: events } = await supabase
      .from('submission_events')
      .select('id, actor_email, action, from_status, to_status, note, created_at')
      .eq('submission_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    return sendJson(res, 200, { ok: true, submission: data, events: events || [] });
  }

  if (req.method === 'PATCH') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendError(res, 400, 'Could not read the request body.');
    }

    const updates = {};
    let action = 'updated';
    let fromStatus = null;

    const { data: existing, error: readError } = await supabase
      .from('submissions')
      .select('status')
      .eq('id', id)
      .maybeSingle();

    if (readError) {
      await captureError(readError, { stage: 'admin_update_read', actor: auth.email, id });
      return sendError(res, 500, 'Could not load the submission.');
    }
    if (!existing) return sendError(res, 404, 'Submission not found.');
    fromStatus = existing.status;

    if (body.status !== undefined) {
      const status = String(body.status);
      if (!SUBMISSION_STATUSES.includes(status)) {
        return sendError(res, 400, 'Unknown status.');
      }
      updates.status = status;
      action = 'status_changed';
    }

    if (body.internal_notes !== undefined) {
      updates.internal_notes = cleanMultiline(body.internal_notes, 5000);
      if (action === 'updated') action = 'note_updated';
    }

    if (!Object.keys(updates).length) {
      return sendError(res, 400, 'Nothing to update.');
    }

    const { data, error } = await supabase
      .from('submissions')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      await captureError(error, { stage: 'admin_update', actor: auth.email, id });
      return sendError(res, 500, 'Could not update the submission.');
    }

    await recordAudit(auth, {
      submissionId: id,
      action,
      fromStatus,
      toStatus: updates.status || null,
      note: updates.internal_notes !== undefined ? 'Internal note updated.' : null,
    });

    logEvent('info', 'admin_update', {
      actor: auth.email,
      id,
      action,
      to_status: updates.status || null,
    });

    return sendJson(res, 200, { ok: true, submission: data });
  }

  if (req.method === 'POST') {
    let body = {};
    try {
      body = await readBody(req);
    } catch {
      body = {};
    }

    if (String(body.action || '') !== 'restore') {
      return sendError(res, 400, 'Unsupported action.');
    }

    const { data, error } = await supabase
      .from('submissions')
      .update({ deleted_at: null })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      await captureError(error, { stage: 'admin_restore', actor: auth.email, id });
      return sendError(res, 500, 'Could not restore the submission.');
    }

    await recordAudit(auth, {
      submissionId: id,
      action: 'restored',
      toStatus: data?.status || null,
    });

    return sendJson(res, 200, { ok: true, submission: data });
  }

  if (req.method === 'DELETE') {
    const hard = String(req.query?.hard || '') === '1';

    if (hard && auth.role !== 'owner') {
      return sendError(res, 403, 'Only an owner can permanently delete a submission.');
    }

    if (hard) {
      const { error } = await supabase.from('submissions').delete().eq('id', id);
      if (error) {
        await captureError(error, { stage: 'admin_hard_delete', actor: auth.email, id });
        return sendError(res, 500, 'Could not delete the submission.');
      }

      logEvent('warn', 'admin_hard_delete', { actor: auth.email, id });
      // The submission row is gone, so the cascade removes its events; record
      // the deletion separately for the audit trail.
      await recordAudit(auth, { submissionId: null, action: 'permanently_deleted', note: id });
      return sendJson(res, 200, { ok: true, deleted: 'permanent' });
    }

    const { error } = await supabase
      .from('submissions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      await captureError(error, { stage: 'admin_soft_delete', actor: auth.email, id });
      return sendError(res, 500, 'Could not delete the submission.');
    }

    await recordAudit(auth, { submissionId: id, action: 'deleted' });
    logEvent('warn', 'admin_soft_delete', { actor: auth.email, id });

    return sendJson(res, 200, { ok: true, deleted: 'soft' });
  }

  res.setHeader('Allow', 'GET, PATCH, POST, DELETE');
  return sendError(res, 405, 'Method not allowed.');
}