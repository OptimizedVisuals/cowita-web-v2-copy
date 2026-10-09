# CoWiTa operations runbook

Everything needed to run, monitor, recover and hand over the CoWiTa website and
form platform. Written for whoever is on support duty — no prior context needed.

Companion documents:

- [README.md](../README.md) — architecture and local development
- [api/README.md](../api/README.md) — API contract
- [docs/AUDIT-STATUS.md](AUDIT-STATUS.md) — audit checklist and remaining owners

---

## 1. What runs where

| Piece | Technology | Where |
| --- | --- | --- |
| Marketing site | Static HTML/CSS/JS | Vercel static hosting (`dist/` build output) |
| Form API | Vercel functions (Node 20, ESM) | `/api/*` |
| Database | Postgres | Supabase (`submissions`, `submission_events`, `admin_users`, `rate_limits`) |
| Emails | Resend | Server-side only |
| CAPTCHA | Cloudflare Turnstile | Widget in the browser, secret on the server |
| Admin dashboard | Static page + Supabase auth | `/admin/` |
| Error tracking | Sentry (optional) | `SENTRY_DSN` |
| Uptime checks | Better Stack / UptimeRobot | `GET /api/health` every 60s |

## 2. Environments

| Environment | Branch | Vercel target | Purpose |
| --- | --- | --- | --- |
| Local | any | `npm run dev` | Day-to-day work, in-memory database |
| Preview | any PR | Vercel Preview | Review before merge; safe to submit test data |
| Staging | `staging` | Vercel Preview (aliased) | Full end-to-end checks with real services |
| Production | `main` | Vercel Production | Live site |

Environment variables are set per target in Vercel → Project → Settings →
Environment Variables. `.env.example` lists every name; never commit real values.

## 3. Deploying

```bash
# 1. Make sure the verification chain passes locally
npm ci
npm run verify        # links, SEO files, 61 tests, minified build

# 2. Open a PR into staging, let CI run, then merge
# 3. Promote to production by merging staging into main
```

Vercel builds automatically:

- `buildCommand`: `npm run build` → writes `dist/` (HTML copied, CSS/JS minified)
- `outputDirectory`: `dist`
- Functions under `/api` are detected separately — no build step is needed for them

### Database migrations

SQL lives in `supabase/migrations/`. Apply to staging first, then production:

```bash
# Supabase CLI, or paste the file into the Supabase SQL editor
supabase db push
```

The migration is idempotent (`create ... if not exists`), so it is safe to
re-run.

## 4. Rolling back

| Situation | Action |
| --- | --- |
| Bad site deploy | Vercel → Deployments → previous good deployment → **Promote to Production** |
| Bad API behaviour | Same as above: functions ship with the deployment |
| Bad database migration | Revert the SQL change in a new migration; do not edit the applied file |
| Bad env var | Fix the value in Vercel and redeploy (functions read env at runtime) |

Rollback is instant and does not touch data. Confirm with
`curl -s https://cowita.org/api/health | jq` and a test form submission.

## 5. Backups and restore testing

- Supabase takes daily automated backups automatically. Enable
  **Point-in-Time Recovery** if the plan supports it — submissions are the only
  copy of an enquiry once the confirmation email is deleted.
- Quarterly restore drill: restore the latest backup into a scratch project,
  run `select count(*) from submissions;`, compare with production, then delete
  the scratch project. Record the date and result in this file.
- CSV export is *not* a backup. It is a convenience for the team.

### Kaduna/ops checklist

- [ ] Confirm the Supabase project is on a plan with daily backups
- [ ] Book the first restore drill within a month of launch
- [ ] Store the drill result below

| Date | Restored by | Rows matched? | Notes |
| --- | --- | --- | --- |
| _pending_ | | | |

## 6. Monitoring and alerts

| What | Where | Alert threshold |
| --- | --- | --- |
| Uptime | `/api/health` on Better Stack | 2 failures in 3 minutes |
| Failed submissions | Vercel function logs, event `submission` with `status: "error"` | Any occurrence |
| Rate-limit rejections | Logs, event `submission_rejected` | Spike above 50/hour |
| Email failures | Logs, `email: ... failed` | Any occurrence |
| Error tracking | Sentry (set `SENTRY_DSN`) | New issue |

Wire alerts to the team inbox `info@cowita.org` and to a phone for critical
paths. Anyone on duty should be able to answer: "are form submissions being
saved right now?"

### Log search examples (Vercel → Logs)

