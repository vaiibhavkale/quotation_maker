import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withTenant } from "@/db";
import { createProject } from "@/app/actions/projects";
import { Money, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_CLS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  on_hold: "bg-amber-100 text-amber-800",
  completed: "bg-ink-100 text-ink-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export default async function ProjectsPage() {
  const user = await requireUser();

  const { projects, customers } = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    const projectRows = await sql`
      select p.*, c.name as customer_name,
        count(q.id)::int as quote_count,
        coalesce(sum(q.grand_total) filter (where q.status not in ('lost')), 0)::bigint as pipeline_value
      from projects p
      join customers c on c.id = p.customer_id
      left join quotations q on q.project_id = p.id
      where p.tenant_id = ${user.tenantId}
      group by p.id, c.name
      order by p.created_at desc`;
    const customerRows = await sql`select id, name from customers where tenant_id = ${user.tenantId} order by name`;
    return { projects: projectRows, customers: customerRows };
  });

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight">Projects</h1>
        {projects.length === 0 ? (
          <EmptyState title="No projects yet" hint="Convert a lead, or add one manually on the right." />
        ) : (
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead>
                <tr><th>Project</th><th>Customer</th><th>Status</th><th className="text-right">Quotes</th><th className="text-right">Value</th></tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/projects/${p.id}`} className="font-semibold text-brand-600 hover:underline">{p.name}</Link>
                    </td>
                    <td className="text-ink-500">{p.customer_name}</td>
                    <td>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLS[p.status] ?? "bg-ink-100 text-ink-700"}`}>
                        {String(p.status).replace("_", " ")}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{p.quote_count}</td>
                    <td className="text-right font-semibold"><Money paise={Number(p.pipeline_value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-6 text-lg font-bold">New project</h2>
        {customers.length === 0 ? (
          <p className="text-sm text-ink-500">
            <Link className="text-brand-600 underline" href="/customers">Add a customer first</Link>.
          </p>
        ) : (
          <form action={createProject} className="card space-y-3 p-5">
            <div><label className="label">Customer</label>
              <select name="customerId" required className="input">
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className="label">Project name</label>
              <input name="name" required className="input" placeholder="Rooftop Solar — 25kW" /></div>
            <div><label className="label">Site address</label>
              <textarea name="address" className="input h-16" /></div>
            <button className="btn-primary w-full">Create project</button>
          </form>
        )}
      </div>
    </div>
  );
}
