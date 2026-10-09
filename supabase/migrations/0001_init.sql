-- ============================================================================
--  CoWiTa form platform — initial schema
-- ============================================================================
--  Run this in the Supabase SQL editor (or `supabase db push`) before the API
--  is deployed. Safe to re-run: every object is created IF NOT EXISTS.
--
--  Design notes
--    * submissions.payload holds the validated, sanitised form answers as
--      JSONB. Common columns (email, full_name) are promoted for search.
--    * Row Level Security is ON everywhere. The service role (used by the
--      Vercel functions) bypasses RLS; the anon/public key sees nothing.
--    * rate_limits gives us per-IP / per-email / per-form throttling without
--      another dependency.
-- ============================================================================

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
--  submissions
-- --------------------------------------------------------------------------
create table if not exists public.submissions (
  id                uuid primary key default gen_random_uuid(),
  form_type         text not null check (
                      form_type in (
                        'contact', 'talent', 'mentor', 'partner',
                        'collaborate', 'learn', 'support'
                      )
                    ),
  status            text not null default 'new' check (
                      status in ('new', 'reviewed', 'contacted', 'closed')
                    ),
  full_name         text,
  email             text,
  phone             text,
  age               integer check (age is null or (age >= 0 and age <= 120)),
  payload           jsonb not null default '{}'::jsonb,
  consent           boolean not null default false,
  consent_version   text,
  ip_hash           text,
  user_agent        text,
  referer           text,
  internal_notes    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists submissions_form_type_idx on public.submissions (form_type);
create index if not exists submissions_status_idx    on public.submissions (status);
create index if not exists submissions_created_idx   on public.submissions (created_at desc);
create index if not exists submissions_email_idx     on public.submissions (lower(email));
create index if not exists submissions_deleted_idx   on public.submissions (deleted_at);

comment on column public.submissions.ip_hash is
  'SHA-256 of IP + server pepper. Never the raw IP address.';
comment on column public.submissions.deleted_at is
  'Soft delete marker. Hard deletion happens through the retention job.';

-- --------------------------------------------------------------------------
--  submission_events  (status changes, notes, exports — the admin audit log)
-- --------------------------------------------------------------------------
create table if not exists public.submission_events (
  id             bigserial primary key,
  submission_id  uuid references public.submissions (id) on delete cascade,
  actor_id       uuid,
  actor_email    text,
  action         text not null,
  from_status    text,
  to_status      text,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists submission_events_submission_idx
  on public.submission_events (submission_id, created_at desc);

-- --------------------------------------------------------------------------
--  admin_users  (RBAC)
-- --------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       text not null default 'viewer' check (role in ('owner', 'admin', 'viewer')),
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
--  rate_limits  (fixed-window counters keyed by a hashed bucket)
-- --------------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket, window_start)
);

create or replace function public.bump_rate_limit(
  p_bucket text,
  p_window_start timestamptz
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, p_window_start, 1)
  on conflict (bucket, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

-- Old windows are disposable; the retention job can delete them.

-- --------------------------------------------------------------------------
--  updated_at maintenance
-- --------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists submissions_touch_updated_at on public.submissions;
create trigger submissions_touch_updated_at
  before update on public.submissions
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------------
--  Row Level Security
-- --------------------------------------------------------------------------
--  The public/anon key must never read submissions. All access is through the
--  Vercel API using the service role, or through an authenticated admin whose
--  user_id appears in admin_users.
-- --------------------------------------------------------------------------

alter table public.submissions       enable row level security;
alter table public.submission_events enable row level security;
alter table public.admin_users       enable row level security;
alter table public.rate_limits       enable row level security;

-- Admins (owner/admin) may read submissions; viewers may read too.
drop policy if exists "admins can read submissions" on public.submissions;
create policy "admins can read submissions"
  on public.submissions for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = auth.uid()
    )
    and deleted_at is null
  );

-- Only owner/admin may update, and only through the API.
drop policy if exists "admins can update submissions" on public.submissions;
create policy "admins can update submissions"
  on public.submissions for update
  to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = auth.uid() and a.role in ('owner', 'admin')
    )
  );

-- Admins may read the event log.
drop policy if exists "admins can read events" on public.submission_events;
create policy "admins can read events"
  on public.submission_events for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = auth.uid()
    )
  );

-- Admins can see who the other admins are.
drop policy if exists "admins can read admin list" on public.admin_users;
create policy "admins can read admin list"
  on public.admin_users for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = auth.uid()
    )
  );

-- No public policies: anon sees nothing. rate_limits is service-role only.

-- --------------------------------------------------------------------------
--  Retention helpers (called by the scheduled cleanup endpoint)
-- --------------------------------------------------------------------------
create or replace function public.purge_expired_submissions(
  p_retention_days integer default 730
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with doomed as (
    delete from public.submissions
    where created_at < now() - make_interval(days => p_retention_days)
    returning 1
  )
  select count(*) into removed from doomed;

  return removed;
end;
$$;
