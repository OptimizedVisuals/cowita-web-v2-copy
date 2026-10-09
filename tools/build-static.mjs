/**
 * CoWiTa — static build.
 *
 * Copies the public site into dist/ and minifies every CSS and JavaScript file
 * with esbuild. HTML is copied byte-for-byte so the source stays readable and
 * diffs stay reviewable.
 *
 * Run with:  npm run build
 * Vercel uses this via "buildCommand" in vercel.json; the API functions under
 * /api are deployed separately by Vercel and are not part of dist/.
 */

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/** Everything the browser needs. */
const PUBLIC_ENTRIES = [
  'assets',
  'components',
  'css',
  'js',
  'legal',
  'about',
  'contact',
  'get-involved',
  'impact',
  'opportunity',
  'stories',
  'support',
  'utility',
  'work',
  'admin',
  'index.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
];

const SITE_FILES = new Set(['_headers', '_redirects', 'netlify.toml', 'manifest.webmanifest']);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const entry of PUBLIC_ENTRIES) {
  const from = join(root, entry);
  try {
    statSync(from);
  } catch {
    continue;
  }
  cpSync(from, join(dist, entry), { recursive: true });
}

for (const file of SITE_FILES) {
  try {
    cpSync(join(root, file), join(dist, file));
  } catch {
    /* optional file */
  }
}

/* --- minify ------------------------------------------------------------- */

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

let cssSaved = 0;
let jsSaved = 0;

for (const file of walk(dist)) {
  const ext = extname(file).toLowerCase();

  if (ext !== '.css' && ext !== '.js') continue;

  // Never touch the vendored Supabase bundle: it is shipped as-is.
  if (file.includes(`${join('admin', 'vendor')}`)) continue;

  const source = readFileSync(file, 'utf8');
  const loader = ext === '.css' ? 'css' : 'js';

  const result = await transform(source, {
    loader,
    minify: true,
    target: 'es2020',
    legalComments: 'none',
  });

  const saved = Buffer.byteLength(source) - Buffer.byteLength(result.code);
  if (ext === '.css') cssSaved += saved;
  else jsSaved += saved;

  writeFileSync(file, result.code, 'utf8');
}

console.log(`dist/ built at ${relative(root, dist)}`);
console.log(`CSS minified: saved ${(cssSaved / 1024).toFixed(1)} KB`);
console.log(`JS minified: saved ${(jsSaved / 1024).toFixed(1)} KB`);
