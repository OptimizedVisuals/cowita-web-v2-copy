/**
 * CoWiTa API — HTTP helpers.
 */

import { createHash } from 'node:crypto';
import { MAX_BODY_BYTES } from './config.mjs';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function sendJson(res, status, payload) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}

export function sendOk(res, payload = {}) {
  sendJson(res, 200, { ok: true, ...payload });
}

export function sendError(res, status, error, errors = null) {
  const payload = { ok: false, error };
  if (errors && Object.keys(errors).length) payload.errors = errors;
  sendJson(res, status, payload);
}

export function methodNotAllowed(res, allowed = ['POST']) {
  res.setHeader('Allow', allowed.join(', '));
  sendError(res, 405, 'Method not allowed.');
}

/**
 * Read the request body with a hard size limit.
 * Supports application/json and application/x-www-form-urlencoded so the
 * forms work without JavaScript.
 */
export async function readBody(req) {
  const contentType = (req.headers['content-type'] || '').split(';')[0].trim();

  const raw = await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { tooLarge: true }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

  if (contentType === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams(raw);
    const body = {};
    for (const key of new Set(params.keys())) {
      const all = params.getAll(key);
      body[key] = all.length > 1 ? all : all[0];
    }
    return body;
  }

  if (contentType === 'application/json' || raw.trim().startsWith('{')) {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      throw Object.assign(new Error('Invalid JSON body'), { badJson: true });
    }
  }

  throw Object.assign(new Error('Unsupported content type'), { badType: true });
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (typeof req.headers['x-real-ip'] === 'string') {
    return req.headers['x-real-ip'];
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function hashIp(ip, pepper) {
  return createHash('sha256')
    .update(`${pepper}:${ip}`)
    .digest('hex');
}

export function hashValue(value, pepper) {
  return createHash('sha256')
    .update(`${pepper}:${value}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Validate Origin (or, when absent, Referer) against the allow-list and the
 * request's own host. Same-origin browser posts are always accepted.
 */
export function isTrustedRequest(req, allowedOrigins) {
  const origin = req.headers.origin;

  if (!origin) {
    const referer = req.headers.referer;
    if (!referer) return false;
    try {
      const refOrigin = new URL(referer).origin;
      return isAllowedOriginValue(refOrigin, req, allowedOrigins);
    } catch {
      return false;
    }
  }

  return isAllowedOriginValue(origin, req, allowedOrigins);
}

function isAllowedOriginValue(origin, req, allowedOrigins) {
  const host = req.headers.host;

  try {
    const parsed = new URL(origin);
    if (host && parsed.host === host) return true;
    if (allowedOrigins.includes(parsed.origin)) return true;
    // Local development against the deployed function.
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1'
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/** Coarse bot screen: empty or obviously automated user agents. */
export function looksLikeBot(req) {
  const agent = String(req.headers['user-agent'] || '').trim();
  if (agent.length < 8) return true;
  return /(curl|wget|python-requests|scrapy|headlesschrome|phantomjs|httpclient)/i.test(
    agent
  );
}
