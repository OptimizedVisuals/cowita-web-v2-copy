/**
 * CoWiTa — accessibility suite.
 *
 * Starts the local dev server (or reuses one that is already listening), then
 * runs, in order:
 *
 *   1. axe-rule-selfcheck  — proves the runner detects broken pages
 *   2. a11y-check           — axe-core WCAG 2.1 A/AA plus best-practice rules
 *   3. focus-check          — visible focus indicator on every control
 *
 * The server is stopped again when this script started it, so the command is
 * safe to run locally and in CI. Exits non-zero if any audit fails.
 *
 * Usage:  node tools/a11y-suite.mjs
 */

import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://localhost:4321';

async function isUp() {
  try {
    const response = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

let server = null;

if (await isUp()) {
  console.log(`Reusing the dev server already listening on ${BASE}`);
} else {
  console.log(`Starting the dev server on ${BASE}…`);
  server = spawn(process.execPath, ['tools/dev-server.mjs'], {
    cwd: root,
    stdio: 'ignore',
    detached: false,
  });

  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isUp()) {
      ready = true;
      break;
    }
    if (server.exitCode !== null) break;
  }

  if (!ready) {
    console.error('The dev server did not become ready — aborting.');
    server.kill();
    process.exit(1);
  }
}

const STEPS = [
  ['axe runner self-check', ['tools/axe-rule-selfcheck.mjs']],
  ['axe-core audit (WCAG 2.1 A/AA + best practice)', ['tools/a11y-check.mjs', '--best-practices']],
  ['focus visibility audit', ['tools/focus-check.mjs']],
];

const failures = [];

for (const [name, args] of STEPS) {
  console.log(`\n=== ${name}`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });

  if (result.status !== 0) failures.push(name);
}

if (server) {
  server.kill();
  console.log('\nStopped the dev server started by this suite.');
}

if (failures.length) {
  console.error(`\nAccessibility suite failed: ${failures.join(', ')}`);
  process.exit(1);
}

console.log('\nAccessibility suite passed.');
