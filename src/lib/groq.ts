/**
 * Minimal Groq client (OpenAI-compatible). No SDK dependency.
 * AI is advisory only - it never computes prices, taxes or totals.
 */

type Msg = { role: "system" | "user" | "assistant"; content: string };

export async function groqChat(messages: Msg[], opts?: { json?: boolean; maxTokens?: number }): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not configured");
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: opts?.maxTokens ?? 900,
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

export function aiEnabled(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}
