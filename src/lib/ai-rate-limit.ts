import { withTenant } from "@/db";
import type { SessionUser } from "@/lib/auth";

/**
 * AI usage is capped at 30 requests per rolling 30-minute window, per user,
 * shared across every AI endpoint (Ask HIQM + WhatsApp follow-up drafts) —
 * one shared budget protecting the underlying Groq API key.
 *
 * Enforced in Postgres, not an in-memory counter: the app runs as Vercel
 * serverless functions, where an in-memory Map would reset on every cold
 * start and isn't shared across concurrent instances — it would look like
 * a rate limit without actually being one.
 */
const MAX_REQUESTS = 30;
const WINDOW_MINUTES = 30;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; message: string; retryAfterSeconds: number };

export async function checkAiRateLimit(
  user: SessionUser,
  endpoint: "ask" | "followup"
): Promise<RateLimitResult> {
  return withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    const [row] = await sql`
      select count(*)::int as n, min(created_at) as oldest
      from ai_requests
      where user_id = ${user.id} and created_at > now() - make_interval(mins => ${WINDOW_MINUTES})
    `;
    const n = Number(row?.n ?? 0);

    if (n >= MAX_REQUESTS) {
      const oldest = new Date(row.oldest as string);
      const retryAt = new Date(oldest.getTime() + WINDOW_MINUTES * 60_000);
      const retryAfterSeconds = Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1000));
      const mins = Math.max(1, Math.round(retryAfterSeconds / 60));
      const when = mins <= 1 ? "about a minute" : `about ${mins} minutes`;
      return {
        allowed: false,
        retryAfterSeconds,
        message: `You've reached the AI request limit — ${MAX_REQUESTS} requests every ${WINDOW_MINUTES} minutes, to keep things fast and fair for everyone. Please try again in ${when}.`,
      };
    }

    await sql`insert into ai_requests (tenant_id, user_id, endpoint) values (${user.tenantId}, ${user.id}, ${endpoint})`;
    return { allowed: true };
  });
}
