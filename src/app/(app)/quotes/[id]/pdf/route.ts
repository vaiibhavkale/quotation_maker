import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { withTenant } from "@/db";
import { loadQuoteBundle } from "@/lib/quote-data";
import { renderQuotePdf } from "@/pdf/quote-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const rlsCtx = { tenantId: user.tenantId, scope: user.scope };

  // authz IS the RLS lookup: if this quote isn't the user's own tenant (and
  // they aren't leadership), the policy returns nothing and bundle is null.
  const bundle = await loadQuoteBundle(id, rlsCtx);
  if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pdf = await renderQuotePdf(bundle);
  await withTenant({ tenantId: bundle.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    await sql`insert into quote_events (tenant_id, quotation_id, type, actor_id)
      values (${bundle.tenantId}, ${id}, 'downloaded', ${user.id})`;
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${bundle.quote.number.replaceAll("/", "-")}.pdf"`,
    },
  });
}
