-- Corrects RLS now that the app connects as a real restricted role (hiqm_app)
-- instead of the Supabase `postgres` superuser (which has BYPASSRLS and was
-- silently making every policy a no-op).
--
-- Supabase enables RLS by default on every new table in `public`. With zero
-- policies, that means default-DENY for any non-owner/non-bypassrls role -
-- which is correct for tenant data, but breaks tables that were never meant
-- to be tenant-scoped (login needs to find a user by email before any tenant
-- context exists; geo tables are shared reference data).
--
-- Final shape:
--   - geo_*, tenants, users, memberships, audit_logs: RLS off (not tenant rows;
--     access is gated by what the app queries, not by row ownership).
--   - branding_profiles, quote_shares: RLS on, but SELECT is public (branding
--     must render on customer-facing PDF/quote pages; a share is only
--     findable by its unguessable token). Writes stay tenant-scoped.
--   - customers, quotations, quote_items, quote_revisions, quote_events,
--     quote_sequences: unchanged - strict single-tenant isolation.

alter table geo_zones disable row level security;
alter table geo_states disable row level security;
alter table geo_cities disable row level security;
alter table tenants disable row level security;
alter table users disable row level security;
alter table memberships disable row level security;
alter table audit_logs disable row level security;

drop policy if exists tenant_isolation on branding_profiles;
drop policy if exists branding_public_read on branding_profiles;
drop policy if exists branding_tenant_write on branding_profiles;
drop policy if exists branding_tenant_update on branding_profiles;
drop policy if exists branding_tenant_delete on branding_profiles;
create policy branding_public_read on branding_profiles
  for select using (true);
create policy branding_tenant_write on branding_profiles
  for insert with check (
    current_setting('app.scope', true) = 'global'
    or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );
create policy branding_tenant_update on branding_profiles
  for update
  using (
    current_setting('app.scope', true) = 'global'
    or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  with check (
    current_setting('app.scope', true) = 'global'
    or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );
create policy branding_tenant_delete on branding_profiles
  for delete using (
    current_setting('app.scope', true) = 'global'
    or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

drop policy if exists tenant_isolation on quote_shares;
drop policy if exists shares_public_read on quote_shares;
drop policy if exists shares_tenant_write on quote_shares;
drop policy if exists shares_tenant_update on quote_shares;
create policy shares_public_read on quote_shares
  for select using (true);
create policy shares_tenant_write on quote_shares
  for insert with check (
    current_setting('app.scope', true) = 'global'
    or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );
create policy shares_tenant_update on quote_shares
  for update
  using (
    current_setting('app.scope', true) = 'global'
    or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  with check (
    current_setting('app.scope', true) = 'global'
    or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

-- Least-privilege application role. The Supabase `postgres` role has
-- BYPASSRLS and must never be used as the app's runtime connection -
-- every RLS policy above would silently become a no-op under it.
--
-- IMPORTANT: on a fresh project this creates the role with a placeholder
-- password. Immediately set a real one and put it in DATABASE_URL:
--   ALTER ROLE hiqm_app WITH PASSWORD '<generate a strong one>';
-- (On this project the password was already set by hand before this
-- migration ran, so the block below is a no-op here.)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hiqm_app') then
    create role hiqm_app login password 'CHANGE_ME' noreplication;
  end if;
end $$;

grant usage on schema public to hiqm_app;
grant select, insert, update, delete on all tables in schema public to hiqm_app;
grant usage, select on all sequences in schema public to hiqm_app;
alter default privileges in schema public grant select, insert, update, delete on tables to hiqm_app;
