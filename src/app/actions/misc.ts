"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/db";
import { requireUser } from "@/lib/auth";

const CustomerSchema = z.object({
  name: z.string().min(2),
  contactName: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  gstin: z.string().optional().default(""),
  billingAddress: z.string().optional().default(""),
  stateId: z.string().min(1),
  cityId: z.string().optional().default(""),
});

export async function createCustomer(form: FormData) {
  const user = await requireUser();
  const data = CustomerSchema.parse(Object.fromEntries(form));

  await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    await sql`
      insert into customers (tenant_id, name, contact_name, phone, email, gstin, billing_address, state_id, city_id)
      values (
        ${user.tenantId}, ${data.name}, ${data.contactName || null}, ${data.phone || null},
        ${data.email || null}, ${data.gstin || null}, ${data.billingAddress || null},
        ${data.stateId}, ${data.cityId || null}
      )`;
  });
  revalidatePath("/customers");
}

const BrandingSchema = z.object({
  displayName: z.string().min(2),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  gstin: z.string().optional().default(""),
  address: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  bankName: z.string().optional().default(""),
  bankAccount: z.string().optional().default(""),
  bankIfsc: z.string().optional().default(""),
  upiId: z.string().optional().default(""),
  signatureName: z.string().optional().default(""),
  terms: z.string().optional().default(""),
  footerNote: z.string().optional().default(""),
});

export async function updateBranding(form: FormData) {
  const user = await requireUser();
  if (!["partner_admin", "super_admin"].includes(user.role)) throw new Error("FORBIDDEN");
  const data = BrandingSchema.parse(Object.fromEntries(form));

  await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    await sql`
      update branding_profiles set
        display_name = ${data.displayName}, primary_color = ${data.primaryColor},
        gstin = ${data.gstin || null}, address = ${data.address || null}, phone = ${data.phone || null},
        email = ${data.email || null}, bank_name = ${data.bankName || null}, bank_account = ${data.bankAccount || null},
        bank_ifsc = ${data.bankIfsc || null}, upi_id = ${data.upiId || null}, signature_name = ${data.signatureName || null},
        terms = ${data.terms || null}, footer_note = ${data.footerNote || null}
      where tenant_id = ${user.tenantId}`;
  });
  revalidatePath("/settings/branding");
  revalidatePath("/", "layout");
}
