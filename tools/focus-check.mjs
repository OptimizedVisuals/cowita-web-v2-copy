/**
 * CoWiTa — focus indicator check (WCAG 2.1 SC 2.4.7 Focus Visible).
 *
 * axe-core cannot judge whether a focused control looks different, so this
 * script measures it: for every focusable control it captures the computed
 * outline, box-shadow and border colour before and after focusing, and reports
 * any control whose appearance does not change in a visible way.
 *
 * Usage:  node tools/dev-server.mjs &   # serve the site
 *         node tools/focus-check.mjs
 */

import { statSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

const PAGES = [
  '/',
  '/contact/',
  '/get-involved/have-talent.html',
  '/get-involved/partner.html',
  '/get-involved/collaborate.html',
  '/get-involved/mentor.html',
  '/get-involved/want-to-learn.html',
  '/support/financial-support.html',
];

const { chromium } = await import('playwright-core');

const SYSTEM_BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const executablePath = SYSTEM_BROWSERS.find((path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
});

let browser;
try {
  browser = executablePath ? await chromium.launch({ executablePath }) : await chromium.launch();
} catch (error) {
  console.error(
    'No Chromium-based browser found — install Chrome, or run `npx playwright install chromium`.'
  );
  console.error(error.message);
  process.exit(2);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let problems = 0;

for (const path of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });

  const results = await page.evaluate(() => {
    const SELECTOR = 'a[href], button, input, select, textarea, summary, [tabindex]';
    const snapshot = (el) => {
      const style = getComputedStyle(el);

      return [
        style.outlineStyle,
        style.outlineWidth,
        style.outlineColor,
        style.boxShadow,
        style.borderTopColor,
        style.borderTopWidth,
        style.backgroundColor,
        style.textDecorationLine,
        style.opacity,
      ].join('|');
    };

    const out = [];

    for (const el of document.querySelectorAll(SELECTOR)) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;

      const before = snapshot(el);
      el.focus({ preventScroll: true });
      const after = snapshot(el);

      const style = getComputedStyle(el);
      const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const changed = before !== after;

      out.push({
        tag: el.tagName.toLowerCase(),
        label:
          (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 42),
        hasOutline,
        changed,
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
      });

      el.blur();
    }

    return out;
  });

  const failing = results.filter((item) => !item.hasOutline && !item.changed);

  console.log(
    `${path.padEnd(36)} controls: ${String(results.length).padStart(3)}  without focus indicator: ${failing.length}`
  );

  for (const item of failing.slice(0, 8)) {
    console.log(`   - <${item.tag}> ${item.label}`);
  }

  problems += failing.length;
}

await browser.close();

console.log(
  problems
    ? `\n${problems} control(s) show no visible focus change.`
    : '\nEvery focusable control shows a visible focus indicator.'
);

process.exit(problems ? 1 : 0);
