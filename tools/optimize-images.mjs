/**
 * CoWiTa — image optimisation.
 *
 *  1. Converts every .jpg/.jpeg/.png under assets/images to .webp (capped at
 *     1920px wide, quality 80) — logos and favicons are left as-is.
 *  2. Rewrites every reference in HTML and CSS from the old file to the .webp.
 *  3. Adds width/height attributes (from the real file) where missing, which
 *     removes layout shift, plus decoding="async".
 *  4. Adds loading="lazy" to images that are not the page's first (hero) image,
 *     and fetchpriority="high" to the first one.
 *  5. Reports the size before and after.
 *
 * Run with:  node tools/optimize-images.mjs
 * The original files are kept unless you pass --delete-originals.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'assets', 'images');
const DELETE_ORIGINALS = process.argv.includes('--delete-originals');
const MAX_WIDTH = 1920;
const QUALITY = 80;
const SKIP = [/favicon/i, /logo/i, /brand[\\/]/i];

function walkAssets(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkAssets(full, files);
    else files.push(full);
  }
  return files;
}

function walkSource(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (['.git', 'node_modules', '.freebuff', 'tools', 'admin', 'assets', 'dist'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkSource(full, files);
    else if (/\.(html|css|js)$/.test(entry)) files.push(full);
  }
  return files;
}

/* --- 1. convert --------------------------------------------------------- */

const sources = walkAssets(assetsDir).filter(
  (file) =>
    /\.(jpe?g|png)$/i.test(file) &&
    !SKIP.some((pattern) => pattern.test(file.replace(/\\/g, '/')))
);

let beforeBytes = 0;
let afterBytes = 0;
const converted = new Map();

for (const file of sources) {
  const ext = extname(file).toLowerCase();
  const target = file.replace(/\.(jpe?g|png)$/i, '.webp');

  const input = sharp(file, { failOn: 'none' });
  const metadata = await input.metadata();

  const pipeline = sharp(file, { failOn: 'none' }).rotate();

  if (metadata.width && metadata.width > MAX_WIDTH) {
    pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  }

  await pipeline.webp({ quality: QUALITY, effort: 4 }).toFile(target);

  const beforeSize = statSync(file).size;
  const afterSize = statSync(target).size;

  beforeBytes += beforeSize;
  afterBytes += afterSize;
  converted.set(file, { target, width: metadata.width, height: metadata.height });
}

/* --- 2. rewrite references --------------------------------------------- */

const sourceFiles = walkSource(root);
let rewriteCount = 0;

for (const file of sourceFiles) {
  let source = readFileSync(file, 'utf8');
  const original = source;

  // Swap only the extension, so surrounding quotes, url( ) wrappers and
  // srcset descriptors are left untouched.
  source = source.replace(/(\/assets\/[^\s"'()]+)\.(jpe?g|png)/gi, (match, pathname, ext) => {
    const disk = join(root, `${pathname}.${ext}`);
    if (!converted.has(disk)) return match;
    rewriteCount += 1;
    return `${pathname}.webp`;
  });

  if (source !== original) writeFileSync(file, source, 'utf8');
}

/* --- 3/4. dimensions, async decoding, lazy loading --------------------- */

const dims = new Map();
for (const [, info] of converted) {
  const name = relative(root, info.target).replace(/\\/g, '/');
  dims.set('/' + name, { width: info.width, height: info.height });
}

let dimensionCount = 0;
let lazyCount = 0;

for (const file of sourceFiles.filter((f) => f.endsWith('.html'))) {
  let html = readFileSync(file, 'utf8');
  const original = html;
  let index = 0;

  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    index += 1;

    const srcMatch = tag.match(/src="([^"]+)"/i);
    const info = srcMatch ? dims.get(srcMatch[1]) : null;

    let updated = tag;

    if (info && !/\bwidth=/i.test(updated) && !/\bheight=/i.test(updated)) {
      updated = updated.replace(/<img/i, `<img width="${info.width}" height="${info.height}"`);
      dimensionCount += 1;
    }

    if (!/\bdecoding=/i.test(updated)) {
      updated = updated.replace(/<img/i, '<img decoding="async"');
    }

    if (index === 1 && !/\bloading=/i.test(updated)) {
      updated = updated.replace(/<img/i, '<img fetchpriority="high"');
    } else if (!/\bloading=/i.test(updated)) {
      updated = updated.replace(/<img/i, '<img loading="lazy"');
      lazyCount += 1;
    }

    return updated;
  });

  if (html !== original) writeFileSync(file, html, 'utf8');
}

/* --- 5. report ---------------------------------------------------------- */

if (DELETE_ORIGINALS) {
  let removed = 0;
  for (const [file] of converted) {
    unlinkSync(file);
    removed += 1;
  }
  console.log(`deleted ${removed} original file(s)`);
}

console.log(`converted ${converted.size} image(s) to WebP`);
console.log(`rewrote ${rewriteCount} reference(s)`);
console.log(`added dimensions to ${dimensionCount} image(s), lazy loading to ${lazyCount}`);
console.log(
  `JPEG/PNG payload: ${(beforeBytes / 1048576).toFixed(1)} MB → ${(afterBytes / 1048576).toFixed(1)} MB`
);
