/**
 * CoWiTa API — input sanitisation.
 *
 * Values are cleaned before they are stored and escaped again whenever they
 * are placed in an email or CSV. Nothing is trusted from the client.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMAIL_PATTERN = /^[^\s@"'<>]{1,64}@[^\s@"'<>.]{1,190}(\.[^\s@"'<>.]+)+$/;
const PHONE_PATTERN = /^[+()\-.\s0-9]{4,30}$/;

/** Trim, collapse runs of whitespace and remove control characters. */
export function cleanText(value, maxLength = 5000) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(CONTROL_CHARS, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Multi-line variant: keeps single newlines, caps consecutive blank lines. */
export function cleanMultiline(value, maxLength = 5000) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(CONTROL_CHARS, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function cleanEmail(value) {
  const cleaned = cleanText(value, 254).toLowerCase();
  return EMAIL_PATTERN.test(cleaned) ? cleaned : '';
}

export function isValidEmail(value) {
  return Boolean(cleanEmail(value));
}

export function cleanPhone(value) {
  const cleaned = cleanText(value, 30);
  if (!cleaned) return '';
  return PHONE_PATTERN.test(cleaned) ? cleaned : '';
}

export function isValidPhone(value) {
  const cleaned = cleanText(value, 30);
  return !cleaned || PHONE_PATTERN.test(cleaned);
}

export function cleanUrl(value) {
  const cleaned = cleanText(value, 300);
  if (!cleaned) return '';
  const candidate = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : '';
  } catch {
    return '';
  }
}

/** HTML-escape a value for safe interpolation into email/HTML templates. */
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape a value for a CSV cell. */
export function escapeCsv(value) {
  const text = String(value == null ? '' : value);
  const needsQuotes = /[",\n\r]/.test(text);
  const safe = text.replace(/"/g, '""');
  // Prevent spreadsheet formula injection.
  const guarded = /^[=+\-@\t\r]/.test(safe) ? `'${safe}` : safe;
  return needsQuotes ? `"${guarded}"` : guarded;
}

/** Convert a 0/1/true/"true"/"on"/"yes" style value to a strict boolean. */
export function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalised);
  }
  return false;
}
