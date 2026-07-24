import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withTenant } from "@/db";
import { ReviseForm } from "@/components/revise-form";

export const dynamic = "force-dynamic";

export default async function RevisePage(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;

  const { q, items } = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    const [qRow] = await sql`
      select q.id, q.number, q.title, q.customer_id
      from quotations q
      where q.id = ${id}`;
    if (!qRow) return { q: null, items: [] };
    const itemRows = await sql`select * from quote_items where quotation_id = ${id} order by position`;
    return { q: qRow, items: itemRows };
  });
  if (!q) notFound();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Revise {q.number}</h1>
        <p className="text-sm text-ink-500">
          A new immutable revision snapshot will be created and the quote re-shared.
        </p>
      </div>
      <ReviseForm
        quoteId={id}
        customerId={q.customer_id}
        title={q.title}
        initialItems={items.map((it) => ({
          description: it.description,
          hsnCode: it.hsn_code ?? "",
          unit: it.unit,
          quantity: Number(it.quantity) / 100,
          rate: Number(it.rate) / 100,
          discountPct: Number(it.discount_pct) / 100,
          gstRatePct: Number(it.gst_rate_pct) / 100,
        }))}
      />
    </div>
  );
}
