-- AI usage cap: 30 requests per rolling 30-minute window, per user, shared
-- across every AI endpoint (Ask HIQM + WhatsApp follow-up drafts) - one
-- shared budget protecting the underlying Groq API key.
--
-- This is persisted in Postgres rather than an in-memory counter on
-- purpose: the app runs as Vercel serverless functions, where an in-memory
-- Map resets on every cold start and isn't shared across concurrent
-- instances - it would look like a rate limit without actually being one.
--
-- No cleanup job yet: rows older than the window are dead weight but
-- harmless at this scale (a handful of rows per active user per half
-- hour). A scheduled `delete from ai_requests where created_at < now() -
-- interval '1 day'` is the natural upgrade if this ever needs to run long
-- enough for that to matter.

create table if not exists ai_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  endpoint text not null, -- 'ask' | 'followup'
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_user_window_idx on ai_requests(user_id, created_at);

alter table ai_requests enable row level security;
alter table ai_requests force row level security;
drop policy if exists tenant_isolation on ai_requests;
create policy tenant_isolation on ai_requests
  using (
    current_setting('app.scope', true) = 'global'
    or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  with check (
    current_setting('app.scope', true) = 'global'
    or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

grant select, insert, update, delete on ai_requests to hiqm_app;
