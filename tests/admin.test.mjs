import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { before, beforeEach, test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { __setServiceClientForTests } from '../api/_lib/supabase.mjs';
import { createFakeSupabase, makeJwt } from './helpers/fake-supabase.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/* --------------------------------------------------------------- helpers */

function createReq({ method = 'GET', headers = {}, body = {}, query = {} } = {}) {
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
      try {
        state.json = JSON.parse(state.body);
      } catch {
        state.json = null;
      }
    },
    __state: state,
  };
}

const ADMIN_USER = { id: 'user-1', email: 'admin@cowita.org' };
const VIEWER_USER = { id: 'user-2', email: 'viewer@cowita.org' };
const STRANGER_USER = { id: 'user-3', email: 'stranger@example.com' };

const ADMIN_TOKEN = makeJwt({ sub: 'user-1', aal: 'aal2' });
const VIEWER_TOKEN = makeJwt({ sub: 'user-2', aal: 'aal2' });
const AAL1_TOKEN = makeJwt({ sub: 'user-1', aal: 'aal1' });
const STRANGER_TOKEN = makeJwt({ sub: 'user-3', aal: 'aal2' });

let listHandler;
let detailHandler;
let exportHandler;
let meHandler;
let retentionHandler;

const SUBMISSIONS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    form_type: 'talent',
    status: 'new',
    full_name: 'Ada Lovelace',
    email: 'ada@example.org',
    phone: '+44 20 7946 0000',
    age: 15,
    payload: { discipline: 'dance', talent_description: 'Dances weekly.' },
    created_at: '2026-10-01T10:00:00.000Z',
    deleted_at: null,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    form_type: 'contact',
    status: 'reviewed',
    full_name: 'Grace Hopper',
    email: 'grace@example.org',
    phone: null,
    age: null,
    payload: { message: 'Question about mentoring.' },
    created_at: '2026-10-02T10:00:00.000Z',
    deleted_at: null,
  },
];

before(async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  delete process.env.RESEND_API_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;

  const load = async (relative) => (await import(pathToFileURL(join(here, ...relative)).href)).default;

  listHandler = await load(['..', 'api', 'admin', 'submissions.mjs']);
  detailHandler = await load(['..', 'api', 'admin', 'submissions', '[id].mjs']);
  exportHandler = await load(['..', 'api', 'admin', 'export.mjs']);
  meHandler = await load(['..', 'api', 'admin', 'me.mjs']);
  retentionHandler = await load(['..', 'api', 'admin', 'retention.mjs']);
});

function installFake(overrides = {}) {
  const fake = createFakeSupabase({
    submissions: SUBMISSIONS.map((row) => ({ ...row, payload: { ...row.payload } })),
    adminUsers: [
      { user_id: 'user-1', email: 'admin@cowita.org', role: 'owner' },
      { user_id: 'user-2', email: 'viewer@cowita.org', role: 'viewer' },
    ],
    usersByToken: {
      [ADMIN_TOKEN]: ADMIN_USER,
      [VIEWER_TOKEN]: VIEWER_USER,
      [AAL1_TOKEN]: ADMIN_USER,
      [STRANGER_TOKEN]: STRANGER_USER,
    },
    ...overrides,
  });

  __setServiceClientForTests(fake);
  return fake;
}

beforeEach(() => {
  installFake();
});

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

/* ------------------------------------------------------------- auth gate */

test('rejects requests without a token', async () => {
  const res = createRes();
  await listHandler(createReq(), res);

  assert.equal(res.__state.status, 401);
  assert.equal(res.__state.json.ok, false);
});

test('rejects a session that has not completed MFA', async () => {
  const res = createRes();
  await listHandler(createReq({ headers: authHeaders(AAL1_TOKEN) }), res);

  assert.equal(res.__state.status, 403);
  assert.equal(res.__state.json.code, 'mfa_required');
});

test('rejects an authenticated user who is not an admin', async () => {
  const res = createRes();
  await listHandler(createReq({ headers: authHeaders(STRANGER_TOKEN) }), res);

  assert.equal(res.__state.status, 403);
});

test('reports the signed-in admin identity', async () => {
  const res = createRes();
  await meHandler(createReq({ headers: authHeaders(VIEWER_TOKEN) }), res);

  assert.equal(res.__state.status, 200);
  assert.equal(res.__state.json.email, 'viewer@cowita.org');
  assert.equal(res.__state.json.role, 'viewer');
});

/* ------------------------------------------------------------------ list */

test('lists submissions and paginates', async () => {
  const res = createRes();
  await listHandler(createReq({ headers: authHeaders(VIEWER_TOKEN) }), res);

  assert.equal(res.__state.status, 200);
  assert.equal(res.__state.json.submissions.length, 2);
  assert.equal(res.__state.json.total, 2);
  assert.equal(res.__state.json.total_pages, 1);
  // Default sort is newest first.
  assert.equal(res.__state.json.submissions[0].full_name, 'Grace Hopper');
});

test('filters by status and form type', async () => {
  const res = createRes();
  await listHandler(
    createReq({
      headers: authHeaders(VIEWER_TOKEN),
      query: { status: 'new', form_type: 'talent' },
    }),
    res
  );

  assert.equal(res.__state.status, 200);
  assert.equal(res.__state.json.submissions.length, 1);
  assert.equal(res.__state.json.submissions[0].full_name, 'Ada Lovelace');
});

test('rejects an unknown filter value', async () => {
  const res = createRes();
  await listHandler(
    createReq({ headers: authHeaders(VIEWER_TOKEN), query: { status: 'banana' } }),
    res
  );

  assert.equal(res.__state.status, 400);
});

