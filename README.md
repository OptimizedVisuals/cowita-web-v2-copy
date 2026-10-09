# CoWiTa website

Static marketing site plus a serverless form platform for the CoWiTa talent and
opportunity programmes. Built to be safe for children's data: every form is
validated, CAPTCHA-protected, rate limited and consent-gated on the server, and
submissions are stored in Postgres with an audit trail.

- **Site:** static HTML/CSS/JS
- **API:** Vercel functions (`/api`), Node 20, ESM
- **Database:** Supabase Postgres
- **Email:** Resend
- **CAPTCHA:** Cloudflare Turnstile
- **Admin dashboard:** `/admin/` (email link + TOTP MFA)

Full details: [API contract](api/README.md) · [operations runbook](docs/RUNBOOK.md) · [audit status](docs/AUDIT-STATUS.md)

## Quick start

```bash
npm ci
npm run dev            # http://localhost:4321
```

The dev server serves the real site and mounts the real API handlers against an
in-memory database, with email and CAPTCHA disabled, so you can complete the
whole form journey locally. Inspect what was stored at
`http://localhost:4321/api/__submissions`.

## Verification

```bash
npm run verify         # links + assets, SEO files, tests, minified build
```

| Command | What it checks |
| --- | --- |
| `npm run check-links` | Every internal `href`, `src`, `srcset`, `content` and CSS `url()` resolves |
| `npm test` | 61 tests: validation, sanitisation, origin/bot guards, rate limiting, the submission endpoint, the admin API and health |
| `node tools/generate-seo-files.mjs` | Sitemap/robots are current and **no two pages share a title or description** (exits non-zero if they do) |
| `npm run a11y` | axe-core (WCAG 2.1 A/AA + best practice) on every page, plus a focus-visibility audit of every control |
| `npm run a11y:selfcheck` | Proves the axe runner really does fail on a broken page (a clean run is otherwise meaningless) |
| `npm run build` | Produces the minified `dist/` that Vercel serves |

Each check fails loudly rather than warning, so CI can depend on it.

## Accessibility

```bash
npm run a11y           # self-check + axe sweep + focus visibility (starts its own server)
```

The suite runs `axe-core` against all eleven pages with the WCAG 2.1 A/AA *and*
best-practice rulesets, then measures every focusable control with a real
keyboard focus to confirm it changes visibly (WCAG 2.4.7). Current state: no
violations, and every control shows a focus indicator.

Contrast findings are fixed with the measured background colour rather than by
guessing — axe reports the composited background, and the helper rewrites the
owning CSS rule to the token that passes (dark teal → `--gold-on-dark`, cream →
`--gold-ink`, gold band → `rgba(8, 48, 47, .92)`):

```bash
node tools/a11y-check.mjs --json a11y-findings.json
node tools/a11y-contrast-fix.mjs a11y-findings.json
```

Purely decorative artwork (the faded watermark numerals) is drawn with CSS
`content` instead of a text node, so contrast checkers no longer measure a
colour that is intentionally near-invisible.

## Project layout

```
api/                 Vercel functions (forms, admin, health, retention)
  _lib/              validation, sanitisation, auth, rate limiting, email, logging
admin/               Staff dashboard (magic link + TOTP, no framework)
assets/              Images (WebP) and self-hosted fonts
css/                 styles.css (shared), fonts.css, pages/*.css (per page)
js/                  config.js, main.js, form-handler.js, pages/*.js
legal/               Privacy, terms, cookies, safeguarding, child protection,
                     code of conduct, complaints, retention, accessibility
components/          Shared header and footer
supabase/migrations/ SQL schema
tools/               Dev server, build, link checker, SEO, image and font scripts
tests/               Node test runner suite
docs/                Runbook and audit status
```

## Editing content

- **Pages:** each page owns its markup; page-specific CSS lives in
  `css/pages/<slug>.css` (extracted from inline blocks so a strict CSP is
  possible). Never add `<style>`, inline `style="…"` or inline `<script>` — the
  CSP will block it. Use the utility classes in `css/styles.css` instead.
- **Forms:** post to `/api/forms/<type>`. If you add a field, add it to the
  schema in [`api/_lib/config.mjs`](api/_lib/config.mjs) too, or it will be
  dropped by the server.
- **Policies:** drafted in `legal/` and generated with
  `npm run generate:legal`. They are drafts pending Richard's approval — see
  `docs/AUDIT-STATUS.md`.

## Regenerating derived files

```bash
npm run generate:legal     # legal/*.html from the shared template
npm run generate:seo       # canonical/OG/favicon/JSON-LD + sitemap + robots
npm run optimize:images    # WebP conversion, dimensions, lazy loading
npm run fonts              # re-fetch and self-host webfonts
npm run extract:inline     # move any new inline <style>/<script> out of HTML
```

Generated output (`sitemap.xml`, `robots.txt`, `css/fonts.css`) is committed;
CI fails if it drifts from the generators.

## Deployment

Vercel, with `buildCommand: npm run build` and `outputDirectory: dist`.
`vercel.json` also carries the security headers (HSTS, CSP, Permissions-Policy,
Cross-Origin-\*) and the daily retention cron.

Set the environment variables from [`.env.example`](.env.example) per
environment, apply `supabase/migrations/0001_init.sql`, and follow the
[runbook](docs/RUNBOOK.md) for the first deploy, monitoring and rollback.

## Branches

`main` is production, `staging` is the pre-production target, feature branches
merge via PR. CI runs links, tests, metadata checks and the build on both.