- Failed saves: `"event":"submission" AND "status":"error"`
- Rejections: `"event":"submission_rejected"`
- Admin activity: `"event":"admin_update"` or `"admin_soft_delete"`
- Retention job: `"event":"retention_run"`

## 7. Routine tasks

| Task | Frequency | How |
| --- | --- | --- |
| Review new submissions | Daily | `/admin/` |
| Check for failed submissions | Daily | Log search above |
| Confirm backups ran | Weekly | Supabase dashboard |
| Retention job ran | Weekly | Look for `retention_run` in logs |
| Rotate the Turnstile secret | Yearly or after any leak | Cloudflare → Turnstile → rotate, update Vercel, redeploy |
| Accessibility suite | Before every release | `npm run a11y` (axe-core + focus visibility; CI runs it too) |
| Review admin access list | Quarterly | `select email, role from admin_users;` |
| Review safeguarding contacts on the legal pages | Quarterly | Richard |

## 8. Admin access

1. The person needs a Supabase user account (email invite in Supabase → Auth).
2. Add them to `admin_users` with a role:

```sql
insert into public.admin_users (user_id, email, role)
select id, email, 'admin' from auth.users where email = 'person@cowita.org';
```

3. On first sign-in the dashboard forces TOTP enrolment (authenticator app).
   An AAL1 session is refused by the API with `code: "mfa_required"`.
4. To remove access: delete the row from `admin_users` (keeps the auth user) or
   ban the user in Supabase Auth.

Roles: `viewer` (read + export), `admin` (also change status, notes, delete),
`owner` (also permanently delete and manage admins).

## 9. Incident response

### A form is not submitting

1. `curl -s https://cowita.org/api/health` — check `database` is `ok`.
2. Search logs for `"status":"error"` around the reported time.
3. If Supabase is down: submissions are lost while it is down. Post a holding
   message, and if it lasts more than 15 minutes ask Richard to publish the
   "contact us by email" notice.
4. If Turnstile is down: CAPTCHA failures are logged as `reason: "captcha"`.
5. After the fix, ask the affected person to resubmit — **never** invent data.

### A suspected data breach

1. Contain: rotate `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_PEPPER`,
   `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `CRON_SECRET` in Vercel; redeploy.
2. Preserve: export the affected tables and copy the function logs.
3. Assess: which personal data, how many people, is any of it children's data?
4. Notify: Richard and Solace immediately. UK ICO within 72 hours if the risk to
   individuals is real; tell affected families without undue delay.
5. Record: what happened, when, actions, who decided. Keep it factual.

### Wrong or leaked content

Content corrections are normal editorial work — fix on a branch, PR, merge.
Anything involving a child's image or name is a safeguarding matter: pull the
page first (Vercel → promote the previous deployment), then talk to Richard.

## 10. Accessibility checks

`npm run a11y` starts the dev server, proves the axe runner detects real
breakage, then audits all pages and every focusable control:

```bash
npm run a11y            # whole suite
npm run a11y:selfcheck  # just "does the runner detect a broken page?"
node tools/a11y-check.mjs --best-practices --json a11y-findings.json
```

When axe reports a contrast failure, fix it from the measurement rather than by
hand — the findings file carries the background axe composited, and the helper
picks the passing token for that surface:

```bash
node tools/a11y-contrast-fix.mjs a11y-findings.json   # rewrites owning rules, appends overrides
```

Decorative watermark numerals are drawn with CSS `content` (`data-number` +
`::before`) so they are not evaluated as low-contrast text.

If a real violation appears, treat it like any defect: fix on a branch, keep the
suite green, and do not silence the rule to make CI pass.

## 11. Retention job

`POST /api/admin/retention` runs daily at 03:00 (Vercel Cron) and deletes:

- submissions older than `RETENTION_DAYS` (default 730)
- rate-limit windows older than 24 hours

It is protected by `CRON_SECRET`. To run it manually:

```bash
curl -X POST https://cowita.org/api/admin/retention \
  -H "Authorization: Bearer $CRON_SECRET"
```

The retention periods themselves are Richard's decision — see the Data
Retention Policy and `docs/AUDIT-STATUS.md`.

## 12. Handover checklist

- [ ] Vercel project ownership transferred to the CoWiTa account
- [ ] Supabase project ownership transferred
- [ ] Cloudflare, Resend, Sentry and monitoring accounts documented
- [ ] `docs/AUDIT-STATUS.md` open items reviewed with Richard
- [ ] Restore drill completed and recorded above
- [ ] Two people can access the admin dashboard with MFA
