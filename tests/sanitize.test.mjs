import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cleanEmail,
  cleanMultiline,
  cleanPhone,
  cleanText,
  cleanUrl,
  escapeCsv,
  escapeHtml,
  isValidPhone,
  toBoolean,
} from '../api/_lib/sanitize.mjs';

test('strips control characters and collapses whitespace', () => {
  const dirty = 'Hello\u0000\u0007  world \u001b[31m  again';
  const clean = cleanText(dirty);
  assert.equal(clean.includes('\u0000'), false);
  assert.equal(clean.includes('\u001b'), false);
  assert.equal(/\s{2,}/.test(clean), false);
});

test('caps text at the requested maximum length', () => {
  assert.equal(cleanText('a'.repeat(50), 10).length, 10);
});

test('keeps single line breaks but limits blank runs in multiline text', () => {
  const value = cleanMultiline('line one\n\n\n\nline two');
  assert.equal(value, 'line one\n\nline two');
});

test('normalises and validates emails', () => {
  assert.equal(cleanEmail('  Ada@Example.ORG '), 'ada@example.org');
  assert.equal(cleanEmail('not-an-email'), '');
  assert.equal(cleanEmail('a@b'), '');
});

test('validates phone numbers and rejects text', () => {
  assert.equal(isValidPhone('+44 (0)20 7946 0000'), true);
  assert.equal(isValidPhone('call me'), false);
  assert.equal(cleanPhone('+1 555 0100'), '+1 555 0100');
  assert.equal(cleanPhone('nope'), '');
});

test('accepts only http(s) URLs and adds a scheme when missing', () => {
  assert.equal(cleanUrl('example.org/portfolio'), 'https://example.org/portfolio');
  assert.equal(cleanUrl('javascript:alert(1)'), '');
  assert.equal(cleanUrl(''), '');
});

test('escapes HTML so answers cannot inject markup into emails', () => {
  const escaped = escapeHtml('<script>alert("x")</script>');
  assert.equal(escaped.includes('<script>'), false);
  assert.equal(escaped, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('escapes CSV cells and neutralises formula injection', () => {
  assert.equal(escapeCsv('plain'), 'plain');
  assert.equal(escapeCsv('has,comma'), '"has,comma"');
  assert.equal(escapeCsv('has"quote'), '"has""quote"');
  assert.equal(escapeCsv('=cmd()'), "'=cmd()");
  assert.equal(escapeCsv('@SUM(A1)'), "'@SUM(A1)");
});

test('parses checkbox style booleans strictly', () => {
  assert.equal(toBoolean('on'), true);
  assert.equal(toBoolean('true'), true);
  assert.equal(toBoolean(1), true);
  assert.equal(toBoolean('false'), false);
  assert.equal(toBoolean(undefined), false);
  assert.equal(toBoolean('0'), false);
});
