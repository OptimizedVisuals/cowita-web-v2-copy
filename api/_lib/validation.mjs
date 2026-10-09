/**
 * CoWiTa API — server-side validation.
 *
 * Validates and sanitises a submitted form against its schema. Returns:
 *   { ok: true, data, email, fullName, phone }
 *   { ok: false, errors: { fieldName: message }, general: null }
 *
 * Errors are field-keyed so the frontend can attach them to inputs.
 */

import {
  CONSENT_FIELD,
  FORM_SCHEMAS,
  HONEYPOT_FIELD,
  LIMITS,
  MAX_BODY_BYTES,
} from './config.mjs';
import {
  cleanEmail,
  cleanMultiline,
  cleanPhone,
  cleanText,
  cleanUrl,
  isValidPhone,
  toBoolean,
} from './sanitize.mjs';

/** Reject payloads that are too large before doing any work. */
export function isPayloadTooLarge(raw) {
  return typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES;
}

function fieldError(errors, name, message) {
  if (!errors[name]) {
    errors[name] = message;
  }
}

/** Should a validated value be stored on the submission? */
function keepValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return true;
  return value !== '' && value !== null && value !== undefined;
}

function validateField(spec, field, name, errors) {
  switch (spec.type) {
    case 'text': {
      const value = cleanText(field, spec.max);
      if (!value) {
        if (spec.required) fieldError(errors, name, `${spec.label} is required.`);
        return '';
      }
      if (spec.required && value.length < (spec.min || 1)) {
        fieldError(errors, name, `${spec.label} is required.`);
        return '';
      }
      return value;
    }

    case 'textarea': {
      const value = cleanMultiline(field, spec.max);
      if (!value) {
        if (spec.required) fieldError(errors, name, `${spec.label} is required.`);
        return '';
      }
      if (value.length < (spec.min || 1)) {
        fieldError(
          errors,
          name,
          `${spec.label} must be at least ${spec.min} characters.`
        );
        return '';
      }
      return value;
    }

    case 'email': {
      const value = cleanEmail(field);
      if (!value) {
        if (spec.required) {
          fieldError(errors, name, 'Please enter a valid email address.');
        } else if (cleanText(field, 254)) {
          fieldError(errors, name, 'Please enter a valid email address.');
        }
        return '';
      }
      return value;
    }

    case 'phone': {
      const raw = cleanText(field, spec.max);
      if (!raw) {
        if (spec.required) fieldError(errors, name, `${spec.label} is required.`);
        return '';
      }
      if (!isValidPhone(raw)) {
        fieldError(errors, name, 'Please enter a valid phone number.');
        return '';
      }
      return cleanPhone(raw);
    }

    case 'url': {
      const raw = cleanText(field, spec.max);
      if (!raw) {
        if (spec.required) fieldError(errors, name, `${spec.label} is required.`);
        return '';
      }
      const value = cleanUrl(raw);
      if (!value) {
        fieldError(errors, name, `${spec.label} must be a valid web address.`);
        return '';
      }
      return value;
    }

    case 'enum': {
      const value = cleanText(field, 200);
      if (!value) {
        if (spec.required) fieldError(errors, name, `Please choose a ${spec.label}.`);
        return '';
      }
      if (!spec.values.includes(value)) {
        fieldError(errors, name, `${spec.label}: please choose a listed option.`);
        return '';
      }
      return value;
    }

    case 'multi-enum': {
      const list = Array.isArray(field) ? field : field == null || field === '' ? [] : [field];
      const cleaned = [];

      for (const item of list.slice(0, spec.maxItems)) {
        const value = cleanText(item, 120);
        if (!value) continue;
        if (!spec.values.includes(value)) {
          fieldError(errors, name, `${spec.label}: “${value}” is not a valid option.`);
          continue;
        }
        if (!cleaned.includes(value)) cleaned.push(value);
      }

      if (spec.required && cleaned.length === 0) {
        fieldError(errors, name, `Please choose at least one option for ${spec.label}.`);
      }

      return cleaned;
    }

    case 'boolean': {
      return toBoolean(field);
    }

    case 'integer': {
      const raw = typeof field === 'number' ? field : cleanText(field, 30);
      if (raw === '' || raw == null) {
        if (spec.required) fieldError(errors, name, `${spec.label} is required.`);
        return null;
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        fieldError(errors, name, `${spec.label} must be a whole number.`);
        return null;
      }
      if (value < spec.min || value > spec.max) {
        fieldError(
          errors,
          name,
          `${spec.label} must be between ${spec.min} and ${spec.max}.`
        );
        return null;
      }
      return value;
    }

    case 'age': {
      const raw = cleanText(field, 20);
      if (!raw) {
        if (spec.required) fieldError(errors, name, `${spec.label} is required.`);
        return null;
      }
      // Accept "12" or "12 years"; reject anything without a number.
      const match = raw.match(/\d{1,3}/);
      if (!match) {
        fieldError(errors, name, 'Please enter an age as a number.');
        return null;
      }
      const value = Number(match[0]);
      if (value < spec.min || value > spec.max) {
        fieldError(
          errors,
          name,
          `Please enter an age between ${spec.min} and ${spec.max}.`
        );
        return null;
      }
      return value;
    }

    default:
      return cleanText(field, spec.max || 500);
  }
}

/**
 * Validate a complete submission.
 *
 * @param {string} formType
 * @param {Record<string, unknown>} body raw JSON body
 */
export function validateSubmission(formType, body) {
  const schema = FORM_SCHEMAS[formType];

  if (!schema) {
    return { ok: false, errors: {}, general: `Unknown form type: ${formType}` };
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: {}, general: 'Invalid request body.' };
  }

  const errors = {};
  const data = {};

  for (const [name, spec] of Object.entries(schema.fields)) {
    const value = validateField(spec, body[name], name, errors);

    if (keepValue(value)) {
      data[name] = value;
    }
  }

  // Unknown keys are dropped (mass-assignment protection) — but note them in
  // the log so a changed form is noticed quickly.
  const ignored = Object.keys(body).filter(
    (key) =>
      key !== HONEYPOT_FIELD &&
      key !== CONSENT_FIELD &&
      key !== 'form_type' &&
      !Object.prototype.hasOwnProperty.call(schema.fields, key)
  );

  // Explicit consent is mandatory.
  if (!toBoolean(body[CONSENT_FIELD])) {
    fieldError(
      errors,
      CONSENT_FIELD,
      'You must confirm you have read and agree to the Privacy Policy.'
    );
  }

  // Enforce the configured maximum text length on every string answer.
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.length > LIMITS.maxTextLength) {
      fieldError(errors, key, 'This answer is too long.');
    }
  }

  const email = data.email || '';
  const fullName =
    data.full_name || data.name || data.organisation || '';
  const phone = data.phone || '';

  if (Object.keys(errors).length) {
    return { ok: false, errors, general: null };
  }

  return {
    ok: true,
    data,
    email,
    fullName,
    phone,
    ignored,
    consent: true,
    summary:
      (schema.summaryField && data[schema.summaryField]) ||
      '',
  };
}
