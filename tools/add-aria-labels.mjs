/**
 * CoWiTa — add aria-label to card-style checkboxes.
 *
 * The error summary in js/form-handler.js names each invalid field. For
 * card-style checkboxes (learning_area[], partner_type[], can_bring[],
 * looking_for[], bringing[], needs[], expertise[]), the wrapping <label>
 * contains the whole card, so labels[0].textContent is unusable. This
 * script adds a short aria-label to each such input; the handler prefers
 * aria-label when present (see fieldLabel in js/form-handler.js).
 *
 * Idempotent: inputs that already have an aria-label are left unchanged.
 *
 * Usage:  node tools/add-aria-labels.mjs
 *         node tools/add-aria-labels.mjs --dry-run
 *
 * Exit code is non-zero if any mapped input id is not found in its file.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

/**
 * file -> { inputId: aria-label }
 *
 * One entry per card-style checkbox group. Labels are short, human-readable,
 * and match the visible card title. Keep them free of "Please select" or
 * other instruction text — the error message supplies that.
 */
const MAPPING = {
  'get-involved/want-to-learn.html': {
    // learning_area[] — eight cards
    // Note: these inputs have no id in the current markup. See "Missing ids"
    // below for how the script handles that.
  },
  'get-involved/partner.html': {
    // partner_type[] — six cards
    'partner-schools': 'Schools & Educational Institutions',
    'partner-business': 'Creative Professionals & Businesses',
    'partner-community': 'Community Organisations',
    'partner-brands': 'Companies & Brands',
    'partner-foundations': 'Foundations & Development Organisations',
    'partner-public': 'Public Institutions',

    // can_bring[] — eight options
    'bring-expertise': 'Expertise & knowledge',
    'bring-mentorship': 'Mentorship',
    'bring-space': 'Space or venue',
    'bring-equipment': 'Equipment or technology',
    'bring-network': 'Networks & connections',
    'bring-opportunity': 'Creative or professional opportunities',
    'bring-funding': 'Funding or programme resources',
    'bring-other': 'Other',

    // looking_for[] — eight options
    'need-youth': 'Young people or participants',
    'need-creative': 'Creative collaborators',
    'need-skills': 'Technical or specialist skills',
    'need-space': 'Space or venue',
    'need-equipment': 'Equipment or production resources',
    'need-network': 'Networks or introductions',
    'need-expertise': 'Expertise or guidance',
    'need-other': 'Other',
  },
  'get-involved/collaborate.html': {
    // bringing[] — ten options. Inputs currently have no ids; matched by
    // name+value instead (see the alternate matcher below).
  },
  'get-involved/mentor.html': {
    // expertise[] — eleven options
    'expertise-creative': 'Creative practice',
    'expertise-dance': 'Dance',
    'expertise-acting': 'Acting',
    'expertise-music': 'Music',
    'expertise-writing': 'Writing',
    'expertise-visual': 'Visual arts',
    'expertise-production': 'Production',
    'expertise-business': 'Business',
    'expertise-career': 'Career development',
    'expertise-entrepreneurship': 'Entrepreneurship',
    'expertise-other': 'Other',
  },
};

/**
 * For checkboxes that have no id, we match by name + value. This is the
 * safer approach for learning_area[] and bringing[]/needs[], where adding
 * ids would require also touching CSS selectors.
 *
 * file -> [ { name, value, label } ]
 */
const MAPPING_BY_VALUE = {
  'get-involved/want-to-learn.html': [
    { name: 'learning_area[]', value: 'Dance', label: 'Dance' },
    { name: 'learning_area[]', value: 'Acting', label: 'Acting & Performance' },
    { name: 'learning_area[]', value: 'Drawing and Visual Art', label: 'Drawing & Visual Art' },
    { name: 'learning_area[]', value: 'Music', label: 'Music' },
    { name: 'learning_area[]', value: 'Writing and Storytelling', label: 'Writing & Storytelling' },
    { name: 'learning_area[]', value: 'Creative Production', label: 'Creative Production' },
    { name: 'learning_area[]', value: 'Digital and Creative Skills', label: 'Digital & Creative Skills' },
    { name: 'learning_area[]', value: 'Professional and Industry Skills', label: 'Professional & Industry Skills' },
  ],
  'get-involved/collaborate.html': [
    { name: 'bringing[]', value: 'creative-project', label: 'Creative project' },
    { name: 'bringing[]', value: 'event', label: 'Event' },
    { name: 'bringing[]', value: 'workshop', label: 'Workshop' },
    { name: 'bringing[]', value: 'community-initiative', label: 'Community initiative' },
    { name: 'bringing[]', value: 'content-media', label: 'Content / media' },
    { name: 'bringing[]', value: 'skills-expertise', label: 'Skills / expertise' },
    { name: 'bringing[]', value: 'space', label: 'Space' },
    { name: 'bringing[]', value: 'equipment-resources', label: 'Equipment / resources' },
    { name: 'bringing[]', value: 'network-platform', label: 'Network / platform' },
    { name: 'bringing[]', value: 'other', label: 'Other' },

    { name: 'needs[]', value: 'collaborators', label: 'Collaborators' },
    { name: 'needs[]', value: 'creative-skills', label: 'Creative skills' },
    { name: 'needs[]', value: 'technical-skills', label: 'Technical skills' },
    { name: 'needs[]', value: 'space', label: 'Space' },
    { name: 'needs[]', value: 'equipment', label: 'Equipment' },
    { name: 'needs[]', value: 'participants', label: 'Participants' },
    { name: 'needs[]', value: 'expertise', label: 'Expertise' },
    { name: 'needs[]', value: 'network-connections', label: 'Network / connections' },
    { name: 'needs[]', value: 'resources', label: 'Resources' },
    { name: 'needs[]', value: 'other', label: 'Other' },
  ],
};

