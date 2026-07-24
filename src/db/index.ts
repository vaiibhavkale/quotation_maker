import postgres from "postgres";
import * as schema from "./schema";

/* Lazy singleton so `next build` succeeds without a DATABASE_URL. */
let _client: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!_client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _client = postgres(url, { max: 5, prepare: false, ssl: "require" }); // prepare:false → pgbouncer/transaction pooler safe; Supabase requires TLS
  }
  return _client;
}

export type TenantCtx = {
  tenantId: string;
  scope: "tenant" | "global";
};

/**
 * Runs `fn` inside a transaction with RLS session context applied
 * (`app.tenant_id` / `app.scope`). This is the ONLY correct way to touch
 * tenant-scoped tables (customers, quotations, quote_items, quote_revisions,
 * quote_events, quote_sequences) — the app connects as a least-privilege
 * Postgres role (no BYPASSRLS), so without this context those tables are
 * default-deny and every query silently returns zero rows.
 *
 * `raw` is postgres.js's own tagged-template function bound to this
 * transaction — use it for every query inside `fn`. (We deliberately don't
 * wrap it in Drizzle's query builder here: drizzle-orm's postgres-js driver
 * expects the full client object at construction time, not a transaction
 * handle from `sql.begin()`, and throws if you hand it one.)
 */
export async function withTenant<T>(
  ctx: TenantCtx,
  fn: (scoped: { raw: ReturnType<typeof postgres> }) => Promise<T>
): Promise<T> {
  const sql = getSql();
  return (await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${ctx.tenantId}, true)`;
    await tx`select set_config('app.scope', ${ctx.scope}, true)`;
    return await fn({ raw: tx as unknown as ReturnType<typeof postgres> });
  })) as T;
}

export { schema };
