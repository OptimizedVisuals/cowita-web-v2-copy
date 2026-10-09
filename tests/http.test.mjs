import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getClientIp,
  hashIp,
  isTrustedRequest,
  looksLikeBot,
} from '../api/_lib/http.mjs';

const ALLOWED = ['https://cowita.org', 'https://www.cowita.org'];

test('accepts a same-host origin', () => {
  const req = {
    headers: { origin: 'https://cowita.org', host: 'cowita.org' },
  };
  assert.equal(isTrustedRequest(req, ALLOWED), true);
});

test('accepts an allow-listed origin even when the host differs', () => {
  const req = {
    headers: { origin: 'https://cowita.org', host: 'preview-abc.vercel.app' },
  };
  assert.equal(isTrustedRequest(req, ALLOWED), true);
});

test('rejects an origin that is not allow-listed', () => {
  const req = {
    headers: { origin: 'https://evil.example', host: 'cowita.org' },
  };
  assert.equal(isTrustedRequest(req, ALLOWED), false);
});

test('falls back to the Referer header when Origin is absent', () => {
  const good = {
    headers: {
      referer: 'https://cowita.org/contact/',
      host: 'cowita.org',
    },
  };
  assert.equal(isTrustedRequest(good, ALLOWED), true);

  const bad = {
    headers: {
      referer: 'https://evil.example/form',
      host: 'cowita.org',
    },
  };
  assert.equal(isTrustedRequest(bad, ALLOWED), false);
});

test('rejects a request with neither Origin nor Referer', () => {
  assert.equal(isTrustedRequest({ headers: {} }, ALLOWED), false);
});

test('allows loopback origins for local development', () => {
  const req = { headers: { origin: 'http://localhost:3000' } };
  assert.equal(isTrustedRequest(req, ALLOWED), true);
});

test('screens empty and scripted user agents', () => {
  assert.equal(looksLikeBot({ headers: {} }), true);
  assert.equal(looksLikeBot({ headers: { 'user-agent': 'curl/8.0' } }), true);
  assert.equal(
    looksLikeBot({
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    }),
    false
  );
});

test('hashes IPs deterministically and never returns the raw address', () => {
  const first = hashIp('203.0.113.9', 'pepper');
  const second = hashIp('203.0.113.9', 'pepper');
  const other = hashIp('203.0.113.10', 'pepper');
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.equal(first.includes('203.0.113.9'), false);
  assert.equal(first.length, 64);
});

test('reads the client IP from proxy headers', () => {
  assert.equal(
    getClientIp({ headers: { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' } }),
    '198.51.100.4'
  );
  assert.equal(getClientIp({ headers: { 'x-real-ip': '198.51.100.5' } }), '198.51.100.5');
});
