/**
 * Deal Desk gate — deterministic, tenant-wide discount policy.
 * Any quote whose blended discount crosses the threshold gets flagged
 * `needsApproval` at create/revise time (src/app/actions/quotes.ts) and
 * cannot move to `approved` until someone with an approver role signs
 * off (enforced again server-side in transitionQuote — never trust the
 * client for this check).
 */

/** Blended discount above this % requires deal-desk sign-off. */
export const DEAL_DESK_DISCOUNT_THRESHOLD_PCT = 10;

/** Quotes at or above this value need sign-off regardless of discount. */
export const DEAL_DESK_VALUE_THRESHOLD_PAISE = 50_00_000 * 100; // ₹50L

/** Roles allowed to clear a deal-desk hold. Sales reps cannot self-approve. */
export const DEAL_APPROVER_ROLES = [
  "partner_admin",
  "super_admin",
  "ceo",
  "zone_manager",
  "state_manager",
] as const;

export function canApproveDeals(role: string): boolean {
  return (DEAL_APPROVER_ROLES as readonly string[]).includes(role);
}

/** discountPct is a plain percentage (12.5 = 12.5%), grandTotal in paise. */
export function requiresDealDeskApproval(input: { discountPct: number; grandTotal: number }): boolean {
  return (
    input.discountPct > DEAL_DESK_DISCOUNT_THRESHOLD_PCT ||
    input.grandTotal >= DEAL_DESK_VALUE_THRESHOLD_PAISE
  );
}

export function dealDeskReason(input: { discountPct: number; grandTotal: number }): string | null {
  if (input.discountPct > DEAL_DESK_DISCOUNT_THRESHOLD_PCT) {
    return `Discount of ${input.discountPct.toFixed(1)}% exceeds the ${DEAL_DESK_DISCOUNT_THRESHOLD_PCT}% self-serve limit`;
  }
  if (input.grandTotal >= DEAL_DESK_VALUE_THRESHOLD_PAISE) {
    return "Deal value is at or above the ₹50L sign-off threshold";
  }
  return null;
}