test('searches by name', async () => {
  const res = createRes();
  await listHandler(
    createReq({ headers: authHeaders(VIEWER_TOKEN), query: { q: 'hopper' } }),
    res
  );

  assert.equal(res.__state.status, 200);
  assert.equal(res.__state.json.submissions.length, 1);
  assert.equal(res.__state.json.submissions[0].email, 'grace@example.org');
});

/* ---------------------------------------------------------------- detail */

test('updates status as an admin and writes an audit event', async () => {
  const fake = installFake();
  const res = createRes();

  await detailHandler(
    createReq({
      method: 'PATCH',
      headers: authHeaders(ADMIN_TOKEN),
      body: { status: 'contacted' },
      query: { id: SUBMISSIONS[0].id },
    }),
    res
  );

  assert.equal(res.__state.status, 200);
  assert.equal(res.__state.json.submission.status, 'contacted');

  const audit = fake.__state.submission_events;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'status_changed');
  assert.equal(audit[0].from_status, 'new');
  assert.equal(audit[0].to_status, 'contacted');
  assert.equal(audit[0].actor_email, 'admin@cowita.org');
});

test('stores internal notes as an admin', async () => {
  const fake = installFake();
  const res = createRes();

  await detailHandler(
    createReq({
      method: 'PATCH',
      headers: authHeaders(ADMIN_TOKEN),
      body: { internal_notes: 'Called on Tuesday.' },
      query: { id: SUBMISSIONS[1].id },
    }),
    res
  );

  assert.equal(res.__state.status, 200);
  assert.equal(res.__state.json.submission.internal_notes, 'Called on Tuesday.');
  assert.equal(fake.__state.submission_events[0].action, 'note_updated');
});

test('a viewer cannot change a submission', async () => {
  const res = createRes();

  await detailHandler(
    createReq({
      method: 'PATCH',
      headers: authHeaders(VIEWER_TOKEN),
      body: { status: 'closed' },
      query: { id: SUBMISSIONS[0].id },
    }),
    res
  );

  assert.equal(res.__state.status, 403);
});

test('rejects an unknown status value', async () => {
  const res = createRes();

  await detailHandler(
    createReq({
      method: 'PATCH',
      headers: authHeaders(ADMIN_TOKEN),
      body: { status: 'archived' },
      query: { id: SUBMISSIONS[0].id },
    }),
    res
  );

  assert.equal(res.__state.status, 400);
});

test('rejects an invalid submission id', async () => {
  const res = createRes();

  await detailHandler(
    createReq({ headers: authHeaders(ADMIN_TOKEN), query: { id: 'not-a-uuid' } }),
    res
  );

  assert.equal(res.__state.status, 400);
});

test('soft deletes a submission', async () => {
  const fake = installFake();
  const res = createRes();

  await detailHandler(
    createReq({
      method: 'DELETE',
      headers: authHeaders(ADMIN_TOKEN),
      query: { id: SUBMISSIONS[0].id },
    }),
    res
  );

  assert.equal(res.__state.status, 200);
  assert.equal(res.__state.json.deleted, 'soft');
  assert.equal(fake.__state.submissions.find((s) => s.id === SUBMISSIONS[0].id).deleted_at !== null, true);
  assert.equal(fake.__state.submission_events[0].action, 'deleted');
});

test('only an owner may permanently delete', async () => {
  const ownerFake = installFake();
  const ownerRes = createRes();

  await detailHandler(
    createReq({
      method: 'DELETE',
      headers: authHeaders(ADMIN_TOKEN),
      query: { id: SUBMISSIONS[0].id, hard: '1' },
    }),
    ownerRes
  );

  assert.equal(ownerRes.__state.status, 200);
  assert.equal(ownerFake.__state.submissions.length, 1);

  const viewerFake = installFake();
  viewerFake.__state.admin_users = [{ user_id: 'user-2', email: 'viewer@cowita.org', role: 'admin' }];
  const res = createRes();

  await detailHandler(
    createReq({
      method: 'DELETE',
      headers: authHeaders(VIEWER_TOKEN),
      query: { id: SUBMISSIONS[1].id, hard: '1' },
    }),
    res
  );

  assert.equal(res.__state.status, 403);
});

/* ---------------------------------------------------------------- export */

test('exports CSV for a viewer', async () => {
  const res = createRes();
  await exportHandler(createReq({ headers: authHeaders(VIEWER_TOKEN) }), res);

  assert.equal(res.__state.status, 200);
  assert.match(res.__state.headers['Content-Type'], /text\/csv/);
  assert.match(res.__state.headers['Content-Disposition'], /cowita-submissions-\d{4}-\d{2}-\d{2}\.csv/);

  const lines = res.__state.body.replace(/^\uFEFF/, '').trim().split('\r\n');
  const header = lines[0].split(',');

  assert.equal(header[0], 'id');
  assert.ok(header.includes('talent_description'));
  assert.ok(header.includes('looking_for'));
  assert.equal(lines.length, 3); // header + 2 rows
  assert.ok(res.__state.body.includes('Ada Lovelace'));
});

test('export requires authentication', async () => {
  const res = createRes();
  await exportHandler(createReq(), res);
  assert.equal(res.__state.status, 401);
});

/* ------------------------------------------------------------- retention */

test('retention job requires the cron secret', async () => {
  process.env.CRON_SECRET = 'cron-secret';

  const unauthorised = createRes();
  await retentionHandler(createReq({ method: 'POST' }), unauthorised);
  assert.equal(unauthorised.__state.status, 401);

  const authorised = createRes();
  await retentionHandler(
    createReq({
      method: 'POST',
      headers: { authorization: 'Bearer cron-secret' },
    }),
    authorised
  );
  assert.equal(authorised.__state.status, 200);
  assert.equal(authorised.__state.json.ok, true);
});
