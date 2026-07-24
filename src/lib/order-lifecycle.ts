/** Order fulfillment stages - single source of truth, importable from both
 * server actions ("use server" files may only export async functions, so
 * this constant can't live in src/app/actions/orders.ts itself) and UI. */
export const ORDER_STAGES = ["production", "dispatch", "installation", "completed"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];
