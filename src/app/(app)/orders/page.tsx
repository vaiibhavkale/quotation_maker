import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withTenant } from "@/db";
import { Money, EmptyState } from "@/components/ui";
import { ORDER_STAGES } from "@/lib/order-lifecycle";

export const dynamic = "force-dynamic";

const STAGE_CLS: Record<string, string> = {
  production: "bg-amber-100 text-amber-800",
  dispatch: "bg-sky-100 text-sky-700",
  installation: "bg-indigo-100 text-indigo-700",
  completed: "bg-emerald-100 text-emerald-700",
};

export default async function OrdersPage() {
  const user = await requireUser();

  const rows = await withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => sql`
    select o.id, o.order_number, o.stage, o.advance_received, q.number as quote_number,
           q.grand_total, c.name as customer_name, t.name as tenant_name
    from orders o
    join quotations q on q.id = o.quotation_id
    join customers c on c.id = q.customer_id
    join tenants t on t.id = o.tenant_id
    order by o.created_at desc
    limit 200`);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Orders</h1>
        <p className="text-sm text-ink-500">Created automatically the moment a quotation converts</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No orders yet" hint="Convert an approved quotation to create your first order." />
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Order</th><th>Quote</th><th>Customer</th>
                {user.scope === "global" && <th>Partner</th>}
                <th>Stage</th><th className="text-right">Value</th><th className="text-right">Advance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/orders/${o.id}`} className="font-semibold text-brand-600 hover:underline">{o.order_number}</Link></td>
                  <td className="text-ink-500">{o.quote_number}</td>
                  <td className="max-w-[160px] truncate">{o.customer_name}</td>
                  {user.scope === "global" && <td className="max-w-[140px] truncate text-ink-500">{o.tenant_name}</td>}
                  <td>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STAGE_CLS[o.stage] ?? "bg-ink-100 text-ink-700"}`}>
                      {String(o.stage)} {o.stage !== "completed" && `(${ORDER_STAGES.indexOf(o.stage) + 1}/${ORDER_STAGES.length})`}
                    </span>
                  </td>
                  <td className="text-right font-semibold"><Money paise={Number(o.grand_total)} /></td>
                  <td className="text-right tabular-nums text-ink-500"><Money paise={Number(o.advance_received)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
