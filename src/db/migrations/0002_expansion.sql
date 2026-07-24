-- Expansion: full PRD lifecycle (Lead -> Site Visit -> Project -> Order),
-- Notifications, and the deal-desk approval gate on quotations.
-- Same tenancy pattern throughout: tenant_id + FORCE RLS + single
-- tenant_isolation policy, matching customers/quotations/etc.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  phone text,
  email text,
  source text not null default 'referral',
  notes text,
  status text not null default 'new'
    check (status in ('new','site_visit_scheduled','site_visit_done','converted','dropped')),
  drop_reason text,
  assigned_to_id uuid references users(id),
  customer_id uuid references customers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_tenant_idx on leads(tenant_id);

create table if not exists site_visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id) on delete cascade,
  scheduled_at timestamptz,
  completed_at timestamptz,
  engineer_id uuid references users(id),
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null references customers(id),
  lead_id uuid references leads(id),
  name text not null,
  address text,
  status text not null default 'active' check (status in ('active','on_hold','completed','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists projects_tenant_idx on projects(tenant_id);

alter table quotations add column if not exists project_id uuid references projects(id);
alter table quotations add column if not exists needs_approval boolean not null default false;
alter table quotations add column if not exists approved_by_id uuid references users(id);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  quotation_id uuid not null unique references quotations(id),
  order_number text not null,
  stage text not null default 'production'
    check (stage in ('production','dispatch','installation','completed')),
  advance_received bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_tenant_idx on orders(tenant_id);

create table if not exists order_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  order_id uuid not null references orders(id) on delete cascade,
  type text not null,
  actor_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid,
  type text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_tenant_idx on notifications(tenant_id);
create unique index if not exists notifications_dedupe on notifications(tenant_id, dedupe_key);

do $$
declare t text;
begin
  foreach t in array array[
    'leads','site_visits','projects','orders','order_events','notifications'
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

-- Defensive: `hiqm_app` should already inherit these via the default-privilege
-- rule set in 0001 (same role, `postgres`, created both), but grant explicitly
-- in case migrations are ever replayed out of order or against a role that
-- didn't exist yet when 0001 ran.
grant select, insert, update, delete on leads, site_visits, projects, orders, order_events, notifications to hiqm_app;
