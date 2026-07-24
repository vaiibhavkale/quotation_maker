import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { groqChat, aiEnabled } from "@/lib/groq";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { withTenant } from "@/db";
import { fmtINR } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Drafts a WhatsApp follow-up from quote context. Advisory only - no pricing changes. */
export async function POST(req: Request) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  if (!aiEnabled()) {
    return NextResponse.json({ error: "AI is not configured yet (set GROQ_API_KEY)." }, { status: 503 });
  }
  const limit = await checkAiRateLimit(user, "followup");
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.message }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const { quoteId } = (await req.json()) as { quoteId?: string };
  if (!quoteId) return NextResponse.json({ error: "quoteId required" }, { status: 400 });

  const { q, events } = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    const [qRow] = await sql`
      select q.number, q.title, q.status, q.grand_total, q.valid_until, q.updated_at, q.tenant_id,
             c.name as customer_name, c.contact_name, b.display_name as brand_name
      from quotations q
      join customers c on c.id = q.customer_id
      join branding_profiles b on b.tenant_id = q.tenant_id
      where q.id = ${quoteId}`;
    if (!qRow) return { q: null, events: [] };
    const eventRows = await sql`
      select type, created_at from quote_events
      where quotation_id = ${quoteId} order by created_at desc limit 10`;
    return { q: qRow, events: eventRows };
  });
  if (!q) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const daysSince = Math.floor((Date.now() - new Date(q.updated_at).getTime()) / 864e5);
  const viewed = events.some((e) => e.type === "viewed");

  try {
    const draft = await groqChat([
      {
        role: "system",
        content:
          "You draft short WhatsApp follow-up messages for Indian B2B sales. " +
          "Tone: warm, professional, Hinglish-friendly but written in English. Max 80 words. " +
          "Never change prices, never promise discounts, never invent terms. " +
          "End with a clear, low-pressure call to action. Output ONLY the message text.",
      },
      {
        role: "user",
        content: JSON.stringify({
          seller: q.brand_name,
          customer: q.customer_name,
          contactPerson: q.contact_name,
          quoteNumber: q.number,
          subject: q.title,
          value: fmtINR(Number(q.grand_total), { compact: true }),
          status: q.status,
          customerHasViewed: viewed,
          daysSinceLastActivity: daysSince,
          validUntil: q.valid_until,
        }),
      },
    ], { maxTokens: 200 });

    return NextResponse.json({ draft: draft.trim() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
