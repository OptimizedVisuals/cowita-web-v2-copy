/**
 * CoWiTa — self-check for the accessibility runner.
 *
 * A clean axe run is only meaningful if the runner would actually fail on a
 * broken page. This fixture contains two deliberate WCAG failures (a skipped
 * heading level and an image without alt text) and asserts that the same axe
 * configuration used by tools/a11y-check.mjs reports them.
 *
 * Usage:  node tools/axe-rule-selfcheck.mjs
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AXE = readFileSync(join(root, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

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

const FIXTURE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>fixture</title></head>
<body>
  <h1>Heading</h1>
  <h3>Skipped a level</h3>
  <img src="missing.png">
  <p style="color:#f1f1f1;background:#ffffff">Invisible text</p>
</body></html>`;

const fixturePath = join(root, 'node_modules', '.cache', 'cowita-axe-fixture.html');
const { mkdirSync, writeFileSync } = await import('node:fs');
mkdirSync(dirname(fixturePath), { recursive: true });
writeFileSync(fixturePath, FIXTURE, 'utf8');

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

const page = await browser.newPage();
await page.goto(pathToFileURL(fixturePath).href);
await page.addScriptTag({ content: AXE });

const result = await page.evaluate(async () =>
  window.axe.run(document, {
    runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
  })
);

await browser.close();

const ids = result.violations.map((violation) => violation.id);
const expected = ['heading-order', 'image-alt', 'color-contrast'];

console.log(`fixture violations: ${ids.join(', ') || 'none'}`);

const missing = expected.filter((id) => !ids.includes(id));

if (missing.length) {
  console.error(`\nFAIL — runner did not detect: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('\nPASS — the runner detects skipped headings, missing alt text and contrast failures.');
