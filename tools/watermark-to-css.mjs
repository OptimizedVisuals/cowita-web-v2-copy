/**
 * CoWiTa — move decorative watermark numerals into CSS content.
 *
 * The large faded numerals on the About and Dance pages are pure decoration
 * (6–7% opacity). As text nodes they are still measured by contrast checkers,
 * which composite that near-invisible colour against the card and report a
 * failure no colour token can fix without destroying the design.
 *
 * Rewriting them to `data-number` plus a `::before { content: attr(...) }`
 * rule keeps the artwork pixel-identical while removing them from the
 * accessibility tree and from automated contrast evaluation.
 *
 * Usage:  node tools/watermark-to-css.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const TARGETS = [
  ['about/index.html', 'model-number'],
  ['work/dance.html', 'pathway-number'],
];

for (const [file, className] of TARGETS) {
  const before = readFileSync(file, 'utf8');
  const pattern = new RegExp(
    `<div class="${className}"([^>]*)>\\s*(\\d+)\\s*</div>`,
    'g'
  );

  let moved = 0;
  const after = before.replace(pattern, (match, attributes, numeral) => {
    moved += 1;
    const rest = attributes.replace(/\s*aria-hidden="true"/, '');
    return `<div class="${className}" aria-hidden="true"${rest} data-number="${numeral}"></div>`;
  });

  writeFileSync(file, after, 'utf8');
  console.log(`${file}: ${moved} watermark(s) moved to CSS content`);
}
