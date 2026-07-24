"use client";

import { useMemo, useState, useEffect, useTransition } from "react";
import { createQuote } from "@/app/actions/quotes";

type Customer = { id: string; name: string; stateId: string | null };
type Line = {
  description: string; hsnCode: string; unit: string;
  quantity: number; rate: number; discountPct: number; gstRatePct: number;
};

const CATALOGUE: Omit<Line, "quantity" | "discountPct">[] = [
  { description: "Solar PV Module 540Wp Mono PERC", hsnCode: "85414012", unit: "nos", rate: 12500, gstRatePct: 12 },
  { description: "String Inverter 5kW 3-Phase", hsnCode: "85044030", unit: "nos", rate: 45000, gstRatePct: 12 },
  { description: "Li-Ion Battery Pack 5kWh LFP", hsnCode: "85076000", unit: "nos", rate: 125000, gstRatePct: 18 },
  { description: "Module Mounting Structure (per kW)", hsnCode: "73089090", unit: "kW", rate: 5500, gstRatePct: 18 },
  { description: "Net Metering Liaison & Commissioning", hsnCode: "998739", unit: "job", rate: 15000, gstRatePct: 18 },
];

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

export function QuoteBuilder({ customers, sellerStateId }: {
  customers: Customer[]; sellerStateId: string | null;
}) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { description: "", hsnCode: "", unit: "nos", quantity: 1, rate: 0, discountPct: 0, gstRatePct: 18 },
  ]);
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const customer = customers.find((c) => c.id === customerId);
  const interState = Boolean(customer?.stateId && sellerStateId && customer.stateId !== sellerStateId);

  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, tax = 0;
    for (const l of lines) {
      const gross = l.rate * l.quantity;
      const disc = (gross * l.discountPct) / 100;
      const taxable = gross - disc;
      subtotal += gross; discount += disc;
      tax += (taxable * l.gstRatePct) / 100;
    }
    const taxable = subtotal - discount;
    return {
      subtotal, discount, taxable, tax, grand: taxable + tax,
      cgst: interState ? 0 : tax / 2, sgst: interState ? 0 : tax / 2, igst: interState ? tax : 0,
    };
  }, [lines, interState]);

  const set = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const addFromCatalogue = (c: (typeof CATALOGUE)[number]) =>
    setLines((ls) => {
      const empty = ls.length === 1 && !ls[0].description;
      const line = { ...c, quantity: 1, discountPct: 0 };
      return empty ? [line] : [...ls, line];
    });

  const submit = () => {
    setError(null);
    if (!customerId || !title.trim() || lines.some((l) => !l.description.trim())) {
      setError("Pick a customer, add a title, and fill every line description.");
      return;
    }
    startTransition(async () => {
      try {
        await createQuote({ customerId, title, validDays: 15, items: lines });
      } catch (e) {
        const msg = (e as Error).message ?? "";
        if (msg.includes("NEXT_REDIRECT")) throw e;
        setError(msg || "Something went wrong");
      }
    });
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(1, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <div className="card p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">Customer</label>
              <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-ink-500">
                {interState ? "Inter-state supply → IGST" : "Intra-state supply → CGST + SGST"}
              </p>
            </div>
            <div>
              <label className="label">Quote title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Rooftop Solar — 25 kW" />
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold">Bill of Quantities</h3>
            <div className="flex flex-wrap gap-1.5">
              {CATALOGUE.map((c) => (
                <button key={c.description} type="button" onClick={() => addFromCatalogue(c)}
                  className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[11px] font-medium text-ink-700 hover:border-brand-500 hover:text-brand-600">
                  + {c.description.split(" ").slice(0, 3).join(" ")}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 rounded-lg border border-ink-100 bg-ink-50/50 p-3">
                <input className="input col-span-12 md:col-span-4" placeholder="Item description"
                  value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
                <input className="input col-span-4 md:col-span-2" placeholder="HSN"
                  value={l.hsnCode} onChange={(e) => set(i, { hsnCode: e.target.value })} />
                <input className="input col-span-4 md:col-span-1" type="number" min={0.01} step="any" placeholder="Qty"
                  value={l.quantity} onChange={(e) => set(i, { quantity: Number(e.target.value) })} />
                <input className="input col-span-4 md:col-span-2" type="number" min={0} step="any" placeholder="Rate ₹"
                  value={l.rate} onChange={(e) => set(i, { rate: Number(e.target.value) })} />
                <input className="input col-span-4 md:col-span-1" type="number" min={0} max={100} placeholder="Disc %"
                  value={l.discountPct} onChange={(e) => set(i, { discountPct: Number(e.target.value) })} />
                <select className="input col-span-4 md:col-span-1" value={l.gstRatePct}
                  onChange={(e) => set(i, { gstRatePct: Number(e.target.value) })}>
                  {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}
                </select>
                <button type="button" className="btn-ghost col-span-12 justify-self-end px-2 py-1 text-xs md:col-span-1"
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  disabled={lines.length === 1}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button type="button" className="btn-secondary mt-3 text-xs"
            onClick={() => setLines((ls) => [...ls, { description: "", hsnCode: "", unit: "nos", quantity: 1, rate: 0, discountPct: 0, gstRatePct: 18 }])}>
            + Add line
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card sticky top-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold">Summary</h3>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${elapsed < 120 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
              ⏱ {mm}:{ss}
            </span>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="tabular-nums">{inr(totals.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Discount</dt><dd className="tabular-nums text-rose-600">− {inr(totals.discount)}</dd></div>
            {interState ? (
              <div className="flex justify-between"><dt className="text-ink-500">IGST</dt><dd className="tabular-nums">{inr(totals.igst)}</dd></div>
            ) : (
              <>
                <div className="flex justify-between"><dt className="text-ink-500">CGST</dt><dd className="tabular-nums">{inr(totals.cgst)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">SGST</dt><dd className="tabular-nums">{inr(totals.sgst)}</dd></div>
              </>
            )}
            <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-extrabold">
              <dt>Grand Total</dt><dd className="tabular-nums">{inr(totals.grand)}</dd>
            </div>
          </dl>

          {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

          <button onClick={submit} disabled={pending} className="btn-primary mt-4 w-full">
            {pending ? "Creating…" : "Create Quotation"}
          </button>
          <p className="mt-2 text-center text-[11px] text-ink-500">
            Goal: under 2 minutes. Taxes are computed by the deterministic GST engine.
          </p>
        </div>
      </div>
    </div>
  );
}
