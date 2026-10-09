# Deprecated — Google Apps Script prototype

> **Status: superseded. Do not wire forms to this backend.**
> The production form backend lives in `/api`. This folder is kept for
> historical reference only.

## What this was

`apps-script/Code.gs` was the first-pass form backend: a Google Apps
Script web app that wrote submissions into a Google Sheet and sent
confirmation emails via `MailApp`. It was adequate as a prototype but was
never suitable for production use with children's data.

## Why it was replaced

The production backend at `/api` was built to satisfy the audit's
requirements, which the Apps Script prototype could not meet:

| Requirement | Apps Script prototype | Production `/api` |
| --- | --- | --- |
| Server-side validation | None | Full validation layer (`api/_lib/validation.mjs`) |
| Sanitisation | None | Input sanitisation and output escaping |
| Origin / Referer checks | None | Allow-list, returns 403 on mismatch |
| Rate limiting | None | Per-IP, per-email, per-form-type limits |
| CAPTCHA | None | Cloudflare Turnstile, verified server-side |
| Storage | Google Sheets | Postgres / Supabase, with status workflow |
| Email | `MailApp` | Resend, with admin notification and user confirmation |
| Admin dashboard | None | `/admin` with auth, 2FA, RBAC, audit log |
| Retention / deletion | Manual | Automated via `api/admin/retention.mjs` |
| Audit trail | None | Structured logs and admin audit events |

## What to do instead

- Forms post to `POST /api/forms/<type>` — see `api/README.md` for the
  endpoint contract and `api/forms/[type].mjs` for the handler.
- The site's form handler is `js/form-handler.js`, which reads
  `window.COWITA_CONFIG.API_BASE` from `js/config.js`.
- Email copy and per-form labels that used to live in `Code.gs` are now
  maintained in the API layer and the email templates.

## Why keep the folder

Two things are still worth referring to:

1. **Email copy.** The per-form subject lines and confirmation messages in
   `FORM_CONFIG` (in `Code.gs`) are the wording the team originally signed
   off on. If the production emails should sound the same, use them as the
   source of truth.
2. **Column labels.** `COLUMN_LABELS` maps raw field names to friendly
   labels. Useful if the admin export or spreadsheet columns ever need
   to match what stakeholders already know.

Neither should be used as a runtime dependency.

## If you are resurrecting this

Do not. The production backend already does everything this does, plus
the security and legal requirements the audit demanded. If you have a
concrete reason to bring back Apps Script, raise it with the auditor
first — there may be context you are missing.

---

*Last reviewed: 10 October 2026.*
*Superseded by: `/api` (see `api/README.md`).*