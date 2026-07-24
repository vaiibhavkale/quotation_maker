import { withTenant } from "@/db";
import type { SessionUser } from "@/lib/auth";

/**
 * Leadership + partner analytics. Every query here touches `quotations`,
 * which is RLS-protected with zero exceptions — so every function runs
 * inside `withTenant` using the viewer's own tenantId/scope. For 'global'
 * scope (CEO, zone/state managers) the RLS policy grants full visibility;
 * the geo/tenant filters below then narrow that down to whatever the
 * viewer is actually allowed to see and whatever they're drilling into.
 */

export type GeoFilter = { zoneId?: string; stateId?: string; cityId?: string; tenantId?: string };

function scopeFilter(user: SessionUser): GeoFilter {
  if (user.scope !== "global") return { tenantId: user.tenantId };
  const g = user.geoScope ?? {};
  return { zoneId: g.zoneId, stateId: g.stateId, cityId: g.cityId };
}

export async function overview(user: SessionUser, drill: GeoFilter = {}) {
  const f = { ...scopeFilter(user), ...drill };
  return withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    const rows = await sql`
      select
        count(*)::int                                                   as total_quotes,
        coalesce(sum(q.grand_total), 0)::bigint                         as total_value,
        coalesce(sum(q.grand_total) filter (where q.status = 'converted'), 0)::bigint as won_value,
        count(*) filter (where q.status = 'converted')::int             as won_count,
        count(*) filter (where q.status in ('shared','viewed','negotiation'))::int as open_count,
        coalesce(sum(q.grand_total) filter (where q.status in ('shared','viewed','negotiation')), 0)::bigint as pipeline_value,
        count(*) filter (where q.status = 'lost')::int                  as lost_count,
        coalesce(avg(q.grand_total), 0)::bigint                         as avg_ticket
      from quotations q
      join tenants t on t.id = q.tenant_id
      where true
        ${f.tenantId ? sql`and q.tenant_id = ${f.tenantId}` : sql``}
        ${f.zoneId ? sql`and t.zone_id = ${f.zoneId}` : sql``}
        ${f.stateId ? sql`and t.state_id = ${f.stateId}` : sql``}
        ${f.cityId ? sql`and t.city_id = ${f.cityId}` : sql``}`;
    return rows[0];
  });
}

/**
 * One drilldown query, grouped by the next level down. Once a specific
 * tenant is in scope — either because the viewer IS tenant-scoped, or a
 * leadership viewer has drilled all the way to a single org — the next
 * level down is the sales rep, not geography: India → Zone → State →
 * City → Organization → Employee.
 */
export async function drilldown(user: SessionUser, drill: GeoFilter = {}) {
  const f = { ...scopeFilter(user), ...drill };
  const level = f.tenantId ? "employee" : f.cityId ? "tenant" : f.stateId ? "city" : f.zoneId ? "state" : "zone";

  return withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    const groupCol =
      level === "zone" ? sql`t.zone_id` :
      level === "state" ? sql`t.state_id` :
      level === "city" ? sql`t.city_id` :
      level === "tenant" ? sql`t.id::text` : sql`q.created_by_id::text`;
    const nameCol =
      level === "zone" ? sql`z.name` :
      level === "state" ? sql`s.name` :
      level === "city" ? sql`c.name` :
      level === "tenant" ? sql`t.name` : sql`coalesce(u.name, 'Unknown')`;

    const rows = await sql`
      select
        ${groupCol} as key,
        max(${nameCol}) as name,
        count(*)::int as quotes,
        coalesce(sum(q.grand_total), 0)::bigint as value,
        count(*) filter (where q.status = 'converted')::int as won,
        coalesce(sum(q.grand_total) filter (where q.status in ('shared','viewed','negotiation')), 0)::bigint as pipeline
      from quotations q
      join tenants t on t.id = q.tenant_id
      left join geo_zones z on z.id = t.zone_id
      left join geo_states s on s.id = t.state_id
      left join geo_cities c on c.id = t.city_id
      left join users u on u.id = q.created_by_id
      where true
        ${f.tenantId ? sql`and q.tenant_id = ${f.tenantId}` : sql``}
        ${f.zoneId ? sql`and t.zone_id = ${f.zoneId}` : sql``}
        ${f.stateId ? sql`and t.state_id = ${f.stateId}` : sql``}
        ${f.cityId ? sql`and t.city_id = ${f.cityId}` : sql``}
      group by 1
      order by value desc`;
    return { level, rows };
  });
}

/** Cross-tenant rep leaderboard for leadership — no drilling required. */
export async function topPerformers(user: SessionUser, limit = 10) {
  if (user.scope !== "global") return [];
  return withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    return await sql`
      select u.id, coalesce(u.name, 'Unknown') as name, t.name as tenant_name,
        count(*)::int as quotes,
        coalesce(sum(q.grand_total) filter (where q.status = 'converted'), 0)::bigint as won_value,
        count(*) filter (where q.status = 'converted')::int as won_count
      from quotations q
      left join users u on u.id = q.created_by_id
      join tenants t on t.id = q.tenant_id
      group by u.id, u.name, t.name
      order by won_value desc
      limit ${limit}`;
  });
}

export async function statusFunnel(user: SessionUser, drill: GeoFilter = {}) {
  const f = { ...scopeFilter(user), ...drill };
  return withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    return await sql`
      select q.status, count(*)::int as n, coalesce(sum(q.grand_total), 0)::bigint as value
      from quotations q
      join tenants t on t.id = q.tenant_id
      where true
        ${f.tenantId ? sql`and q.tenant_id = ${f.tenantId}` : sql``}
        ${f.zoneId ? sql`and t.zone_id = ${f.zoneId}` : sql``}
        ${f.stateId ? sql`and t.state_id = ${f.stateId}` : sql``}
        ${f.cityId ? sql`and t.city_id = ${f.cityId}` : sql``}
      group by q.status`;
  });
}

export async function channelRanking(user: SessionUser) {
  if (user.scope !== "global") return [];
  return withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    return await sql`
      select t.type, count(*)::int as quotes,
        coalesce(sum(q.grand_total), 0)::bigint as value,
        count(*) filter (where q.status = 'converted')::int as won
      from quotations q join tenants t on t.id = q.tenant_id
      group by t.type order by value desc`;
  });
}

/** Ageing buckets for open quotes. */
export async function ageing(user: SessionUser) {
  const f = scopeFilter(user);
  return withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    return await sql`
      select
        case
          when now() - q.updated_at < interval '3 days' then '0-3d'
          when now() - q.updated_at < interval '7 days' then '3-7d'
          when now() - q.updated_at < interval '15 days' then '7-15d'
          else '15d+'
        end as bucket,
        count(*)::int as n
      from quotations q
      join tenants t on t.id = q.tenant_id
      where q.status in ('shared','viewed','negotiation')
        ${f.tenantId ? sql`and q.tenant_id = ${f.tenantId}` : sql``}
        ${f.zoneId ? sql`and t.zone_id = ${f.zoneId}` : sql``}
      group by 1 order by 1`;
  });
}
