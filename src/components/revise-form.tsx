"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviseQuote } from "@/app/actions/quotes";

type Line = {
  description: string; hsnCode: string; unit: string;
  quantity: number; rate: number; discountPct: number; gstRatePct: number;
};

export function ReviseForm({ quoteId, customerId, title: initialTitle, initialItems }: {
  quoteId: string; customerId: string; title: string; initialItems: Line[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>(initialItems);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const set = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = () =>
    start(async () => {
      setError(null);
      try {
        await reviseQuote(quoteId, { customerId, title, validDays: 15, items: lines }, reason || "Revised");
        router.push(`/quotes/${quoteId}`);
      } catch (e) {
        setError((e as Error).message || "Failed");
      }
    });

  return (
    <div className="max-w-4xl space-y-4">
      <div className="card grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Revision reason</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Customer asked for battery upgrade" />
        </div>
      </div>

      <div className="card space-y-3 p-5">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 rounded-lg border border-ink-100 bg-ink-50/50 p-3">
            <input className="input col-span-12 md:col-span-5" value={l.description}
              onChange={(e) => set(i, { description: e.target.value })} />
            <input className="input col-span-3 md:col-span-2" type="number" step="any" value={l.quantity}
              onChange={(e) => set(i, { quantity: Number(e.target.value) })} />
            <input className="input col-span-3 md:col-span-2" type="number" step="any" value={l.rate}
              onChange={(e) => set(i, { rate: Number(e.target.value) })} />
            <input className="input col-span-3 md:col-span-2" type="number" value={l.discountPct}
              onChange={(e) => set(i, { discountPct: Number(e.target.value) })} />
            <button type="button" className="btn-ghost col-span-3 px-2 py-1 text-xs md:col-span-1"
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1}>✕</button>
          </div>
        ))}
        <button type="button" className="btn-secondary text-xs"
          onClick={() => setLines((ls) => [...ls, { description: "", hsnCode: "", unit: "nos", quantity: 1, rate: 0, discountPct: 0, gstRatePct: 18 }])}>
          + Add line
        </button>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <button onClick={submit} disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Save revision & re-share"}
      </button>
    </div>
  );
}
