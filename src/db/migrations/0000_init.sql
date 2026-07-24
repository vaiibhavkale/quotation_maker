-- HIQM initial schema + Row-Level Security
-- Money: integer paise. Percentages: integer ×100 (1800 = 18.00%).

create extension if not exists pgcrypto;

/* - Geography ---------------------─ */
create table if not exists geo_zones (
  id text primary key,
  name text not null
);

create table if not exists geo_states (
  id text primary key,
  name text not null,
  zone_id text not null references geo_zones(id),
  gst_state_code text not null
);

create table if not exists geo_cities (
  id text primary key,
  name text not null,
  state_id text not null references geo_states(id)
);

/* - Tenancy ----------------------─ */
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  type text not null check (type in ('heseos','distributor','dealer','si','direct')),
  parent_tenant_id uuid,
  zone_id text references geo_zones(id),
  state_id text references geo_states(id),
  city_id text references geo_cities(id),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists branding_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants(id),
  display_name text not null,
  logo_url text,
  primary_color text not null default '#E8821E',
  gstin text,
  address text,
  phone text,
  email text,
  bank_name text,
  bank_account text,
  bank_ifsc text,
  upi_id text,
  signature_name text,
  terms text,
  footer_note text,
  powered_by_heseos boolean not null default true
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  tenant_id uuid not null references tenants(id),
  role text not null check (role in ('super_admin','ceo','zone_manager','state_manager','partner_admin','partner_sales','viewer')),
  geo_scope jsonb
);
create unique index if not exists memberships_user_tenant on memberships(user_id, tenant_id);

/* - CRM ------------------------─ */
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  contact_name text,
  phone text,
  email text,
  gstin text,
  billing_address text,
  state_id text references geo_states(id),
  city_id text references geo_cities(id),
  created_at timestamptz not null default now()
);
create index if not exists customers_tenant_idx on customers(tenant_id);

/* - Quotations --------------------- */
create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null references customers(id),
  created_by_id uuid not null references users(id),
  number text not null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','shared','viewed','negotiation','approved','converted','lost')),
  current_revision integer not null default 1,
  place_of_supply_state_id text references geo_states(id),
  subtotal bigint not null default 0,
  discount_total bigint not null default 0,
  cgst bigint not null default 0,
  sgst bigint not null default 0,
  igst bigint not null default 0,
  grand_total bigint not null default 0,
  valid_until timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quotations_tenant_idx on quotations(tenant_id);
create index if not exists quotations_status_idx on quotations(status);
create unique index if not exists quotations_number_tenant on quotations(tenant_id, number);

create table if not exists quote_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  quotation_id uuid not null references quotations(id) on delete cascade,
  position integer not null default 0,
  description text not null,
  hsn_code text,
  unit text not null default 'nos',
  quantity integer not null default 1,
  rate bigint not null default 0,
  discount_pct integer not null default 0,
  gst_rate_pct integer not null default 1800,
  line_total bigint not null default 0
);
create index if not exists quote_items_quote_idx on quote_items(quotation_id);

create table if not exists quote_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  quotation_id uuid not null references quotations(id) on delete cascade,
  revision_no integer not null,
  snapshot jsonb not null,
  reason text,
  created_by_id uuid references users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists quote_revisions_unique on quote_revisions(quotation_id, revision_no);

create table if not exists quote_shares (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  quotation_id uuid not null references quotations(id) on delete cascade,
  token text not null unique,
  channel text not null default 'link',
  revoked boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists quote_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  quotation_id uuid not null references quotations(id) on delete cascade,
  type text not null,
  actor_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quote_events_quote_idx on quote_events(quotation_id);
create index if not exists quote_events_tenant_type_idx on quote_events(tenant_id, type);

create table if not exists quote_sequences (
  tenant_id uuid not null references tenants(id),
  fy text not null,
  last_value integer not null default 0
);
create unique index if not exists quote_sequences_pk on quote_sequences(tenant_id, fy);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  actor_id uuid,
  entity text not null,
  entity_id text,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_tenant_idx on audit_logs(tenant_id);

/* - Row-Level Security ------------------
   Context is set per-transaction by the app:
     app.tenant_id  – tenant of the acting user
     app.scope      – 'tenant' (default) or 'global' (HESEOS leadership/service)
   FORCE ensures even the table owner obeys policies.            */

do $$
declare t text;
begin
  foreach t in array array[
    'branding_profiles','customers','quotations','quote_items',
    'quote_revisions','quote_shares','quote_events','quote_sequences'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($p$
      create policy tenant_isolation on %I
      using (
        current_setting('app.scope', true) = 'global'
        or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
      )
      with check (
        current_setting('app.scope', true) = 'global'
        or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
      )
    $p$, t);
  end loop;
end $$;
