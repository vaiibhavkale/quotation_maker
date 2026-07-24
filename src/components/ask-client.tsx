"use client";

import { useState } from "react";

const SUGGESTIONS = [
  "How is the pipeline looking overall?",
  "Which region has the highest quotation value?",
  "Why are we losing quotes?",
  "Which quotes are ageing and need attention?",
  "Which channel converts best?",
];

type Turn = { q: string; a: string };

export function AskClient() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true); setErr(null); setQuestion("");
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI unavailable");
      setTurns((t) => [...t, { q, a: data.answer }]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {turns.length === 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)}
              className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:border-brand-500 hover:text-brand-600">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500 px-4 py-2.5 text-sm text-white">
              {t.q}
            </div>
            <div className="card w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-6">
              {t.a}
            </div>
          </div>
        ))}
        {loading && (
          <div className="card w-fit rounded-2xl px-4 py-3 text-sm text-ink-400">Analyzing your data…</div>
        )}
        {err && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{err}</p>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(question); }}
        className="sticky bottom-6 flex gap-2"
      >
        <input
          className="input flex-1 shadow-card"
          placeholder="Ask anything about your quotations…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button className="btn-primary" disabled={loading || !question.trim()}>Ask</button>
      </form>
    </div>
  );
}
