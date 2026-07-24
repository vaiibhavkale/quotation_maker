/**
 * Quote Health Score v0 - transparent rules, upgradeable to a learned model.
 * Returns 0–100 with reasons. AI narrates; rules score.
 */

export type HealthInput = {
  status: string;
  grandTotal: number;
  discountTotal: number;
  subtotal: number;
  createdAt: Date;
  validUntil: Date | null;
  lastEventAt: Date | null;
  viewed: boolean;
  revisionCount: number;
  hasCustomerGstin: boolean;
  itemCount: number;
};

export type Health = { score: number; grade: "healthy" | "warm" | "at-risk"; reasons: string[] };

export function quoteHealth(q: HealthInput): Health {
  let score = 70;
  const reasons: string[] = [];
  const now = Date.now();
  const ageDays = (now - q.createdAt.getTime()) / 864e5;
  const silentDays = q.lastEventAt ? (now - q.lastEventAt.getTime()) / 864e5 : ageDays;

  if (q.viewed) { score += 15; reasons.push("Customer has viewed the quote"); }
  else if (["shared", "negotiation"].includes(q.status) && ageDays > 2) {
    score -= 15; reasons.push("Shared but not viewed for over 48 hours");
  }

  if (silentDays > 7) { score -= 15; reasons.push(`No activity for ${Math.floor(silentDays)} days`); }
  else if (silentDays > 3) { score -= 8; reasons.push("Going quiet - follow up soon"); }

  const discPct = q.subtotal > 0 ? (q.discountTotal / q.subtotal) * 100 : 0;
  if (discPct > 12) { score -= 12; reasons.push(`Deep discount (${discPct.toFixed(1)}%) is eroding margin`); }
  else if (discPct > 7) { score -= 5; reasons.push(`Discount at ${discPct.toFixed(1)}% - watch margin`); }

  if (q.validUntil && q.validUntil.getTime() < now && !["approved", "converted", "lost"].includes(q.status)) {
    score -= 20; reasons.push("Validity has expired - re-issue or revise");
  }

  if (q.revisionCount > 3) { score -= 8; reasons.push(`${q.revisionCount} revisions - negotiation is dragging`); }
  if (!q.hasCustomerGstin) { score -= 4; reasons.push("Customer GSTIN missing - will block invoicing"); }
  if (q.itemCount < 2) { score -= 3; reasons.push("Very small BOQ - possible incomplete scope"); }

  if (q.status === "negotiation") { score += 5; reasons.push("Active negotiation - engaged buyer"); }
  if (q.status === "approved") score = Math.max(score, 85);
  if (q.status === "converted") { score = 100; reasons.length = 0; reasons.push("Won"); }
  if (q.status === "lost") { score = 0; reasons.length = 0; reasons.push("Lost"); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 70 ? "healthy" : score >= 40 ? "warm" : "at-risk";
  return { score, grade, reasons };
}
