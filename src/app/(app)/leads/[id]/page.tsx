import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSql, withTenant } from "@/db";
import { scheduleSiteVisit, convertLeadToProject } from "@/app/actions/leads";
import { CompleteVisitButton, DropLeadButton } from "@/components/lead-actions";

export const dynamic = "force-dynamic";

export default async function LeadDetail(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;

  const { lead, visits } = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    const [leadRow] = await sql`
      select l.*, u.name as assigned_name from leads l
      left join users u on u.id = l.assigned_to_id
      where l.id = ${id} and l.tenant_id = ${user.tenantId}`;
    if (!leadRow) return { lead: null, visits: [] };
    const visitRows = await sql`
      select sv.*, u.name as engineer_name from site_visits sv
      left join users u on u.id = sv.engineer_id
      where sv.lead_id = ${id} order by sv.scheduled_at desc nulls last, sv.created_at desc`;
    return { lead: leadRow, visits: visitRows };
  });
  if (!lead) notFound();

  const teamMembers = await getSql()`
    select u.id, u.name from users u join memberships m on m.user_id = u.id
    where m.tenant_id = ${user.tenantId} order by u.name`;
  const states = await getSql()`select id, name from geo_states order by name`;

  const canConvert = !["converted", "dropped"].includes(lead.status);
  const canScheduleVisit = !["converted", "dropped"].includes(lead.status);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{lead.name}</h1>
            <span className="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-ink-700">
              {String(lead.status).replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {lead.phone ?? "-"} · {lead.email ?? "-"} · {lead.assigned_name ?? "Unassigned"} · source: {String(lead.source).replace("_", " ")}
          </p>
          {lead.notes && <p className="mt-2 max-w-xl text-sm text-ink-700">{lead.notes}</p>}
          {lead.status === "dropped" && lead.drop_reason && (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">Dropped: {lead.drop_reason}</p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-sm font-bold">Site visits</h3>
          {visits.length === 0 ? (
            <p className="text-sm text-ink-500">No site visits scheduled yet.</p>
          ) : (
            <ul className="space-y-3">
              {visits.map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3 text-sm">
                  <div>
                    <p className="font-semibold capitalize">{v.status}</p>
                    <p className="text-xs text-ink-500">
                      {v.scheduled_at ? new Date(v.scheduled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "No date"}
                      {" "}· {v.engineer_name ?? "Unassigned engineer"}
                    </p>
                    {v.notes && <p className="mt-1 text-xs text-ink-600">{v.notes}</p>}
                  </div>
                  {v.status === "scheduled" && <CompleteVisitButton visitId={v.id} leadId={id} />}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canScheduleVisit && (
          <form action={scheduleSiteVisit.bind(null, id)} className="card space-y-3 p-5">
            <h3 className="text-sm font-bold">Schedule a site visit</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Date & time</label>
                <input name="scheduledAt" type="datetime-local" required className="input" /></div>
              <div><label className="label">Engineer</label>
                <select name="engineerId" className="input" defaultValue="">
                  <option value="">Unassigned</option>
                  {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select></div>
            </div>
            <button className="btn-secondary">Schedule visit</button>
          </form>
        )}
      </div>

      <div className="space-y-6">
        {canConvert && (
          <form action={convertLeadToProject.bind(null, id)} className="card space-y-3 p-5">
            <h3 className="text-sm font-bold">Convert to project</h3>
            <p className="text-xs text-ink-500">Creates a customer (if needed) + project, then drops you straight into the quote builder.</p>
            <div><label className="label">Project name</label>
              <input name="projectName" required className="input" placeholder="Rooftop Solar - 5kW" /></div>
            <div><label className="label">Site address</label>
              <textarea name="address" className="input h-16" /></div>
            <div><label className="label">State (place of supply)</label>
              <select name="stateId" required className="input">
                {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label className="label">GSTIN (optional)</label>
              <input name="gstin" className="input" placeholder="27XXXXX0000X1Z5" /></div>
            <button className="btn-primary w-full">Convert & start quote</button>
          </form>
        )}

        {!["converted", "dropped"].includes(lead.status) && (
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold">Other actions</h3>
            <DropLeadButton leadId={id} />
          </div>
        )}

        <Link href="/leads" className="btn-ghost block text-center text-xs">← Back to leads</Link>
      </div>
    </div>
  );
}
