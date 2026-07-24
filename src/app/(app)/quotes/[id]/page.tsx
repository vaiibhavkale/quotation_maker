import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSql } from "@/db";
import { fmtINR, pct } from "@/lib/money";
import { quoteHealth } from "@/lib/health";
import { Money, StatusBadge, HealthBadge } from "@/components/ui";
import { LivePoller, ShareButtons, TransitionButtons, FollowupDrafter } from "@/components/quote-actions";
import type { QuoteStatus } from "@/lib/lifecycle";

export const dynamic = "force-dynamic";

export default async function QuoteDetail(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;
  const sql = getSql();

  const [q] = await sql`
    select q.*, c.name as customer_name, c.phone as customer_phone, c.gstin as customer_gstin,
           t.name as tenant_name
    from quotations q
    join customers c on c.id = q.customer_id
    join tenants t on t.id = q.tenant_id
    where q.id = ${id}
      and ${user.scope === "global" ? sql`true` : sql`q.tenant_id = ${user.tenantId}`}`;
  if (!q) notFound();

  const items = await sql`select * from quote_items where quotation_id = ${id} order by position`;
  const events = await sql`select * from quote_events where quotation_id = ${id} order by created_at desc limit 30`;
  const revisions = await sql`select revision_no, reason, created_at, snapshot from quote_revisions
    where quotation_id = ${id} order by revision_no desc`;

  const viewed = events.some((e) => e.type === "viewed");
  const health = quoteHealth({
    status: q.status,
    grandTotal: Number(q.grand_total),
    discountTotal: Number(q.discount_total),
    subtotal: Number(q.subtotal),
    createdAt: new Date(q.created_at),
    validUntil: q.valid_until ? new Date(q.valid_until) : null,
    lastEventAt: events[0] ? new Date(events[0].created_at) : null,
    viewed,
    revisionCount: revisions.length,
    hasCustomerGstin: Boolean(q.customer_gstin),
    itemCount: items.length,
  });

  // Revision diff (latest vs previous)
  let diff: { added: string[]; removed: string[]; totalDelta: number } | null = null;
  if (revisions.length >= 2) {
    const cur = (revisions[0].snapshot as { items?: { description: string }[]; totals?: { grandTotal?: number; grand?: number } }) ?? {};
    const prev = (revisions[1].snapshot as { items?: { description: string }[]; totals?: { grandTotal?: number; grand?: number } }) ?? {};
    const curDescs = (cur.items ?? []).map((i) => i.description);
    const prevDescs = (prev.items ?? []).map((i) => i.description);
    diff = {
      added: curDescs.filter((d) => !prevDescs.includes(d)),
      removed: prevDescs.filter((d) => !curDescs.includes(d)),
      totalDelta: Number(cur.totals?.grandTotal ?? cur.totals?.grand ?? 0) - Number(prev.totals?.grandTotal ?? prev.totals?.grand ?? 0),
    };
  }

  const interState = Number(q.igst) > 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const isOwnerTenant = user.tenantId === q.tenant_id;

  return (
    <div>
      <LivePoller />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{q.number}</h1>
            <StatusBadge status={q.status} />
            <HealthBadge score={health.score} grade={health.grade} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {q.title} · {q.customer_name}
            {user.scope === "global" && <> · <span className="text-ink-400">{q.tenant_name}</span></>}
            {" "}· Revision {q.current_revision}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/quotes/${id}/pdf`} className="btn-primary text-xs">Download PDF</a>
          <a href={`/quotes/${id}/excel`} className="btn-secondary text-xs">Excel</a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead>
                <tr><th>#</th><th>Description</th><th>HSN</th><th className="text-right">Qty</th>
                  <th className="text-right">Rate</th><th className="text-right">Disc</th>
                  <th className="text-right">GST</th><th className="text-right">Amount</th></tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id}>
                    <td className="text-ink-400">{i + 1}</td>
                    <td className="max-w-[260px]">{it.description}</td>
                    <td className="text-ink-500">{it.hsn_code ?? "—"}</td>
                    <td className="text-right tabular-nums">{(Number(it.quantity) / 100).toLocaleString("en-IN")} {it.unit}</td>
                    <td className="text-right tabular-nums">{fmtINR(Number(it.rate))}</td>
                    <td className="text-right tabular-nums">{pct(Number(it.discount_pct))}</td>
                    <td className="text-right tabular-nums">{pct(Number(it.gst_rate_pct))}</td>
                    <td className="text-right font-semibold tabular-nums">{fmtINR(Number(it.line_total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end border-t border-ink-200 bg-ink-50/60 px-5 py-4">
              <dl className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="tabular-nums">{fmtINR(Number(q.subtotal))}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Discount</dt><dd className="tabular-nums text-rose-600">− {fmtINR(Number(q.discount_total))}</dd></div>
                {interState ? (
                  <div className="flex justify-between"><dt className="text-ink-500">IGST</dt><dd className="tabular-nums">{fmtINR(Number(q.igst))}</dd></div>
                ) : (
                  <>
                    <div className="flex justify-between"><dt className="text-ink-500">CGST</dt><dd className="tabular-nums">{fmtINR(Number(q.cgst))}</dd></div>
                    <div className="flex justify-between"><dt className="text-ink-500">SGST</dt><dd className="tabular-nums">{fmtINR(Number(q.sgst))}</dd></div>
                  </>
                )}
                <div className="flex justify-between border-t border-ink-200 pt-1.5 text-base font-extrabold">
                  <dt>Total</dt><dd className="tabular-nums">{fmtINR(Number(q.grand_total))}</dd>
                </div>
              </dl>
            </div>
          </div>

          {diff && (
            <div className="card p-5">
              <h3 className="mb-2 text-sm font-bold">Revision diff — R{revisions[1].revision_no} → R{revisions[0].revision_no}</h3>
              <div className="space-y-1 text-sm">
                {diff.added.map((d) => <p key={d} className="text-emerald-700">+ {d}</p>)}
                {diff.removed.map((d) => <p key={d} className="text-rose-600">− {d}</p>)}
                {diff.added.length === 0 && diff.removed.length === 0 && (
                  <p className="text-ink-500">Same items — quantities/pricing changed.</p>
                )}
                <p className={`pt-1 font-semibold ${diff.totalDelta >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  Total {diff.totalDelta >= 0 ? "increased" : "decreased"} by {fmtINR(Math.abs(diff.totalDelta))}
                </p>
              </div>
            </div>
          )}

          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold">Activity timeline</h3>
            <ol className="space-y-2.5">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <span className="font-semibold capitalize">{String(e.type).replace("_", " ")}</span>
                  <span className="text-xs text-ink-400">
                    {new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-6">
          {isOwnerTenant && (
            <div className="card space-y-4 p-5">
              <h3 className="text-sm font-bold">Share & progress</h3>
              <ShareButtons quoteId={id} customerPhone={q.customer_phone} appUrl={appUrl} />
              <TransitionButtons quoteId={id} status={q.status as QuoteStatus} />
            </div>
          )}

          <div className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">Quote health</h3>
              <HealthBadge score={health.score} grade={health.grade} />
            </div>
            <ul className="space-y-1.5 text-xs text-ink-700">
              {health.reasons.map((r) => <li key={r}>• {r}</li>)}
            </ul>
          </div>

          {isOwnerTenant && <FollowupDrafter quoteId={id} customerPhone={q.customer_phone} />}

          <div className="card p-5">
            <h3 className="mb-2 text-sm font-bold">Revisions</h3>
            <ul className="space-y-2 text-sm">
              {revisions.map((r) => (
                <li key={r.revision_no} className="flex items-center justify-between">
                  <span className="font-semibold">R{r.revision_no}</span>
                  <span className="text-xs text-ink-500">
                    {new Date(r.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <Link href={`/quotes/${id}/revise`} className="btn-secondary mt-3 w-full text-xs">
              Create revision
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
