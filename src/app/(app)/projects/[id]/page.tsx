import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withTenant } from "@/db";
import { updateProjectStatus } from "@/app/actions/projects";
import { Money, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "on_hold", "completed", "cancelled"] as const;

export default async function ProjectDetail(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;

  const { project, quotes } = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    const [projectRow] = await sql`
      select p.*, c.name as customer_name, c.phone as customer_phone, l.name as lead_name
      from projects p
      join customers c on c.id = p.customer_id
      left join leads l on l.id = p.lead_id
      where p.id = ${id} and p.tenant_id = ${user.tenantId}`;
    if (!projectRow) return { project: null, quotes: [] };
    const quoteRows = await sql`
      select id, number, title, status, grand_total from quotations
      where project_id = ${id} order by created_at desc`;
    return { project: projectRow, quotes: quoteRows };
  });
  if (!project) notFound();

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {project.customer_name} · {project.customer_phone ?? "—"}
            {project.lead_name && <> · from lead <span className="text-ink-700">{project.lead_name}</span></>}
          </p>
          {project.address && <p className="mt-1 text-sm text-ink-600">{project.address}</p>}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
            <h3 className="text-sm font-bold">Quotations on this project</h3>
            <Link href={`/quotes/new?projectId=${id}&customerId=${project.customer_id}`} className="btn-primary text-xs">
              + New quotation
            </Link>
          </div>
          {quotes.length === 0 ? (
            <p className="p-5 text-sm text-ink-500">No quotations yet for this project.</p>
          ) : (
            <table className="table-base">
              <thead><tr><th>Number</th><th>Title</th><th>Status</th><th className="text-right">Value</th></tr></thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td><Link href={`/quotes/${q.id}`} className="font-semibold text-brand-600 hover:underline">{q.number}</Link></td>
                    <td className="max-w-[220px] truncate">{q.title}</td>
                    <td><StatusBadge status={q.status} /></td>
                    <td className="text-right font-semibold"><Money paise={Number(q.grand_total)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-bold">Project status</h3>
          <form action={async (form: FormData) => {
            "use server";
            await updateProjectStatus(id, form.get("status") as (typeof STATUSES)[number]);
          }} className="flex gap-2">
            <select name="status" defaultValue={project.status} className="input">
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
            <button className="btn-secondary shrink-0 text-xs">Update</button>
          </form>
        </div>
        <Link href="/projects" className="btn-ghost block text-center text-xs">← Back to projects</Link>
      </div>
    </div>
  );
}
