import { NextResponse } from "next/server";
import { getSql } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Customer-side digital acceptance from the public quote page. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const sql = getSql();

  const [share] = await sql`
    select s.tenant_id, s.quotation_id from quote_shares s
    where s.token = ${token} and s.revoked = false`;
  if (!share) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const [q] = await sql`select status from quotations where id = ${share.quotation_id}`;
  if (!q || !["shared", "viewed", "negotiation"].includes(q.status)) {
    return NextResponse.json({ error: "Quote is not open for acceptance" }, { status: 409 });
  }

  await sql`update quotations set status = 'approved', updated_at = now() where id = ${share.quotation_id}`;
  await sql`insert into quote_events (tenant_id, quotation_id, type, meta)
    values (${share.tenant_id}, ${share.quotation_id}, 'accepted_online', ${JSON.stringify({ token })})`;
  await sql`insert into audit_logs (tenant_id, entity, entity_id, action, detail)
    values (${share.tenant_id}, 'quotation', ${share.quotation_id}, 'accepted_online', ${JSON.stringify({ token })})`;

  return NextResponse.json({ ok: true });
}
