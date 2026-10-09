/**
 * CoWiTa — SEO metadata generator.
 *
 * Idempotently adds to every public page:
 *   - <link rel="canonical">
 *   - Open Graph and Twitter Card tags (from the page title/description)
 *   - favicon / apple-touch-icon links
 *   - JSON-LD structured data: Organization + WebSite on the home page,
 *     BreadcrumbList elsewhere, FAQPage on the FAQ page
 *
 * Run with:  node tools/seo-metadata.mjs
 * After changing structured data, regenerate CSP hashes:
 *   node tools/generate-csp-hashes.mjs
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://cowita.org';
const OG_IMAGE = `${SITE}/assets/images/stories-hero.webp`;
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

function canonicalFor(file) {
  const rel = relative(root, file).replace(/\\/g, '/');
  if (rel === 'index.html') return `${SITE}/`;
  if (rel.endsWith('/index.html')) return `${SITE}/${rel.replace(/index\.html$/, '')}`;
  return `${SITE}/${rel}`;
}

function titleFor(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : 'CoWiTa';
}

function descriptionFor(html) {
  const match = html.match(
    /<meta\s+name="description"\s+content="([^"]*)"/i
  ) || html.match(/<meta\s+content="([^"]*)"\s+name="description"/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function breadcrumbFor(file, title) {
  const rel = relative(root, file).replace(/\\/g, '/');
  const parts = rel.split('/');
  const items = [{ name: 'Home', url: `${SITE}/` }];

  if (parts.length === 1) return items;

  if (parts.length > 2) {
    const section = parts[0];
    items.push({
      name: section.charAt(0).toUpperCase() + section.slice(1),
      url: `${SITE}/${section}/`,
    });
  }

  items.push({ name: title.split('|')[0].split('—')[0].trim(), url: canonicalFor(file) });
  return items;
}

function jsonLdBlock(data) {
  return `  <script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n  </script>\n`;
}

const HOME_ORG = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'CoWiTa',
      url: `${SITE}/`,
      logo: `${SITE}/assets/images/brand/cowita-logo-primary.svg`,
      description:
        'CoWiTa connects young creative talent with skills, mentorship and opportunity.',
      areaServed: 'KE',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: `${SITE}/`,
      name: 'CoWiTa',
      publisher: { '@id': `${SITE}/#organization` },
      inLanguage: 'en',
    },
  ],
};

const FAQ_ITEMS = [
  {
    q: 'What is CoWiTa?',
    a: 'CoWiTa is a creative talent and opportunity organisation that helps young people turn talent into skills, and skills into opportunities.',
  },
  {
    q: 'Who can take part in CoWiTa programmes?',
    a: 'Our programmes are designed for children and young people, along with mentors, volunteers, partners and supporters who want to contribute.',
  },
  {
    q: 'Does sending a form guarantee a place on a programme?',
    a: 'No. Every form on this site is an expression of interest. We review each one and get back to you about the most relevant next step.',
  },
  {
    q: 'How does CoWiTa handle personal information from under-18s?',
    a: 'A parent or guardian must agree to the submission, and we collect only what the programme needs. Our Privacy Policy and Child Protection Policy explain this in full.',
  },
];

let updated = 0;

for (const file of walk(root)) {
  const rel = relative(root, file).replace(/\\/g, '/');
  let html = readFileSync(file, 'utf8');

  // Skip the thank-you page (noindex) and any component partials.
  if (rel.includes('thank-you')) continue;
  if (!html.includes('<html')) continue;

  const title = titleFor(html);
  const description = descriptionFor(html);
  const canonical = canonicalFor(file);

  const additions = [];

  if (!/rel="canonical"/.test(html)) {
    additions.push(`  <link rel="canonical" href="${canonical}">`);
  }

  if (!/property="og:title"/.test(html)) {
    additions.push(
      `  <meta property="og:type" content="website">`,
      `  <meta property="og:site_name" content="CoWiTa">`,
      `  <meta property="og:title" content="${escapeAttr(title)}">`,
      `  <meta property="og:description" content="${escapeAttr(description)}">`,
      `  <meta property="og:url" content="${canonical}">`,
      `  <meta property="og:image" content="${OG_IMAGE}">`,
      `  <meta property="og:image:alt" content="CoWiTa — talent into opportunity">`,
      `  <meta property="og:locale" content="en_GB">`
    );
  }

  if (!/name="twitter:card"/.test(html)) {
    additions.push(
      `  <meta name="twitter:card" content="summary_large_image">`,
      `  <meta name="twitter:title" content="${escapeAttr(title)}">`,
      `  <meta name="twitter:description" content="${escapeAttr(description)}">`,
      `  <meta name="twitter:image" content="${OG_IMAGE}">`
    );
  }

  // Self-hosted fonts: every page needs the @font-face stylesheet and the
  // two critical font preloads, not just the pages that once used Google Fonts.
  if (!/href="\/css\/fonts\.css"/.test(html)) {
    const fontBlock = [
      `  <link rel="preload" href="/assets/fonts/inter-400-normal-latin.woff2" as="font" type="font/woff2" crossorigin>`,
      `  <link rel="preload" href="/assets/fonts/lora-400-normal-latin.woff2" as="font" type="font/woff2" crossorigin>`,
      `  <link rel="stylesheet" href="/css/fonts.css">`,
    ].join('\n');

    if (/<link rel="stylesheet" href="\/css\/styles\.css">/.test(html)) {
      html = html.replace(
        /<link rel="stylesheet" href="\/css\/styles\.css">/,
        `${fontBlock}\n  <link rel="stylesheet" href="/css/styles.css">`
      );
      additions.push('__FONT_BLOCK_APPLIED__');
    } else {
      additions.push(fontBlock);
    }
  }

  if (!/rel="icon"/.test(html)) {
    additions.push(
      `  <link rel="icon" type="image/svg+xml" href="/assets/images/brand/cowita-favicon.svg">`,
      `  <link rel="apple-touch-icon" href="/assets/images/cowita-logo.png">`
    );
  }

  if (!/application\/ld\+json/.test(html)) {
    if (rel === 'index.html') {
      additions.push(jsonLdBlock(HOME_ORG).trimEnd());
    } else {
      const items = breadcrumbFor(file, title);
      additions.push(
        jsonLdBlock({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: items.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.name,
            item: item.url,
          })),
        }).trimEnd()
      );
    }
  }

  if (rel === 'utility/faq.html' && !/FAQPage/.test(html)) {
    additions.push(
      jsonLdBlock({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ_ITEMS.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      }).trimEnd()
    );
  }

  if (!additions.length) continue;

  const block = `${additions.filter((item) => item !== '__FONT_BLOCK_APPLIED__').join('\n')}\n`;

  // Insert just before </head>
  html = html.replace(/<\/head>/i, `${block}</head>`);

  writeFileSync(file, html, 'utf8');
  updated += 1;
  console.log(`seo updated: ${rel}`);
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

console.log(`\n${updated} page(s) updated.`);
