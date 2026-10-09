/**
 * CoWiTa API — structured logging.
 *
 * One JSON line per event so Vercel/host log search stays useful. Never log
 * raw personal data: identifiers are hashed or omitted, and message bodies
 * are not written to logs.
 */

export function logEvent(level, event, fields = {}) {
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };

  const line = JSON.stringify(record);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }

  return record;
}

/** Log a submission outcome without leaking personal data. */
export function logSubmission(fields) {
  return logEvent(fields.status === 'error' ? 'error' : 'info', 'submission', {
    form_type: fields.form_type,
    status: fields.status,
    ip_hash: fields.ip_hash,
    email_hash: fields.email_hash,
    id: fields.id,
    reason: fields.reason,
  });
}
