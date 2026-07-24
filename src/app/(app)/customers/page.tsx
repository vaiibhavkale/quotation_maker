import { requireUser } from "@/lib/auth";
import { getSql, withTenant } from "@/db";
import { createCustomer } from "@/app/actions/misc";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await requireUser();

  const customers = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => sql`
    select c.*, s.name as state_name from customers c
    left join geo_states s on s.id = c.state_id
    where c.tenant_id = ${user.tenantId} order by c.created_at desc`);
  const states = await getSql()`select id, name from geo_states order by name`;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight">Customers</h1>
        {customers.length === 0 ? (
          <EmptyState title="No customers yet" hint="Add your first customer on the right." />
        ) : (
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead>
                <tr><th>Name</th><th>Contact</th><th>Phone</th><th>GSTIN</th><th>State</th></tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.name}</td>
                    <td>{c.contact_name ?? "-"}</td>
                    <td className="tabular-nums">{c.phone ?? "-"}</td>
                    <td className="text-xs text-ink-500">{c.gstin ?? "-"}</td>
                    <td>{c.state_name ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-6 text-lg font-bold">Add customer</h2>
        <form action={createCustomer} className="card space-y-3 p-5">
          <div><label className="label">Company name</label>
            <input name="name" required className="input" placeholder="Shree Ganesh Industries" /></div>
          <div><label className="label">Contact person</label>
            <input name="contactName" className="input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Phone</label><input name="phone" className="input" placeholder="+91 …" /></div>
            <div><label className="label">Email</label><input name="email" className="input" /></div>
          </div>
          <div><label className="label">GSTIN</label>
            <input name="gstin" className="input" placeholder="27XXXXX0000X1Z5" /></div>
          <div><label className="label">Billing address</label>
            <textarea name="billingAddress" className="input h-16" /></div>
          <div><label className="label">State (place of supply)</label>
            <select name="stateId" required className="input">
              {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <button className="btn-primary w-full">Add customer</button>
        </form>
      </div>
    </div>
  );
}
