# CoWiTa form API

Serverless functions (Node 20, ESM) behind `/api`. Every form on the website
posts here; the admin dashboard reads from here. Nothing in this directory is
shipped to the browser.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/forms/:type` | none (public) | Accept a form submission |
| `GET` | `/api/health` | none | Health check for uptime monitoring |
| `GET` | `/api/admin/me` | admin + MFA | Who am I, and what role? |
| `GET` | `/api/admin/submissions` | admin + MFA | List, search, filter, paginate |
| `GET` | `/api/admin/submissions/:id` | admin + MFA | One submission with its history |
| `PATCH` | `/api/admin/submissions/:id` | admin (role) + MFA | Update status / internal notes |
| `POST` | `/api/admin/submissions/:id` | admin (role) + MFA | Restore a soft-deleted submission (`{"action":"restore"}`) |
| `DELETE` | `/api/admin/submissions/:id` | admin; `?hard=1` needs owner | Soft delete, or permanent delete |
| `GET` | `/api/admin/export` | admin + MFA | CSV export honouring the list filters |
| `POST` | `/api/admin/retention` | `CRON_SECRET` | Scheduled retention job |

`:type` is one of `contact`, `talent`, `mentor`, `partner`, `collaborate`,
`learn`, `support`.

## Submission request

`POST /api/forms/talent` with JSON (or `application/x-www-form-urlencoded` for
the no-JavaScript fallback):

```json
{
  "full_name": "Ada Lovelace",
  "email": "ada@example.org",
  "discipline": "dance",
  "specific_talent": "Contemporary dance",
  "talent_description": "I have danced for four years…",
  "consent": "on",
  "turnstile_token": "0.abc123",
  "honeypot": ""
}
```

Rules applied before anything is stored:

- **Origin/Referer** must match `ALLOWED_ORIGINS` (or the request's own host).
- Obvious **bot user agents** are rejected.
- Body must be **≤ 32 KB**.
- **Honeypot filled** → silently reports success, stores nothing.
- **Rate limits** (15-minute fixed windows): 8 per IP, 4 per email,
  60 per IP+form-type.
- **Turnstile** token verified against Cloudflare (fail-closed in production).
- **Field validation**: required fields, email/phone/URL formats, enum values,
  numeric ranges, age bounds, maximum lengths, and `consent` must be true.
- Unknown fields are dropped (mass-assignment protection) and logged.

## Responses

| Status | Meaning |
| --- | --- |
| `200` | Stored. Returns `{ ok, id, form_type, consent_version }` |
| `303` | No-JS form post: redirect to the thank-you page |
| `400` | Unreadable body |
| `403` | Bad origin, bot, or failed CAPTCHA |
| `404` | Unknown form type |
| `405` | Wrong method |
| `413` | Payload too large |
| `422` | Validation failed — `errors` is keyed by field name |
| `429` | Rate limited — includes `Retry-After` |
| `500` | Could not save |

Validation error example:

```json
{
  "ok": false,
  "error": "Please correct the highlighted fields and try again.",
  "errors": {
    "email": "Please enter a valid email address.",
    "consent": "You must confirm you have read and agree to the Privacy Policy."
  }
}
```

Admin endpoints return `401` (no/expired session), `403` with
`code: "mfa_required"` when the session has not completed TOTP, or `403` when
the role is too low.

## What is stored

`submissions` row per accepted form: `form_type`, `status`, promoted
`full_name`/`email`/`phone`/`age`, the sanitised answers in `payload` (JSONB),
`consent`, `consent_version`, `ip_hash` (SHA-256 of IP + pepper — never the raw
IP), `user_agent`, `referer`, timestamps. Status changes, notes, deletes and
exports are appended to `submission_events` (the audit trail).

## Environment variables

See [`.env.example`](../.env.example). Required in production:

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`RESEND_API_KEY`, `FROM_EMAIL`, `ADMIN_EMAIL`, `TURNSTILE_SECRET_KEY`,
`IP_HASH_PEPPER`, `ALLOWED_ORIGINS`, `SITE_URL`, `CRON_SECRET`.

Set the matching **public** Turnstile site key in `js/config.js`
(`TURNSTILE_SITE_KEY`). If it is empty the widget is not rendered and, in
production, the server rejects every submission — fail-closed by design.

## Emails

Each accepted submission sends:

1. **Admin notification** to `ADMIN_EMAIL` (reply-to = the sender) with every
   answer and a link to `/admin/`.
2. **Confirmation** to the sender.

Email failures are logged but never fail the request — the submission is the
priority.

## Local development

`npm run dev` serves the site and mounts these handlers with an in-memory
database, no email and no CAPTCHA:

```bash
npm run dev                  # http://localhost:4321
curl http://localhost:4321/api/__submissions   # inspect what was stored
```
