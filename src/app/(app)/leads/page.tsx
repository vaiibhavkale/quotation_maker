import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSql, withTenant } from "@/db";
import { createLead } from "@/app/actions/leads";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_CLS: Record<string, string> = {
  new: "bg-sky-100 text-sky-700",
  site_visit_scheduled: "bg-amber-100 text-amber-800",
  site_visit_done: "bg-indigo-100 text-indigo-700",
  converted: "bg-emerald-100 text-emerald-700",
  dropped: "bg-rose-100 text-rose-700",
};

export default async function LeadsPage() {
  const user = await requireUser();

  const leads = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => sql`
    select l.*, u.name as assigned_name
    from leads l
    left join users u on u.id = l.assigned_to_id
    where l.tenant_id = ${user.tenantId}
    order by l.created_at desc`);

  const teamMembers = await getSql()`
    select u.id, u.name from users u
    join memberships m on m.user_id = u.id
    where m.tenant_id = ${user.tenantId}
    order by u.name`;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Leads</h1>
        <p className="mb-6 text-sm text-ink-500">Lead → Site visit → Project → Quotation → Order</p>

        {leads.length === 0 ? (
          <EmptyState title="No leads yet" hint="Add your first lead on the right." />
        ) : (
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead>
                <tr><th>Name</th><th>Source</th><th>Assigned</th><th>Status</th><th>Added</th></tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/leads/${l.id}`} className="font-semibold text-brand-600 hover:underline">
                        {l.name}
                      </Link>
                      <p className="text-xs text-ink-400">{l.phone ?? l.email ?? "-"}</p>
                    </td>
                    <td className="capitalize text-ink-500">{String(l.source).replace("_", " ")}</td>
                    <td className="text-ink-500">{l.assigned_name ?? "Unassigned"}</td>
                    <td>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLS[l.status] ?? "bg-ink-100 text-ink-700"}`}>
                        {String(l.status).replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="text-xs text-ink-400">
                      {new Date(l.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-6 text-lg font-bold">Add lead</h2>
        <form action={createLead} className="card space-y-3 p-5">
          <div><label className="label">Name</label>
            <input name="name" required className="input" placeholder="Ramesh Patil" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Phone</label><input name="phone" className="input" placeholder="+91 …" /></div>
            <div><label className="label">Email</label><input name="email" className="input" /></div>
          </div>
          <div><label className="label">Source</label>
            <select name="source" className="input" defaultValue="referral">
              <option value="referral">Referral</option>
              <option value="website">Website</option>
              <option value="walk_in">Walk-in</option>
              <option value="cold_call">Cold call</option>
              <option value="partner">Partner</option>
            </select></div>
          <div><label className="label">Assign to</label>
            <select name="assignedToId" className="input" defaultValue="">
              <option value="">Unassigned</option>
              {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select></div>
          <div><label className="label">Notes</label>
            <textarea name="notes" className="input h-16" /></div>
          <button className="btn-primary w-full">Add lead</button>
        </form>
      </div>
    </div>
  );
}
