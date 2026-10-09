/**
 * CoWiTa local link checker.
 *
 * Walks every .html file in the repo, extracts href/src targets, and verifies
 * that every internal target exists on disk. External URLs, mailto:, tel:,
 * data: and pure anchors are skipped.
 *
 * Usage:  node tools/check-links.mjs
 * Exit code is non-zero when broken internal links are found (usable in CI).
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.freebuff', 'apps-script', 'dist']);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (entry.endsWith('.html')) files.push(full);
  }
  return files;
}

function resolves(target) {
  if (existsSync(target) && statSync(target).isFile()) return true;
  if (existsSync(target) && statSync(target).isDirectory()) {
    return existsSync(join(target, 'index.html'));
  }
  // Allow extensionless pretty URLs like /opportunity
  if (!/\.[a-z0-9]+$/i.test(target) && existsSync(`${target}.html`)) return true;
  if (existsSync(join(target, 'index.html'))) return true;
  return false;
}

function filesWith(extension, dir = root, files = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) filesWith(extension, full, files);
    else if (entry.endsWith(extension)) files.push(full);
  }
  return files;
}

/** Pull candidate asset URLs out of markup, CSS and meta content attributes. */
function collectTargets(source, isCss) {
  const targets = [];

  if (isCss) {
    for (const match of source.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
      targets.push(match[1].trim());
    }
    return targets;
  }

  for (const match of source.matchAll(/(?:href|src|content|srcset|poster)\s*=\s*"([^"]+)"/gi)) {
    const value = match[1].trim();

    if (/^[^"\s]+\s+[\d.]+[wx](\s*,|$)/i.test(value)) {
      // srcset: "a.jpg 1x, b.jpg 2x"
      for (const candidate of value.split(',')) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) targets.push(url);
      }
      continue;
    }

    // content="..." is only an asset reference when it points into /assets.
    if (/\bcontent\s*=\s*"[^"]*"$/i.test(match[0]) && !/\/assets\//.test(value)) {
      continue;
    }

    targets.push(value);
  }

  return targets;
}

const broken = [];
let checked = 0;

const markupFiles = walk(root);
const cssFiles = filesWith('.css', join(root, 'css'));

for (const file of [...markupFiles, ...cssFiles]) {
  const source = readFileSync(file, 'utf8');
  const fromDir = dirname(file);
  const isCss = file.endsWith('.css');

  for (const raw of collectTargets(source, isCss)) {

    if (
      !raw ||
      raw.startsWith('#') ||
      raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('//') ||
      raw.startsWith('mailto:') ||
      raw.startsWith('tel:') ||
      raw.startsWith('data:') ||
      raw.startsWith('javascript:') ||
      raw.includes('${')
    ) {
      continue;
    }

    const path = raw.split('#')[0].split('?')[0];
    if (!path) continue;

    checked += 1;

    const target = path.startsWith('/')
      ? join(root, path)
      : resolve(fromDir, path);

    if (!resolves(target)) {
      broken.push({
        file: relative(root, file),
        target: raw,
        resolvedTo: relative(root, target),
      });
    }
  }
}

console.log(`Checked ${checked} internal link(s) across the site.`);

if (broken.length) {
  console.error(`\n${broken.length} broken internal link(s):\n`);
  for (const item of broken) {
    console.error(`  ${item.file} -> ${item.target}  (missing: ${item.resolvedTo})`);
  }
  process.exit(1);
}

console.log('No broken internal links found.');
