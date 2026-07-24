import { withTenant, type TenantCtx } from "@/db";
import type { QuotePdfData } from "@/pdf/quote-pdf";

/**
 * Loads everything the PDF/Excel/public page needs, in one place.
 * `ctx` is the RLS session context to run under — quotations/customers/
 * quote_items are strictly tenant-isolated, so callers must supply the
 * requester's own tenantId/scope (authenticated routes) or the tenant
 * resolved from a validated share token (the public quote page).
 */
export async function loadQuoteBundle(
  quoteId: string,
  ctx: TenantCtx
): Promise<(QuotePdfData & { tenantId: string }) | null> {
  return withTenant(ctx, async ({ raw: sql }) => {
    const [q] = await sql`
      select q.*, c.name as c_name, c.billing_address as c_addr, c.gstin as c_gstin, c.phone as c_phone,
             b.display_name, b.primary_color, b.gstin as b_gstin, b.address as b_addr, b.phone as b_phone,
             b.email as b_email, b.bank_name, b.bank_account, b.bank_ifsc, b.upi_id, b.signature_name,
             b.terms, b.footer_note, b.powered_by_heseos
      from quotations q
      join customers c on c.id = q.customer_id
      join branding_profiles b on b.tenant_id = q.tenant_id
      where q.id = ${quoteId}`;
    if (!q) return null;

    const items = await sql`select * from quote_items where quotation_id = ${quoteId} order by position`;
    const fmt = (d: Date | string | null) =>
      d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;

    return {
      tenantId: q.tenant_id as string,
      brand: {
        displayName: q.display_name, primaryColor: q.primary_color, gstin: q.b_gstin,
        address: q.b_addr, phone: q.b_phone, email: q.b_email,
        bankName: q.bank_name, bankAccount: q.bank_account, bankIfsc: q.bank_ifsc,
        upiId: q.upi_id, signatureName: q.signature_name, terms: q.terms,
        footerNote: q.footer_note, poweredByHeseos: q.powered_by_heseos,
      },
      quote: {
        number: q.number, title: q.title, revision: q.current_revision,
        date: fmt(q.created_at) ?? "", validUntil: fmt(q.valid_until),
        subtotal: Number(q.subtotal), discountTotal: Number(q.discount_total),
        cgst: Number(q.cgst), sgst: Number(q.sgst), igst: Number(q.igst),
        grandTotal: Number(q.grand_total),
      },
      customer: { name: q.c_name, address: q.c_addr, gstin: q.c_gstin, phone: q.c_phone },
      items: items.map((it) => ({
        description: it.description, hsn: it.hsn_code, unit: it.unit,
        quantity: Number(it.quantity), rate: Number(it.rate),
        discountPct: Number(it.discount_pct), gstRatePct: Number(it.gst_rate_pct),
        lineTotal: Number(it.line_total),
      })),
    };
  });
}
