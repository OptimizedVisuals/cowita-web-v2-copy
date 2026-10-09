/**
 * CoWiTa — inline asset extraction.
 *
 * Moves every inline <style> block into /css/pages/<slug>.css and every
 * inline <script> block into /js/pages/<slug>.js, replacing them with a
 * <link> or <script src>. This is what makes a Content-Security-Policy
 * without 'unsafe-inline' possible.
 *
 * Run with:  node tools/extract-inline-assets.mjs
 * The script is idempotent: pages with no inline blocks are left alone.
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORED = new Set(['.git', 'node_modules', '.freebuff', 'apps-script', 'tools', 'admin', 'dist']);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (entry.endsWith('.html')) files.push(full);
  }
  return files;
}

function slugFor(file) {
  const rel = relative(root, file).replace(/\\/g, '/');
  if (rel === 'index.html') return 'home';
  return rel
    .replace(/\.html$/, '')
    .replace(/\/index$/, '-index')
    .replace(/\//g, '-');
}

mkdirSync(join(root, 'css', 'pages'), { recursive: true });
mkdirSync(join(root, 'js', 'pages'), { recursive: true });

let styleFiles = 0;
let scriptFiles = 0;

for (const file of walk(root)) {
  const slug = slugFor(file);
  let source = readFileSync(file, 'utf8');
  const original = source;

  /* ---- inline <style> blocks ---------------------------------------- */
  const styleBlocks = [...source.matchAll(/[ \t]*<style[^>]*>([\s\S]*?)<\/style>\s*\r?\n?/g)];

  if (styleBlocks.length) {
    const css = styleBlocks
      .map((match) => match[1].replace(/^\n+|\n+$/g, ''))
      .join('\n\n');

    const cssPath = join(root, 'css', 'pages', `${slug}.css`);
    writeFileSync(
      cssPath,
      `/* ${relative(root, file).replace(/\\/g, '/')} — page-specific styles\n   (extracted from an inline <style> block for CSP compliance) */\n\n${css}\n`,
      'utf8'
    );

    // Insert the link right after the shared stylesheet link.
    const link = `  <link rel="stylesheet" href="/css/pages/${slug}.css">`;
    let replaced = false;

    source = source.replace(/[ \t]*<style[^>]*>[\s\S]*?<\/style>\s*\r?\n?/g, () => {
      if (replaced) return '';
      replaced = true;
      return `${link}\n`;
    });

    styleFiles += 1;
  }

  /* ---- inline <script> blocks --------------------------------------- */
  const scriptBlocks = [
    ...source.matchAll(/[ \t]*<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>\s*\r?\n?/g),
  ].filter((match) => match[2].trim().length > 0);

  if (scriptBlocks.length) {
    const js = scriptBlocks
      .map((match) => match[2].replace(/^\n+|\n+$/g, ''))
      .join('\n\n');

    const jsPath = join(root, 'js', 'pages', `${slug}.js`);
    writeFileSync(
      jsPath,
      `/* ${relative(root, file).replace(/\\/g, '/')} — page scripts\n   (extracted from an inline <script> block for CSP compliance) */\n\n${js}\n`,
      'utf8'
    );

    const tag = `  <script src="/js/pages/${slug}.js" defer></script>`;
    let replaced = false;

    source = source.replace(
      /[ \t]*<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>\s*\r?\n?/g,
      (match) => {
        if (!match.replace(/<script[^>]*>|<\/script>|\s/g, '')) return match; // keep empty
        if (replaced) return '';
        replaced = true;
        return `${tag}\n`;
      }
    );

    scriptFiles += 1;
  }

  if (source !== original) {
    writeFileSync(file, source, 'utf8');
    console.log(`extracted: ${relative(root, file)}`);
  }
}

console.log(`\n${styleFiles} page stylesheet(s) and ${scriptFiles} page script(s) extracted.`);
