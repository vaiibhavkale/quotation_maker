/**
 * Win Probability v0 — transparent, stage-weighted rules (industry-standard
 * CRM forecasting approach: base rate per pipeline stage, adjusted by
 * engagement signals). Distinct from Quote Health: health flags whether a
 * *deal in flight* needs attention right now; win probability estimates the
 * odds this specific quote *closes*, and feeds pipeline-weighted revenue
 * forecasting on the CEO dashboard. Same philosophy as health.ts — rules
 * now, explainable, swappable for a trained model later without touching
 * any caller.
 */

export type WinProbabilityInput = {
  status: string;
  viewed: boolean;
  acceptedOnline: boolean; // customer used the public "Accept" action
  discountPct: number; // blended, plain percentage e.g. 8.5
  ageDays: number;
  silentDays: number;
  revisionCount: number;
  hasCustomerGstin: boolean;
  isPastValidity: boolean;
};

export type WinProbability = {
  probability: number; // 0–100
  band: "high" | "medium" | "low";
  factors: string[];
};

/** Stage base rates — classic CRM forecasting heuristic (win-rate by stage). */
const BASE_RATE: Record<string, number> = {
  draft: 10,
  shared: 25,
  viewed: 40,
  negotiation: 55,
  approved: 85,
  converted: 100,
  lost: 0,
};

export function winProbability(q: WinProbabilityInput): WinProbability {
  if (q.status === "converted") return { probability: 100, band: "high", factors: ["Won"] };
  if (q.status === "lost") return { probability: 0, band: "low", factors: ["Lost"] };

  let p = BASE_RATE[q.status] ?? 20;
  const factors: string[] = [`Base rate for ${q.status} stage: ${BASE_RATE[q.status] ?? 20}%`];

  if (q.viewed) { p += 15; factors.push("Customer has opened the quote"); }
  if (q.acceptedOnline) { p += 10; factors.push("Customer digitally accepted"); }

  if (q.discountPct > 0 && q.discountPct <= 10) {
    p += 5; factors.push(`Modest discount (${q.discountPct.toFixed(1)}%) suggests active negotiation`);
  } else if (q.discountPct > 15) {
    p -= 10; factors.push(`Heavy discounting (${q.discountPct.toFixed(1)}%) signals price resistance`);
  }

  if (q.silentDays > 7) { p -= 15; factors.push(`No activity for ${Math.floor(q.silentDays)} days`); }
  else if (q.silentDays > 3) { p -= 6; factors.push("Going quiet — momentum slowing"); }

  if (q.revisionCount > 3) { p -= Math.min(10, (q.revisionCount - 2) * 3); factors.push(`${q.revisionCount} revisions — prolonged back-and-forth`); }

  if (q.isPastValidity) { p -= 15; factors.push("Quote validity has lapsed — urgency lost"); }
  if (q.hasCustomerGstin) { p += 5; factors.push("Registered business buyer (GSTIN on file)"); }

  if (q.ageDays > 30 && !["approved"].includes(q.status)) { p -= 8; factors.push(`Open for ${Math.floor(q.ageDays)} days with no close`); }

  p = Math.max(2, Math.min(97, Math.round(p))); // never claim certainty either direction pre-close
  const band = p >= 70 ? "high" : p >= 40 ? "medium" : "low";
  return { probability: p, band, factors };
}
