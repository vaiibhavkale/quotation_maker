/** Quotation lifecycle state machine — single source of truth for transitions. */

export const STATUSES = ["draft", "shared", "viewed", "negotiation", "approved", "converted", "lost"] as const;
export type QuoteStatus = (typeof STATUSES)[number];

const TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["shared", "lost"],
  shared: ["viewed", "negotiation", "approved", "lost"],
  viewed: ["negotiation", "approved", "lost"],
  negotiation: ["shared", "approved", "lost"], // revision → re-shared
  approved: ["converted", "lost"],
  converted: [],
  lost: [],
};

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft", shared: "Shared", viewed: "Viewed", negotiation: "Negotiation",
  approved: "Approved", converted: "Converted", lost: "Lost",
};

export const STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: "bg-ink-100 text-ink-700",
  shared: "bg-sky-100 text-sky-700",
  viewed: "bg-indigo-100 text-indigo-700",
  negotiation: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  converted: "bg-emerald-600 text-white",
  lost: "bg-rose-100 text-rose-700",
};

/** India FY: Apr–Mar → "2026-27" */
export function currentFY(d = new Date()): string {
  const y = d.getFullYear(), m = d.getMonth();
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
