/**
 * CoWiTa — accessibility smoke check.
 *
 * Runs axe-core (WCAG 2.1 A/AA) against a list of pages served by the local dev
 * server. Requires a Chromium-based browser installed by Playwright, which the
 * dev environment provides for the preview panel.
 *
 * Usage:
 *   node tools/dev-server.mjs &        # serve the site
 *   node tools/a11y-check.mjs
 *   node tools/a11y-check.mjs --best-practices   # also advisory rules
 *
 * Exits non-zero when a serious or critical violation is found, so it can gate
 * CI once a browser is available in the runner.
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://localhost:4321';

const rawArgs = process.argv.slice(2);
const jsonFlag = rawArgs.indexOf('--json');
const JSON_TARGET = jsonFlag === -1 ? null : rawArgs[jsonFlag + 1] || 'a11y-findings.json';

/** --best-practices also runs axe's advisory rules (heading order, landmarks). */
const BEST_PRACTICES = rawArgs.includes('--best-practices');

const pageArgs = rawArgs.filter(
  (arg, index) => !arg.startsWith('--') && index !== jsonFlag + 1
);

const PAGES = pageArgs.length
  ? pageArgs
  : [
      '/',
      '/about/',
      '/work/dance.html',
      '/get-involved/have-talent.html',
      '/get-involved/partner.html',
      '/contact/',
      '/stories/journeys.html',
      '/support/financial-support.html',
      '/utility/faq.html',
      '/legal/privacy.html',
      '/404.html',
    ];

const AXE = readFileSync(join(root, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('playwright-core is not installed — see docs/RUNBOOK.md for the manual axe steps.');
  process.exit(2);
}

/** Windows and macOS browsers installed outside Playwright. */
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

const browser = executablePath
  ? await chromium.launch({ executablePath })
  : await chromium.launch();

// The site ships a strict Content-Security-Policy, which correctly blocks
// injected inline scripts. bypassCSP lets this audit tool load axe-core; the
// site's own scripts still run under the real policy on real visits.
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  bypassCSP: true,
});
const page = await context.newPage();

const findings = [];
let failures = 0;

for (const path of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: AXE });

  const result = await page.evaluate(async (includeBestPractices) =>
    window.axe.run(document, {
      runOnly: includeBestPractices
        ? ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']
        : ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    }), BEST_PRACTICES === true
  );

  const serious = result.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact)
  );

  console.log(
    `${path.padEnd(34)} violations: ${result.violations.length} (serious/critical: ${serious.length})`
  );

  for (const violation of result.violations) {
    const detail = violation.nodes[0]?.failureSummary?.replace(/\s+/g, ' ').slice(0, 120) || '';
    console.log(`   - [${violation.impact}] ${violation.id} x${violation.nodes.length} ${detail}`);

    if (violation.id === 'color-contrast') {
      for (const node of violation.nodes) {
        const colours = (node.failureSummary || '').match(
          /foreground color: (#[0-9a-f]{6}), background color: (#[0-9a-f]{6})/i
        );

        findings.push({
          page: path,
          selector: (node.target || []).join(' '),
          fg: colours ? colours[1] : null,
          bg: colours ? colours[2] : null,
          html: (node.html || '').slice(0, 120),
        });
      }
    }
  }

  failures += serious.length;
}

if (JSON_TARGET) {
  writeFileSync(JSON_TARGET, JSON.stringify(findings, null, 2), 'utf8');
  console.log(`\nfindings written to ${JSON_TARGET} (${findings.length} contrast node(s))`);
}

await browser.close();

if (failures) {
  console.error(`\n${failures} serious/critical accessibility violation(s).`);
  process.exit(1);
}

console.log('\nNo serious or critical accessibility violations.');
