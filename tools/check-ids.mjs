/**
 * CoWiTa — duplicate id and unresolved form= reference checker.
 *
 * Walks every .html file in the repo (excluding build output and vendor
 * directories) and reports two classes of defect:
 *
 *   1. Duplicate id="..." values within a single document.
 *      Illegal per HTML spec; also the audit's "no duplicate IDs" condition.
 *
 *   2. form="X" attributes that point at an id not defined in the same
 *      document. The form handler's collectControls() does a document-wide
 *      query for [form="X"], so a typo'd target silently drops those
 *      controls from submission.
 *
 * Exits non-zero if either is found, so it can be part of `npm run verify`.
 *
 * Usage:  node tools/check-ids.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.freebuff',
  'apps-script',
  'dist',
]);

/** Recursively collect every .html file, skipping ignored directories. */
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

/**
 * Replace the body of every <script> and <style> block with whitespace of
 * the same length, preserving offsets so line numbers stay accurate.
 */
function stripScriptsAndStyles(source) {
  return source.replace(
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
    (block) => block.replace(/[^\n]/g, ' ')
  );
}

/** Unescape the HTML entities that could plausibly appear inside an id. */
function unescapeAttr(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Return [{ id, line }] for every id="..." or id='...' in the source,
 * with its 1-based line number.
 */
function collectIds(source) {
  const results = [];
  const pattern = /\bid\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const raw = match[2] !== undefined ? match[2] : match[3];
    const id = unescapeAttr(raw).trim();
    if (!id) continue;

    const before = source.slice(0, match.index);
    const line = before.split('\n').length;

    results.push({ id, line });
  }

  return results;
}

/** Return [{ id, line }] for every form="..." reference in the source. */
function collectFormTargets(source) {
  const results = [];
  const pattern = /\bform\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const raw = match[2] !== undefined ? match[2] : match[3];
    const id = unescapeAttr(raw).trim();
    if (!id) continue;

    const before = source.slice(0, match.index);
    const line = before.split('\n').length;

    results.push({ id, line });
  }

  return results;
}

/* ------------------------------------------------------------------ main */

const files = walk(root).sort();

let totalIds = 0;
let totalFormRefs = 0;
let filesWithProblems = 0;
const problems = [];

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const source = stripScriptsAndStyles(raw);

  const ids = collectIds(source);
  const formTargets = collectFormTargets(source);
  totalIds += ids.length;
  totalFormRefs += formTargets.length;

  // --- duplicate ids -----------------------------------------------------
  const byId = new Map();
  for (const { id, line } of ids) {
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(line);
  }

  const duplicates = [...byId.entries()].filter(([, lines]) => lines.length > 1);

  // --- unresolved form= targets ------------------------------------------
  const definedIds = new Set(ids.map((entry) => entry.id));
  const unresolved = formTargets.filter((entry) => !definedIds.has(entry.id));

  if (duplicates.length === 0 && unresolved.length === 0) {
    continue;
  }

  filesWithProblems += 1;
  problems.push({ file: relative(root, file), duplicates, unresolved });
}

/* -------------------------------------------------------------- reporting */

if (problems.length === 0) {
  console.log(
    `Checked ${files.length} HTML file(s): ` +
    `${totalIds} id(s), ${totalFormRefs} form= reference(s). ` +
    `No duplicate ids, no unresolved form= references.`
  );
  process.exit(0);
}

console.error(
  `Checked ${files.length} HTML file(s): ${totalIds} id(s), ` +
  `${totalFormRefs} form= reference(s).`
);
console.error(
  `\n${problems.length} file(s) with problems:\n`
);

for (const { file, duplicates, unresolved } of problems) {
  console.error(`  ${file}`);

  for (const [id, lines] of duplicates) {
    console.error(
      `    duplicate id="${id}" at lines ${lines.join(', ')}`
    );
  }

  for (const { id, line } of unresolved) {
    console.error(
      `    form="${id}" at line ${line} — no element with that id in this file`
    );
  }

  console.error('');
}

process.exit(1);