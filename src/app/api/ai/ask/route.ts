import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { groqChat, aiEnabled } from "@/lib/groq";
import { overview, drilldown, statusFunnel, channelRanking, ageing } from "@/lib/analytics";
import { getSql } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ask HIQM — natural-language analytics.
 * Architecture: we run the deterministic SQL rollups first, then let the model
 * NARRATE the numbers. The model never invents figures and never writes SQL.
 */
export async function POST(req: Request) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  if (!aiEnabled()) {
    return NextResponse.json({ error: "AI is not configured yet (set GROQ_API_KEY)." }, { status: 503 });
  }

  const { question } = (await req.json()) as { question?: string };
  if (!question?.trim()) return NextResponse.json({ error: "Ask a question" }, { status: 400 });

  const sql = getSql();
  const [ov, dd, funnel, channels, age, lossReasons, topQuotes] = await Promise.all([
    overview(user),
    drilldown(user),
    statusFunnel(user),
    channelRanking(user),
    ageing(user),
    sql`select lost_reason, count(*)::int as n from quotations
        where status = 'lost' and ${user.scope === "global" ? sql`true` : sql`tenant_id = ${user.tenantId}`}
        group by lost_reason order by n desc limit 5`,
    sql`select q.number, q.title, q.status, q.grand_total, t.name as partner
        from quotations q join tenants t on t.id = q.tenant_id
        where ${user.scope === "global" ? sql`true` : sql`q.tenant_id = ${user.tenantId}`}
        order by q.grand_total desc limit 5`,
  ]);

  const context = {
    viewer: { role: user.role, scope: user.scope, tenant: user.tenantName },
    overview: ov,
    byRegionOrOrg: dd,
    funnel,
    channels,
    ageingBuckets: age,
    topLossReasons: lossReasons,
    largestQuotes: topQuotes,
    note: "All money values are integer paise (divide by 100 for rupees). Format money in Indian style (₹, Lakh, Crore).",
  };

  try {
    const answer = await groqChat([
      {
        role: "system",
        content:
          "You are HIQM's analytics assistant for HESEOS leadership and partners. " +
          "Answer ONLY from the JSON data provided — never invent numbers. " +
          "Be concise and executive: 3-6 sentences, concrete figures, one actionable insight at the end. " +
          "Money is in paise; convert to ₹ Lakh/Crore Indian format. If the data cannot answer the question, say what data is missing.",
      },
      { role: "user", content: `DATA:\n${JSON.stringify(context)}\n\nQUESTION: ${question}` },
    ], { maxTokens: 500 });

    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
