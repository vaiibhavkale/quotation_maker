"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant, schema } from "@/db";
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

  await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async (tx) => {
    await tx.insert(schema.customers).values({
      tenantId: user.tenantId,
      name: data.name,
      contactName: data.contactName || null,
      phone: data.phone || null,
      email: data.email || null,
      gstin: data.gstin || null,
      billingAddress: data.billingAddress || null,
      stateId: data.stateId,
      cityId: data.cityId || null,
    });
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

  await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async (tx) => {
    await tx.update(schema.brandingProfiles).set({
      displayName: data.displayName,
      primaryColor: data.primaryColor,
      gstin: data.gstin || null,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
      bankName: data.bankName || null,
      bankAccount: data.bankAccount || null,
      bankIfsc: data.bankIfsc || null,
      upiId: data.upiId || null,
      signatureName: data.signatureName || null,
      terms: data.terms || null,
      footerNote: data.footerNote || null,
    }).where(eq(schema.brandingProfiles.tenantId, user.tenantId));
  });
  revalidatePath("/settings/branding");
  revalidatePath("/", "layout");
}
