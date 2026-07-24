import { getSql } from "@/db";
import type { SessionUser } from "@/lib/auth";

/**
 * Leadership analytics. Runs under 'global' scope (RLS policy allows it for
 * leadership roles only — enforced by the session, set in service context).
 * Partner analytics reuse the same queries filtered by tenant.
 */

export type GeoFilter = { zoneId?: string; stateId?: string; cityId?: string; tenantId?: string };

function scopeFilter(user: SessionUser): GeoFilter {
  if (user.scope !== "global") return { tenantId: user.tenantId };
  const g = user.geoScope ?? {};
  return { zoneId: g.zoneId, stateId: g.stateId, cityId: g.cityId };
}

export async function overview(user: SessionUser, drill: GeoFilter = {}) {
  const sql = getSql();
  const f = { ...scopeFilter(user), ...drill };

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
}

/** One drilldown query, grouped by the next level down. */
export async function drilldown(user: SessionUser, drill: GeoFilter = {}) {
  const sql = getSql();
  const f = { ...scopeFilter(user), ...drill };

  // Decide grouping level: zone → state → city → tenant
  const level = f.cityId ? "tenant" : f.stateId ? "city" : f.zoneId ? "state" : "zone";
  const groupCol =
    level === "zone" ? sql`t.zone_id` :
    level === "state" ? sql`t.state_id` :
    level === "city" ? sql`t.city_id` : sql`t.id::text`;
  const nameCol =
    level === "zone" ? sql`z.name` :
    level === "state" ? sql`s.name` :
    level === "city" ? sql`c.name` : sql`t.name`;

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
    where true
      ${f.tenantId ? sql`and q.tenant_id = ${f.tenantId}` : sql``}
      ${f.zoneId ? sql`and t.zone_id = ${f.zoneId}` : sql``}
      ${f.stateId ? sql`and t.state_id = ${f.stateId}` : sql``}
      ${f.cityId ? sql`and t.city_id = ${f.cityId}` : sql``}
    group by 1
    order by value desc`;
  return { level, rows };
}

export async function statusFunnel(user: SessionUser, drill: GeoFilter = {}) {
  const sql = getSql();
  const f = { ...scopeFilter(user), ...drill };
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
}

export async function channelRanking(user: SessionUser) {
  const sql = getSql();
  if (user.scope !== "global") return [];
  return await sql`
    select t.type, count(*)::int as quotes,
      coalesce(sum(q.grand_total), 0)::bigint as value,
      count(*) filter (where q.status = 'converted')::int as won
    from quotations q join tenants t on t.id = q.tenant_id
    group by t.type order by value desc`;
}

/** Ageing buckets for open quotes. */
export async function ageing(user: SessionUser) {
  const sql = getSql();
  const f = scopeFilter(user);
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
}
