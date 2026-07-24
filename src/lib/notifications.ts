import postgres from "postgres";
import { withTenant, type TenantCtx } from "@/db";

type RawSql = ReturnType<typeof postgres>;

export type NotifyParams = {
  tenantId: string;
  userId?: string | null; // null = broadcast to every admin/leadership in scope
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Set this to make the notification idempotent — same key never fires twice. */
  dedupeKey?: string | null;
};

/**
 * Low-level insert. Takes a raw `sql` handle rather than a TenantCtx so it
 * composes inside an *already open* withTenant block (e.g. called from
 * createQuote/transitionQuote in the same transaction that just changed
 * the row) as well as from the standalone sync job below. Always pass the
 * row's own tenant_id, not the caller's — under global scope a single
 * sync pass touches many tenants at once.
 */
export async function notify(sql: RawSql, p: NotifyParams) {
  if (p.dedupeKey) {
    await sql`
      insert into notifications (tenant_id, user_id, type, title, body, link, dedupe_key)
      values (${p.tenantId}, ${p.userId ?? null}, ${p.type}, ${p.title}, ${p.body ?? null}, ${p.link ?? null}, ${p.dedupeKey})
      on conflict (tenant_id, dedupe_key) do nothing
    `;
  } else {
    await sql`
      insert into notifications (tenant_id, user_id, type, title, body, link)
      values (${p.tenantId}, ${p.userId ?? null}, ${p.type}, ${p.title}, ${p.body ?? null}, ${p.link ?? null})
    `;
  }
}

/** One-off notify from outside an existing transaction (e.g. a route handler). */
export async function notifyStandalone(ctx: TenantCtx, p: NotifyParams) {
  await withTenant(ctx, async ({ raw: sql }) => notify(sql, p));
}

export async function listNotifications(
  ctx: TenantCtx,
  userId: string,
  opts: { onlyUnread?: boolean; limit?: number } = {}
) {
  const limit = opts.limit ?? 20;
  return withTenant(ctx, async ({ raw: sql }) => {
    if (opts.onlyUnread) {
      return sql`
        select * from notifications
        where (user_id = ${userId} or user_id is null) and read_at is null
        order by created_at desc limit ${limit}`;
    }
    return sql`
      select * from notifications
      where (user_id = ${userId} or user_id is null)
      order by created_at desc limit ${limit}`;
  });
}

export async function unreadCount(ctx: TenantCtx, userId: string): Promise<number> {
  return withTenant(ctx, async ({ raw: sql }) => {
    const [row] = await sql`
      select count(*)::int as n from notifications
      where (user_id = ${userId} or user_id is null) and read_at is null`;
    return Number(row?.n ?? 0);
  });
}

/**
 * Broadcast notifications (user_id null) share one read state across every
 * recipient at this demo's scale (a handful of admins per tenant) — marking
 * one admin's view read clears it for the others too. The upgrade path is a
 * `notification_reads(notification_id, user_id)` join table if/when that
 * matters; noted here rather than built now, same call as everywhere else
 * in this codebase (rules now, clear seam to upgrade later).
 */
export async function markRead(ctx: TenantCtx, id: string) {
  await withTenant(ctx, async ({ raw: sql }) => {
    await sql`update notifications set read_at = now() where id = ${id} and read_at is null`;
  });
}

export async function markAllRead(ctx: TenantCtx, userId: string) {
  await withTenant(ctx, async ({ raw: sql }) => {
    await sql`
      update notifications set read_at = now()
      where (user_id = ${userId} or user_id is null) and read_at is null`;
  });
}

/**
 * The rules engine behind every notification type. Safe to call on every
 * dashboard/bell load (dedupe keys make it a no-op for anything already
 * raised) — there's no cron in this environment, so freshness is "as of
 * the last time someone with visibility loaded a page," which is the
 * same trade-off the share-view-flip polling already makes elsewhere.
 * Under a 'global' scope ctx this reaches every tenant in one pass (RLS
 * allows it); each insert still carries the row's own tenant_id.
 */
export async function syncAgeingNotifications(ctx: TenantCtx): Promise<{ created: number }> {
  return withTenant(ctx, async ({ raw: sql }) => {
    let created = 0;

    const unviewed = await sql`
      select id, tenant_id, created_by_id, number
      from quotations
      where status = 'shared' and updated_at < now() - interval '48 hours'`;
    for (const q of unviewed) {
      await notify(sql, {
        tenantId: q.tenant_id, userId: q.created_by_id,
        type: "ageing_unviewed", title: `${q.number} hasn't been opened yet`,
        body: "Shared over 48 hours ago — consider a nudge.",
        link: `/quotes/${q.id}`, dedupeKey: `unviewed:${q.id}`,
      });
      created++;
    }

    const silent = await sql`
      select q.id, q.tenant_id, q.created_by_id, q.number,
             extract(epoch from (now() - coalesce(le.last_at, q.created_at))) / 86400 as silent_days
      from quotations q
      left join lateral (
        select max(created_at) as last_at from quote_events where quotation_id = q.id
      ) le on true
      where q.status in ('shared','viewed','negotiation')
        and coalesce(le.last_at, q.created_at) < now() - interval '7 days'`;
    for (const q of silent) {
      const days = Number(q.silent_days);
      const bucket = Math.floor(days / 3); // re-notify every 3 days, not just once ever
      await notify(sql, {
        tenantId: q.tenant_id, userId: q.created_by_id,
        type: "ageing_silent", title: `${q.number} has gone quiet`,
        body: `No activity for ${Math.floor(days)} days.`,
        link: `/quotes/${q.id}`, dedupeKey: `silent:${q.id}:${bucket}`,
      });
      created++;
    }

    const pendingApproval = await sql`
      select id, tenant_id, number from quotations
      where needs_approval = true and approved_by_id is null and status not in ('lost','converted')`;
    for (const q of pendingApproval) {
      await notify(sql, {
        tenantId: q.tenant_id, userId: null,
        type: "approval_needed", title: `${q.number} needs deal-desk approval`,
        body: "Discount or deal size exceeds the self-serve limit.",
        link: `/quotes/${q.id}`, dedupeKey: `approval:${q.id}`,
      });
      created++;
    }

    const visitsToday = await sql`
      select id, tenant_id, engineer_id, lead_id from site_visits
      where status = 'scheduled' and scheduled_at::date = current_date`;
    for (const v of visitsToday) {
      await notify(sql, {
        tenantId: v.tenant_id, userId: v.engineer_id,
        type: "site_visit_due", title: "Site visit scheduled today",
        link: `/leads/${v.lead_id}`,
        dedupeKey: `visit:${v.id}:${new Date().toISOString().slice(0, 10)}`,
      });
      created++;
    }

    return { created };
  });
}
