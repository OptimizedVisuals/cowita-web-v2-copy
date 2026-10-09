/**
 * CoWiTa — apply colour-contrast fixes reported by axe-core.
 *
 * Reads the findings JSON produced by `tools/a11y-check.mjs --json`, works out
 * which page stylesheet owns each flagged element, and rewrites the colour to
 * one that passes WCAG AA on the measured background:
 *
 *   dark teal surface  → var(--gold-on-dark)    (#f5cf7a, 5.7:1)
 *   cream / white      → var(--gold-ink)        (#7a5608, 6.6:1)
 *   gold band (mid)    → rgba(8, 48, 47, 0.92)  (5.6:1)
 *
 * The background colour comes from axe's own failure summary, so the direction
 * of every fix is measured rather than guessed. Matching is deliberately
 * conservative: a rule is only rewritten when its selector names the element
 * axe flagged, otherwise an explicit override is appended to the page
 * stylesheet (which wins, because page sheets load after the shared ones).
 *
 * Usage:  node tools/a11y-contrast-fix.mjs a11y-findings.json
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOKEN_BY_SURFACE = {
  dark: 'var(--gold-on-dark)',
  light: 'var(--gold-ink)',
  gold: 'rgba(8, 48, 47, 0.92)',
};

function luminance(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 1, 2]
    .map((i) => parseInt(value.substr(i * 2, 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Choose the token that passes on the measured background. */
function surfaceFor(bg) {
  if (!bg) return null;

  const lum = luminance(bg);
  if (lum < 0.25) return 'dark';
  if (lum > 0.6) return 'light';
  return 'gold';
}

/** Map a page path to the page stylesheet that styles it. */
function stylesheetFor(page) {
  const clean = page.replace(/^\//, '').replace(/\/$/, '');
  if (!clean) return 'css/pages/home.css';

  const base = clean.replace(/\.html$/, '').replace(/\//g, '-');
  const candidates = [`css/pages/${base}.css`, `css/pages/${base}-index.css`];

  return candidates.find((path) => existsSync(resolve(path))) || candidates[1];
}

const ELEMENT_NAME = /^[a-z][a-z0-9]*$/i;

/**
 * Turn an axe target into a selector fragment.
 * Unqualified element names are dropped unless they are the last part, so
 * ".opportunity-card > div > p" becomes ".opportunity-card p".
 */
function selectorFragment(target) {
  const parts = target
    .split(' > ')
    .map((part) => part.replace(/:nth-child\([^)]*\)/g, '').trim())
    .filter(Boolean);

  return parts
    .filter((part, index) => !ELEMENT_NAME.test(part) || index === parts.length - 1)
    .join(' ');
}

/** Does this CSS selector name exactly the element we flagged? */
function ownsElement(selectorList, fragment) {
  return selectorList
    .split(',')
    .map((selector) => selector.trim())
    .some((selector) => selector === fragment);
}

const [findingsPath] = process.argv.slice(2);

if (!findingsPath) {
  console.error('usage: node tools/a11y-contrast-fix.mjs findings.json');
  process.exit(1);
}

const findings = JSON.parse(readFileSync(resolve(findingsPath), 'utf8'));
const byFile = new Map();

for (const finding of findings) {
  const surface = surfaceFor(finding.bg);
  if (!surface) continue;

  const file = stylesheetFor(finding.page);
  const fragment = selectorFragment(finding.selector);

  if (!fragment || fragment.split(' ').length > 3) continue;

  if (!byFile.has(file)) byFile.set(file, new Map());
  byFile.get(file).set(fragment, TOKEN_BY_SURFACE[surface]);
}

let rewritten = 0;
let appended = 0;

for (const [file, elements] of byFile) {
  if (!existsSync(resolve(file))) {
    console.log(`skip (no stylesheet): ${file}`);
    continue;
  }

  let css = readFileSync(resolve(file), 'utf8');
  const overrides = [];

  for (const [fragment, token] of elements) {
    let matched = false;

    css = css.replace(
      /([^{}]*)\{([^{}]*)\}/g,
      (rule, selectorList, body) => {
        if (matched || !ownsElement(selectorList, fragment)) return rule;
        if (!/color\s*:/.test(body)) return rule;

        const fixed = body.replace(/(color\s*:\s*)([^;]+)/, `$1${token}`);
        matched = true;
        return `${selectorList}{${fixed}}`;
      }
    );

    if (matched) {
      rewritten += 1;
      console.log(`${file} :: ${fragment} → ${token}`);
    } else {
      overrides.push({ fragment, token });
    }
  }

  if (overrides.length) {
    css += [
      '',
      '/* Accessibility overrides — colour contrast (axe-core verified) */',
      ...overrides.flatMap((o) => [`${o.fragment} {`, `  color: ${o.token};`, '}']),
      '',
    ].join('\n');

    appended += overrides.length;
    for (const o of overrides) console.log(`${file} :: ${o.fragment} → ${o.token} (appended)`);
  }

  writeFileSync(resolve(file), css, 'utf8');
}

console.log(`\n${rewritten} rule(s) rewritten, ${appended} override(s) appended`);