/** Escape a string for literal use inside a RegExp. */
function reEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Locate the opening tag of an <input> that has the given attribute
 * (name="..." and value="..."), then insert aria-label="..." if missing.
 * Returns 'added' | 'present' | 'missing'.
 */
function patchByValue(source, { name, value, label }) {
  // Match the whole opening <input ...> tag containing both name and value.
  const inputTag = new RegExp(
    '<input\\b[^>]*\\bname="' + reEscape(name) + '"[^>]*\\bvalue="' + reEscape(value) + '"[^>]*>',
    'm'
  );

  const match = inputTag.exec(source);

  if (!match) {
    // Try the reverse attribute order too (value before name).
    const reversed = new RegExp(
      '<input\\b[^>]*\\bvalue="' + reEscape(value) + '"[^>]*\\bname="' + reEscape(name) + '"[^>]*>',
      'm'
    );
    const reversedMatch = reversed.exec(source);

    if (!reversedMatch) {
      return { status: 'missing', source };
    }

    return replaceTag(source, reversedMatch, label);
  }

  return replaceTag(source, match, label);
}

/**
 * Locate the opening tag of an <input id="...">, then insert
 * aria-label="..." if missing.
 */
function patchById(source, id, label) {
  const inputTag = new RegExp(
    '<input\\b[^>]*\\bid="' + reEscape(id) + '"[^>]*>',
    'm'
  );

  const match = inputTag.exec(source);

  if (!match) {
    return { status: 'missing', source };
  }

  return replaceTag(source, match, label);
}

/** Insert aria-label into the matched <input> tag if not already present. */
function replaceTag(source, match, label) {
  const tag = match[0];

  if (/\baria-label\s*=/.test(tag)) {
    return { status: 'present', source };
  }

  // Detect the indentation of the tag so the new attribute lines up.
  const lineStart = source.lastIndexOf('\n', match.index) + 1;
  const leading = source.slice(lineStart, match.index);
  const indent = /^\s*$/.test(leading) ? leading : '';

  // Insert on its own line before the closing ">".
  const insertion = '\n' + indent + '  aria-label="' + escapeAttr(label) + '"';
  const replaced = tag.replace(/\s*>$/, insertion + '\n' + indent + '>');

  const updated =
    source.slice(0, match.index) +
    replaced +
    source.slice(match.index + tag.length);

  return { status: 'added', source: updated };
}

/** Minimal attribute-value escaping. */
function escapeAttr(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

/* ----------------------------------------------------------------- main */

let anyMissing = false;

for (const [file, byId] of Object.entries(MAPPING)) {
  const path = join(root, file);
  let source = readFileSync(path, 'utf8');

  let added = 0;
  let present = 0;
  const missing = [];

  for (const [id, label] of Object.entries(byId)) {
    const result = patchById(source, id, label);
    source = result.source;

    if (result.status === 'added') added += 1;
    else if (result.status === 'present') present += 1;
    else missing.push(id);
  }

  const byValue = MAPPING_BY_VALUE[file] || [];

  for (const spec of byValue) {
    const result = patchByValue(source, spec);
    source = result.source;

    if (result.status === 'added') added += 1;
    else if (result.status === 'present') present += 1;
    else missing.push(`${spec.name}="${spec.value}"`);
  }

  const summary = `${file}: ${added} added, ${present} already present`;

  if (missing.length) {
    anyMissing = true;
    console.error(`${summary}, ${missing.length} MISSING:`);
    for (const id of missing) console.error(`    - ${id}`);
  } else {
    console.log(summary);
  }

  if (!dryRun && added > 0) {
    writeFileSync(path, source, 'utf8');
  }
}

if (anyMissing) {
  console.error(
    '\nSome mapped inputs were not found. The files were still written for ' +
    'the ones that matched. Fix the mapping (or the markup) and re-run.'
  );
  process.exit(1);
}

if (dryRun) {
  console.log('\nDry run — no files written.');
} else {
  console.log('\nDone. Re-run with --dry-run to preview without writing.');
}