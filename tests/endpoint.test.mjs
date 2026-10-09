import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test, before, beforeEach } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { __setServiceClientForTests } from '../api/_lib/supabase.mjs';

/* --------------------------------------------------------------- helpers */

function createFakeSupabase() {
  const submissions = [];
  const events = [];
  let rpcCount = 1;

  const client = {
    from(table) {
      return {
        insert(row) {
          const rows = Array.isArray(row) ? row : [row];

          if (table === 'submissions') {
            for (const item of rows) {
              submissions.push({ id: `sub-${submissions.length + 1}`, ...item });
            }
          }

          if (table === 'submission_events') {
            events.push(...rows);
          }

          const inserted = submissions[submissions.length - 1] || {};

          return {
            select() {
              return {
                single: async () => ({
                  data: { id: inserted.id, created_at: new Date().toISOString() },
                  error: null,
                }),
              };
            },
            then: (resolve) => resolve({ data: null, error: null }),
          };
        },
      };
    },

    async rpc() {
      return { data: rpcCount, error: null };
    },

    __submissions: submissions,
    __events: events,
    __setRpcCount(value) {
      rpcCount = value;
    },
  };

  return client;
}

function createReq({ method = 'POST', headers = {}, body = {}, query = {} }) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = headers;
  req.query = query;
  req.socket = { remoteAddress: '127.0.0.1' };
  req.destroyedForTest = false;
  req.destroy = () => {
    req.destroyedForTest = true;
  };

  const payload = typeof body === 'string' ? body : JSON.stringify(body);

  setTimeout(() => {
    if (req.destroyedForTest) return;
    req.emit('data', Buffer.from(payload));
    req.emit('end');
  }, 0);

  return req;
}

function createRes() {
  const state = { status: null, headers: {}, body: '', ended: false };

  return {
    writeHead(status, headers = {}) {
      state.status = status;
      Object.assign(state.headers, headers);
    },
    setHeader(name, value) {
      state.headers[name] = value;
    },
    end(chunk) {
      if (chunk) state.body += chunk;
      state.ended = true;
      state.json = (() => {
        try {
          return JSON.parse(state.body);
        } catch {
          return null;
        }
      })();
    },
    __state: state,
  };
}

const CONTACT_BODY = {
  form_type: 'contact',
  name: 'Ada Lovelace',
  email: 'ada@example.org',
  phone: '+44 20 7946 0000',
  interest: 'learning',
  subject: 'Weekend sessions',
  message: 'Please tell me more about the weekend dance sessions.',
  consent: 'on',
};

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

let handler;
let fake;

before(async () => {
  process.env.IP_HASH_PEPPER = 'test-pepper';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  delete process.env.RESEND_API_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;

  const here = dirname(fileURLToPath(import.meta.url));
  const moduleUrl = pathToFileURL(join(here, '..', 'api', 'forms', '[type].mjs'));
  handler = (await import(moduleUrl.href)).default;
});

beforeEach(() => {
  fake = createFakeSupabase();
  __setServiceClientForTests(fake);
});

function baseHeaders(extra = {}) {
  return {
    origin: 'https://cowita.org',
    host: 'cowita.org',
    'user-agent': BROWSER_UA,
    'content-type': 'application/json',
    ...extra,
  };
}

/* ----------------------------------------------------------------- tests */

test('accepts and stores a valid submission', async () => {
  const req = createReq({
    headers: baseHeaders(),
    body: CONTACT_BODY,
    query: { type: 'contact' },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.__state.status, 200);
  assert.equal(res.__state.json.ok, true);
  assert.match(res.__state.json.id, /^sub-/);
  assert.equal(fake.__submissions.length, 1);

  const stored = fake.__submissions[0];
  assert.equal(stored.form_type, 'contact');
  assert.equal(stored.status, 'new');
  assert.equal(stored.consent, true);
  assert.equal(stored.email, 'ada@example.org');
  assert.equal(stored.consent_version.length > 0, true);
  assert.equal(stored.ip_hash.includes('127.0.0.1'), false);
  assert.equal(stored.payload.consent, undefined);
  assert.equal(fake.__events.length, 1);
  assert.equal(fake.__events[0].action, 'created');
});

test('returns field-level errors when validation fails', async () => {
  const req = createReq({
    headers: baseHeaders(),
    body: { ...CONTACT_BODY, email: 'nope', consent: '' },
    query: { type: 'contact' },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.__state.status, 422);
  assert.equal(res.__state.json.ok, false);
  assert.ok(res.__state.json.errors.email);
  assert.ok(res.__state.json.errors.consent);
  assert.equal(fake.__submissions.length, 0);
});

test('rejects a foreign origin with 403', async () => {
  const req = createReq({
    headers: baseHeaders({ origin: 'https://evil.example' }),
    body: CONTACT_BODY,
    query: { type: 'contact' },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.__state.status, 403);
  assert.equal(fake.__submissions.length, 0);
});

test('drops honeypot submissions without storing anything', async () => {
  const req = createReq({
    headers: baseHeaders(),
    body: { ...CONTACT_BODY, honeypot: 'buy-cheap-watches' },
    query: { type: 'contact' },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.__state.status, 200);
  assert.equal(fake.__submissions.length, 0);
});

test('redirects a no-JavaScript post to the thank-you page', async () => {
  const req = createReq({
    headers: baseHeaders({ accept: 'text/html,application/xhtml+xml' }),
    body: CONTACT_BODY,
    query: { type: 'contact' },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.__state.status, 303);
  assert.equal(res.__state.headers.Location, '/get-involved/thank-you.html');
  assert.equal(fake.__submissions.length, 1);
});

test('rejects an unknown form type with 404', async () => {
  const req = createReq({
    headers: baseHeaders(),
    body: CONTACT_BODY,
    query: { type: 'newsletter' },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.__state.status, 404);
});

test('rejects non-POST methods with 405', async () => {
  const req = createReq({
    method: 'GET',
    headers: baseHeaders(),
    query: { type: 'contact' },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.__state.status, 405);
  assert.equal(res.__state.headers.Allow, 'POST');
});

test('returns 429 when a rate limit bucket is exhausted', async () => {
  fake.__setRpcCount(9999);

  const req = createReq({
    headers: baseHeaders(),
    body: CONTACT_BODY,
    query: { type: 'contact' },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.__state.status, 429);
  assert.equal(res.__state.headers['Retry-After'] !== undefined, true);
  assert.equal(fake.__submissions.length, 0);
});

test('accepts a urlencoded body (no-JS fallback path)', async () => {
  const params = new URLSearchParams({
    name: 'Ada Lovelace',
    email: 'ada@example.org',
    interest: 'general',
    subject: 'Hello',
    message: 'This message came from a form without JavaScript enabled.',
    consent: 'on',
  });

  const req = createReq({
    headers: baseHeaders({
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html',
    }),
    body: params.toString(),
    query: { type: 'contact' },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.__state.status, 303);
  assert.equal(fake.__submissions.length, 1);
});

test('rejects oversized payloads with 413', async () => {
  const req = createReq({
    headers: baseHeaders(),
    body: { ...CONTACT_BODY, message: 'x'.repeat(64 * 1024) },
    query: { type: 'contact' },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.__state.status, 413);
});
