import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withTenant } from "@/db";
import { recordAdvancePayment } from "@/app/actions/orders";
import { Money } from "@/components/ui";
import { AdvanceStageButton } from "@/components/order-actions";
import { ORDER_STAGES, type OrderStage } from "@/lib/order-lifecycle";

export const dynamic = "force-dynamic";

export default async function OrderDetail(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;

  const { order, events } = await withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    const [orderRow] = await sql`
      select o.*, q.number as quote_number, q.grand_total, q.title, c.name as customer_name, c.phone as customer_phone
      from orders o
      join quotations q on q.id = o.quotation_id
      join customers c on c.id = q.customer_id
      where o.id = ${id}`;
    if (!orderRow) return { order: null, events: [] };
    const eventRows = await sql`select * from order_events where order_id = ${id} order by created_at desc`;
    return { order: orderRow, events: eventRows };
  });
  if (!order) notFound();

  const isOwnerTenant = user.tenantId === order.tenant_id;
  const balance = Number(order.grand_total) - Number(order.advance_received);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{order.order_number}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {order.title} · {order.customer_name} · from{" "}
            <Link href={`/quotes/${order.quotation_id}`} className="text-brand-600 hover:underline">{order.quote_number}</Link>
          </p>
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-sm font-bold">Fulfillment progress</h3>
          <div className="flex items-center gap-2">
            {ORDER_STAGES.map((s, i) => {
              const curIdx = ORDER_STAGES.indexOf(order.stage as OrderStage);
              const done = i <= curIdx;
              return (
                <div key={s} className="flex flex-1 items-center gap-2">
                  <div className={`h-2 flex-1 rounded-full ${done ? "bg-brand-500" : "bg-ink-100"}`} />
                  {i < ORDER_STAGES.length - 1 && <span className="text-ink-300">→</span>}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-ink-500">
            {ORDER_STAGES.map((s) => <span key={s} className="capitalize">{s}</span>)}
          </div>
          {isOwnerTenant && (
            <div className="mt-4">
              <AdvanceStageButton orderId={id} stage={order.stage as OrderStage} />
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-sm font-bold">Order activity</h3>
          <ol className="space-y-2.5">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <span className="font-semibold capitalize">{String(e.type).replace(/_/g, " ")}</span>
                <span className="text-xs text-ink-400">
                  {new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-bold">Payments</h3>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Order value</dt><dd className="font-semibold"><Money paise={Number(order.grand_total)} /></dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Advance received</dt><dd className="tabular-nums"><Money paise={Number(order.advance_received)} /></dd></div>
            <div className="flex justify-between border-t border-ink-200 pt-1.5 font-bold"><dt>Balance</dt><dd><Money paise={balance} /></dd></div>
          </dl>
          {isOwnerTenant && balance > 0 && (
            <form
              action={async (form: FormData) => {
                "use server";
                await recordAdvancePayment(id, form);
              }}
              className="mt-4 flex gap-2"
            >
              <input name="amount" type="number" min={1} step="any" required className="input" placeholder="Amount ₹" />
              <button className="btn-secondary shrink-0 text-xs">Record</button>
            </form>
          )}
        </div>

        <Link href="/orders" className="btn-ghost block text-center text-xs">← Back to orders</Link>
      </div>
    </div>
  );
}
