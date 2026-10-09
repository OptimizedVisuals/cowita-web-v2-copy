import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { before, beforeEach, test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { __setServiceClientForTests } from '../api/_lib/supabase.mjs';
import { createFakeSupabase } from './helpers/fake-supabase.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function createRes() {
  const state = { status: null, headers: {}, body: '' };

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
      try {
        state.json = JSON.parse(state.body);
      } catch {
        state.json = null;
      }
    },
    __state: state,
  };
}

function createReq(method = 'GET') {
  const req = new EventEmitter();
  req.method = method;
  req.headers = {};
  req.query = {};
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

let handler;

before(async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  delete process.env.RESEND_API_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;

  handler = (
    await import(pathToFileURL(join(here, '..', 'api', 'health.mjs')).href)
  ).default;
});

beforeEach(() => {
  __setServiceClientForTests(createFakeSupabase());
});

test('reports healthy when the database responds', async () => {
  const res = createRes();
  await handler(createReq(), res);

  assert.equal(res.__state.status, 200);
  assert.equal(res.__state.json.ok, true);
  assert.equal(res.__state.json.checks.database, 'ok');
  // Missing optional integrations must not fail the health check.
  assert.equal(res.__state.json.checks.email, 'missing');
});

test('rejects unsupported methods', async () => {
  const res = createRes();
  await handler(createReq('POST'), res);

  assert.equal(res.__state.status, 405);
});

test('never leaks configuration values', async () => {
  const res = createRes();
  await handler(createReq(), res);

  const body = res.__state.body;
  assert.equal(body.includes('service-role-key'), false);
  assert.equal(body.includes('example.supabase.co'), false);
});
