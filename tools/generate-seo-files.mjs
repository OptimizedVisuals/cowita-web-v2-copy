/**
 * CoWiTa — sitemap.xml, robots.txt and metadata uniqueness check.
 *
 * Run with:  node tools/generate-seo-files.mjs
 *
 * Excludes the admin dashboard, the API and the noindex thank-you page.
 * Also fails (exit 1) when two pages share a <title> or meta description,
 * which is exactly the kind of duplication the audit flagged.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://cowita.org';
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.freebuff', 'apps-script', 'tools', 'admin', 'dist']);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (entry.endsWith('.html')) files.push(full);
  }
  return files;
}

const pages = walk(root)
  .map((file) => relative(root, file).replace(/\\/g, '/'))
  .filter((rel) => !rel.includes('thank-you'))
  .sort();

const titles = new Map();
const descriptions = new Map();
const duplicates = [];

const entries = pages.map((rel) => {
  const html = readFileSync(join(root, rel), 'utf8');
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1].replace(/\s+/g, ' ').trim();
  const description = (
    html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [, '']
  )[1].replace(/\s+/g, ' ').trim();
  const noindex = /name="robots"[^>]*noindex/i.test(html);

  for (const [map, value, label] of [
    [titles, title, 'title'],
    [descriptions, description, 'description'],
  ]) {
    if (!value) continue;
    if (map.has(value)) {
      duplicates.push(`${label} duplicated: "${value}" (${map.get(value)} + ${rel})`);
    } else {
      map.set(value, rel);
    }
  }

  const url = rel === 'index.html'
    ? `${SITE}/`
    : rel.endsWith('/index.html')
      ? `${SITE}/${rel.replace(/index\.html$/, '')}`
      : `${SITE}/${rel}`;

  return { url, noindex };
});

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries
    .filter((entry) => !entry.noindex)
    .map((entry) => `  <url><loc>${entry.url}</loc></url>`),
  '</urlset>',
  '',
].join('\n');

writeFileSync(join(root, 'sitemap.xml'), sitemap, 'utf8');

const robots = [
  '# CoWiTa — https://cowita.org',
  '',
  'User-agent: *',
  'Allow: /',
  '',
  '# Staff-only and API paths',
  'Disallow: /admin/',
  'Disallow: /api/',
  'Disallow: /get-involved/thank-you.html',
  '',
  `Sitemap: ${SITE}/sitemap.xml`,
  '',
].join('\n');

writeFileSync(join(root, 'robots.txt'), robots, 'utf8');

console.log(`sitemap.xml written with ${entries.filter((e) => !e.noindex).length} URLs`);
console.log('robots.txt written');

if (duplicates.length) {
  console.error(`\n${duplicates.length} duplicate metadata issue(s):`);
  for (const item of duplicates) console.error(`  ${item}`);
  process.exit(1);
}

console.log('No duplicate titles or descriptions.');
