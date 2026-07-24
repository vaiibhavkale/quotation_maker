/**
 * Deterministic GST engine. AI never touches money — this module does.
 * Intra-state (seller state == place of supply) → CGST + SGST (half each).
 * Inter-state → IGST.
 * All inputs/outputs integer paise; percentages ×100.
 */

export type ItemInput = {
  quantity: number;   // ×100
  rate: number;       // paise
  discountPct: number; // ×100
  gstRatePct: number;  // ×100
};

export type Totals = {
  subtotal: number;
  discountTotal: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  lineTotals: number[];
};

export function computeTotals(items: ItemInput[], interState: boolean): Totals {
  let subtotal = 0, discountTotal = 0, cgst = 0, sgst = 0, igst = 0;
  const lineTotals: number[] = [];

  for (const it of items) {
    const gross = Math.round((it.rate * it.quantity) / 100);
    const disc = Math.round((gross * it.discountPct) / 10000);
    const line = gross - disc;
    subtotal += gross;
    discountTotal += disc;
    lineTotals.push(line);

    const tax = Math.round((line * it.gstRatePct) / 10000);
    if (interState) {
      igst += tax;
    } else {
      const half = Math.round(tax / 2);
      cgst += half;
      sgst += tax - half;
    }
  }

  const taxable = subtotal - discountTotal;
  return { subtotal, discountTotal, taxable, cgst, sgst, igst, grandTotal: taxable + cgst + sgst + igst, lineTotals };
}
