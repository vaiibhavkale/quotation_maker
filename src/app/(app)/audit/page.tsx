import { requireUser } from "@/lib/auth";
import { getSql } from "@/db";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditPage(props: { searchParams: Promise<{ entity?: string }> }) {
  const user = await requireUser();
  const { entity } = await props.searchParams;
  const sql = getSql();

  // audit_logs has RLS off (platform data) - tenant scoping here is manual:
  // global-scope viewers (CEO/zone/state managers) see the full trail,
  // everyone else only ever sees their own tenant's rows.
  const rows = user.scope === "global"
    ? await sql`
        select a.*, u.name as actor_name, t.name as tenant_name from audit_logs a
        left join users u on u.id = a.actor_id
        left join tenants t on t.id = a.tenant_id
        where true ${entity ? sql`and a.entity = ${entity}` : sql``}
        order by a.created_at desc limit 200`
    : await sql`
        select a.*, u.name as actor_name from audit_logs a
        left join users u on u.id = a.actor_id
        where a.tenant_id = ${user.tenantId} ${entity ? sql`and a.entity = ${entity}` : sql``}
        order by a.created_at desc limit 200`;

  const entities = ["quotation", "lead", "project", "order", "customer", "membership", "branding_profile"];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Audit Log</h1>
        <p className="text-sm text-ink-500">Every mutation, who did it, and when</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <a href="/audit" className={`btn-secondary px-3 py-1.5 text-xs ${!entity ? "border-brand-500 text-brand-600" : ""}`}>All</a>
        {entities.map((e) => (
          <a key={e} href={`/audit?entity=${e}`} className={`btn-secondary px-3 py-1.5 text-xs capitalize ${entity === e ? "border-brand-500 text-brand-600" : ""}`}>
            {e.replace("_", " ")}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>When</th><th>Actor</th>{user.scope === "global" && <th>Partner</th>}
                <th>Entity</th><th>Action</th><th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs text-ink-400">
                    {new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="text-ink-700">{r.actor_name ?? "System"}</td>
                  {user.scope === "global" && <td className="text-ink-500">{r.tenant_name ?? "-"}</td>}
                  <td className="capitalize text-ink-500">{String(r.entity).replace("_", " ")}</td>
                  <td className="font-semibold">{r.action}</td>
                  <td className="max-w-[280px] truncate text-xs text-ink-400">
                    {r.detail && Object.keys(r.detail).length > 0 ? JSON.stringify(r.detail) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
