import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateSubmission } from '../api/_lib/validation.mjs';

const validContact = {
  name: 'Ada Lovelace',
  email: 'ada@example.org',
  phone: '+44 20 7946 0000',
  interest: 'learning',
  subject: 'Dance classes',
  message: 'I would like to find out about your weekend dance sessions.',
  consent: 'on',
};

test('accepts a valid contact submission', () => {
  const result = validateSubmission('contact', validContact);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.email, 'ada@example.org');
  assert.equal(result.fullName, 'Ada Lovelace');
  assert.equal(result.data.interest, 'learning');
});

test('requires the consent checkbox', () => {
  const { consent, ...withoutConsent } = validContact;
  const result = validateSubmission('contact', withoutConsent);
  assert.equal(result.ok, false);
  assert.match(result.errors.consent, /Privacy Policy/);
});

test('rejects a malformed email address', () => {
  const result = validateSubmission('contact', {
    ...validContact,
    email: 'not-an-email',
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.email, /valid email/);
});

test('rejects a malformed phone number', () => {
  const result = validateSubmission('contact', {
    ...validContact,
    phone: 'call me maybe',
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.phone, /valid phone/);
});

test('rejects a message shorter than the minimum length', () => {
  const result = validateSubmission('contact', { ...validContact, message: 'hi' });
  assert.equal(result.ok, false);
  assert.match(result.errors.message, /at least 10/);
});

test('rejects a value outside the allowed enum', () => {
  const result = validateSubmission('contact', {
    ...validContact,
    interest: 'free-money',
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.interest, /listed option/);
});

test('enforces age bounds on the talent form', () => {
  const base = {
    full_name: 'Young Person',
    email: 'parent@example.org',
    discipline: 'dance',
    specific_talent: 'Contemporary dance',
    talent_description: 'I have been dancing for four years.',
    consent: 'true',
  };

  const tooYoung = validateSubmission('talent', { ...base, age: '2' });
  assert.equal(tooYoung.ok, false);
  assert.match(tooYoung.errors.age, /between 5 and 120/);

  const fine = validateSubmission('talent', { ...base, age: '14 years old' });
  assert.equal(fine.ok, true, JSON.stringify(fine.errors));
  assert.equal(fine.data.age, 14);
});

test('validates multi-select checkbox groups against the allowed values', () => {
  const base = {
    full_name: 'Partner Lead',
    email: 'lead@example.org',
    partnership_title: 'Summer programme',
    description: 'We would like to co-deliver a summer programme for young people.',
    consent: 'yes',
  };

  const result = validateSubmission('partner', {
    ...base,
    looking_for: ['Space or venue', 'hacked option'],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.looking_for, /not a valid option/);
});

test('accepts valid multi-select values and deduplicates them', () => {
  const result = validateSubmission('partner', {
    full_name: 'Partner Lead',
    email: 'lead@example.org',
    partnership_title: 'Summer programme',
    description: 'We would like to co-deliver a summer programme for young people.',
    looking_for: ['Space or venue', 'Space or venue', 'Expertise or guidance'],
    consent: 'yes',
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.data.looking_for, ['Space or venue', 'Expertise or guidance']);
});

test('drops unknown fields (mass-assignment protection)', () => {
  const result = validateSubmission('contact', {
    ...validContact,
    status: 'closed',
    is_admin: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, undefined);
  assert.deepEqual(result.ignored.sort(), ['is_admin', 'status'].sort());
});

test('rejects an unsupported form type', () => {
  const result = validateSubmission('newsletter', validContact);
  assert.equal(result.ok, false);
  assert.match(result.general, /Unknown form type/);
});

test('rejects a numeric amount outside the allowed range', () => {
  const base = {
    support_type: 'one-time',
    frequency: 'one-time',
    support_purpose: 'general-support',
    full_name: 'Supporter',
    email: 'supporter@example.org',
    consent: 'yes',
  };

  const negative = validateSubmission('support', { ...base, amount: '-50' });
  assert.equal(negative.ok, false);
  assert.match(negative.errors.amount, /between/);

  const valid = validateSubmission('support', { ...base, amount: '250' });
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));
  assert.equal(valid.data.amount, 250);
});
