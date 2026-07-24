import { getSql } from "@/db";

/**
 * Audit trail write. Runs on the plain (unscoped) connection because
 * `audit_logs` has RLS disabled - it's platform/reference data, not a
 * tenant-owned row set (see 0001_fix_rls.sql) - so a single write works
 * the same regardless of which tenant scope the calling action ran under.
 */
export async function audit(
  tenantId: string,
  actorId: string,
  entity: string,
  entityId: string,
  action: string,
  detail?: unknown
) {
  const sql = getSql();
  await sql`insert into audit_logs (tenant_id, actor_id, entity, entity_id, action, detail)
    values (${tenantId}, ${actorId}, ${entity}, ${entityId}, ${action}, ${JSON.stringify(detail ?? {})})`;
}
