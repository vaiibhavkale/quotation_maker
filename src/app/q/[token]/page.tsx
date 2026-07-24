import { getSql, withTenant } from "@/db";
import { fmtINR, pct } from "@/lib/money";
import { AcceptButton } from "@/components/accept-button";

export const dynamic = "force-dynamic";

/**
 * Public, tokenized quote page - what the customer opens from WhatsApp.
 * Opening it records a 'viewed' event and flips the quote to Viewed (DocSend-style).
 *
 * No user is logged in here, so there's no session tenantId to draw from.
 * `quote_shares` is the one table with a public-read RLS policy (its token
 * IS the capability - anyone holding it may look up which tenant/quotation
 * it belongs to). Everything after that - the quotation itself, its items,
 * branding - is strictly tenant-isolated, so it's fetched inside `withTenant`
 * using the tenant resolved from the share row.
 */
export default async function PublicQuotePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const sql = getSql();

  const [share] = await sql`
    select tenant_id, quotation_id, channel, revoked, expires_at
    from quote_shares where token = ${token} and revoked = false`;

  if (!share || (share.expires_at && new Date(share.expires_at) < new Date())) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-100 p-6">
        <div className="card max-w-sm p-8 text-center">
          <p className="text-lg font-bold">Link expired</p>
          <p className="mt-2 text-sm text-ink-500">Please ask your vendor for a fresh quotation link.</p>
        </div>
      </main>
    );
  }

  const { q, items } = await withTenant({ tenantId: share.tenant_id, scope: "tenant" }, async ({ raw: tx }) => {
    // - Tracking: record view + flip status (server-side, no JS needed) -
    await tx`insert into quote_events (tenant_id, quotation_id, type, meta)
      values (${share.tenant_id}, ${share.quotation_id}, 'viewed', ${JSON.stringify({ token, channel: share.channel })})`;
    await tx`update quotations set status = 'viewed', updated_at = now()
      where id = ${share.quotation_id} and status = 'shared'`;

    const [qRow] = await tx`
      select q.*, c.name as c_name, c.gstin as c_gstin,
             b.display_name, b.primary_color, b.gstin as b_gstin, b.address as b_addr,
             b.phone as b_phone, b.email as b_email, b.upi_id, b.terms, b.powered_by_heseos
      from quotations q
      join customers c on c.id = q.customer_id
      join branding_profiles b on b.tenant_id = q.tenant_id
      where q.id = ${share.quotation_id}`;
    const itemRows = await tx`select * from quote_items where quotation_id = ${share.quotation_id} order by position`;
    return { q: qRow, items: itemRows };
  });

  const color = q.primary_color ?? "#E8821E";
  const interState = Number(q.igst) > 0;
  const accepted = ["approved", "converted"].includes(q.status);

  return (
    <main className="min-h-screen bg-ink-100 pb-16">
      <div className="h-2 w-full" style={{ backgroundColor: color }} />
      <div className="mx-auto max-w-2xl px-4">
        <header className="flex items-center justify-between py-6">
          <div>
            <p className="text-xl font-extrabold" style={{ color }}>{q.display_name}</p>
            <p className="text-xs text-ink-500">{q.b_addr}</p>
            {q.b_gstin && <p className="text-xs text-ink-500">GSTIN: {q.b_gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-400">Quotation</p>
            <p className="text-sm font-bold">{q.number}</p>
            <p className="text-xs text-ink-500">Rev {q.current_revision}</p>
          </div>
        </header>

        <div className="card overflow-hidden">
          <div className="border-b border-ink-100 p-5">
            <p className="text-lg font-bold">{q.title}</p>
            <p className="text-sm text-ink-500">Prepared for {q.c_name}</p>
          </div>

          <div className="divide-y divide-ink-100">
            {items.map((it) => (
              <div key={it.id} className="flex items-start justify-between gap-4 px-5 py-3">
                <div>
                  <p className="text-sm font-medium">{it.description}</p>
                  <p className="text-xs text-ink-500">
                    {(Number(it.quantity) / 100).toLocaleString("en-IN")} {it.unit} × {fmtINR(Number(it.rate))}
                    {Number(it.discount_pct) > 0 && <> · {pct(Number(it.discount_pct))} off</>}
                    {" "}· GST {pct(Number(it.gst_rate_pct))}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">{fmtINR(Number(it.line_total))}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-t border-ink-200 bg-ink-50/70 p-5 text-sm">
            <div className="flex justify-between text-ink-500"><span>Subtotal</span><span className="tabular-nums">{fmtINR(Number(q.subtotal))}</span></div>
            {Number(q.discount_total) > 0 && (
              <div className="flex justify-between text-ink-500"><span>Discount</span><span className="tabular-nums text-emerald-700">− {fmtINR(Number(q.discount_total))}</span></div>
            )}
            {interState ? (
              <div className="flex justify-between text-ink-500"><span>IGST</span><span className="tabular-nums">{fmtINR(Number(q.igst))}</span></div>
            ) : (
              <>
                <div className="flex justify-between text-ink-500"><span>CGST</span><span className="tabular-nums">{fmtINR(Number(q.cgst))}</span></div>
                <div className="flex justify-between text-ink-500"><span>SGST</span><span className="tabular-nums">{fmtINR(Number(q.sgst))}</span></div>
              </>
            )}
            <div className="flex justify-between pt-2 text-lg font-extrabold">
              <span>Total</span><span className="tabular-nums" style={{ color }}>{fmtINR(Number(q.grand_total))}</span>
            </div>
          </div>
        </div>

        <div className="card mt-4 p-5">
          {accepted ? (
            <div className="rounded-lg bg-emerald-50 p-4 text-center">
              <p className="font-bold text-emerald-700">✓ Quotation accepted</p>
              <p className="mt-1 text-xs text-emerald-600">{q.display_name} will contact you shortly.</p>
            </div>
          ) : (
            <AcceptButton token={token} color={color} />
          )}
          {q.upi_id && (
            <p className="mt-3 text-center text-xs text-ink-500">
              Pay advance via UPI: <span className="font-mono font-semibold">{q.upi_id}</span>
            </p>
          )}
        </div>

        {q.terms && (
          <div className="mt-4 px-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Terms & conditions</p>
            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-ink-500">{q.terms}</p>
          </div>
        )}

        {q.powered_by_heseos && (
          <p className="mt-8 text-center text-xs text-ink-400">
            ⚡ Powered by <span className="font-bold text-brand-600">HESEOS</span> · HIQM
          </p>
        )}
      </div>
    </main>
  );
}
