import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/* Lazy singleton so `next build` succeeds without a DATABASE_URL. */
let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getSql() {
  if (!_client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _client = postgres(url, { max: 5, prepare: false }); // prepare:false → pgbouncer/transaction pooler safe
  }
  return _client;
}

export function getDb() {
  if (!_db) _db = drizzle(getSql(), { schema });
  return _db;
}

export type TenantCtx = {
  tenantId: string;
  scope: "tenant" | "global";
};

/**
 * Runs `fn` inside a transaction with RLS context applied.
 * Every data access in the app goes through this — RLS is the guarantee,
 * app-level filtering is just UX.
 */
export async function withTenant<T>(
  ctx: TenantCtx,
  fn: (tx: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>
): Promise<T> {
  const sql = getSql();
  return await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${ctx.tenantId}, true)`;
    await tx`select set_config('app.scope', ${ctx.scope}, true)`;
    const txDb = drizzle(tx as unknown as ReturnType<typeof postgres>, { schema });
    return await fn(txDb);
  }) as T;
}

export { schema };
