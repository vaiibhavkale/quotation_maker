import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSql } from "@/db";
import { loadQuoteBundle } from "@/lib/quote-data";
import { renderQuotePdf } from "@/pdf/quote-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const sql = getSql();

  // authz: own tenant, or leadership
  const [q] = await sql`select tenant_id from quotations where id = ${id}`;
  if (!q || (user.scope !== "global" && q.tenant_id !== user.tenantId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bundle = await loadQuoteBundle(id);
  if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pdf = await renderQuotePdf(bundle);
  await sql`insert into quote_events (tenant_id, quotation_id, type, actor_id)
    values (${q.tenant_id}, ${id}, 'downloaded', ${user.id})`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${bundle.quote.number.replaceAll("/", "-")}.pdf"`,
    },
  });
}
