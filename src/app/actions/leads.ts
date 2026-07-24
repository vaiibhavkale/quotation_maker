"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withTenant } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

const LeadSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  source: z.enum(["referral", "website", "walk_in", "cold_call", "partner"]).default("referral"),
  notes: z.string().optional().default(""),
  assignedToId: z.string().optional().default(""),
});

export async function createLead(form: FormData) {
  const user = await requireUser();
  const data = LeadSchema.parse(Object.fromEntries(form));

  const leadId = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    const [row] = await sql`
      insert into leads (tenant_id, name, phone, email, source, notes, assigned_to_id)
      values (
        ${user.tenantId}, ${data.name}, ${data.phone || null}, ${data.email || null},
        ${data.source}, ${data.notes || null}, ${data.assignedToId || null}
      ) returning id`;
    return row.id as string;
  });

  await audit(user.tenantId, user.id, "lead", leadId, "create");
  revalidatePath("/leads");
  redirect(`/leads/${leadId}`);
}

const VisitSchema = z.object({
  scheduledAt: z.string().min(1),
  engineerId: z.string().optional().default(""),
});

export async function scheduleSiteVisit(leadId: string, form: FormData) {
  const user = await requireUser();
  const data = VisitSchema.parse(Object.fromEntries(form));

  await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    await sql`
      insert into site_visits (tenant_id, lead_id, scheduled_at, engineer_id, status)
      values (${user.tenantId}, ${leadId}, ${new Date(data.scheduledAt)}, ${data.engineerId || null}, 'scheduled')`;
    await sql`update leads set status = 'site_visit_scheduled', updated_at = now() where id = ${leadId}`;
  });

  await audit(user.tenantId, user.id, "lead", leadId, "schedule_visit");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function completeSiteVisit(visitId: string, leadId: string, notes: string) {
  const user = await requireUser();

  await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    await sql`update site_visits set status = 'completed', completed_at = now(), notes = ${notes || null} where id = ${visitId}`;
    await sql`update leads set status = 'site_visit_done', updated_at = now() where id = ${leadId}`;
  });

  await audit(user.tenantId, user.id, "lead", leadId, "complete_visit");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function dropLead(leadId: string, reason: string) {
  const user = await requireUser();

  await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    await sql`update leads set status = 'dropped', drop_reason = ${reason || "Not specified"}, updated_at = now() where id = ${leadId}`;
  });

  await audit(user.tenantId, user.id, "lead", leadId, "drop", { reason });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

const ConvertSchema = z.object({
  projectName: z.string().min(2),
  address: z.string().optional().default(""),
  stateId: z.string().min(1),
  cityId: z.string().optional().default(""),
  gstin: z.string().optional().default(""),
});

/**
 * Lead → Customer (created if this lead hasn't converted before) → Project.
 * Lands directly in the quote builder, pre-linked to both — the full
 * Lead → Site Visit → Project → Quote → Order chain the PRD describes.
 */
export async function convertLeadToProject(leadId: string, form: FormData) {
  const user = await requireUser();
  const data = ConvertSchema.parse(Object.fromEntries(form));

  const { projectId, customerId } = await withTenant(
    { tenantId: user.tenantId, scope: "tenant" },
    async ({ raw: sql }) => {
      const [lead] = await sql`select * from leads where id = ${leadId} limit 1`;
      if (!lead) throw new Error("Lead not found");

      let customerId = lead.customer_id as string | null;
      if (!customerId) {
        const [customer] = await sql`
          insert into customers (tenant_id, name, contact_name, phone, email, gstin, billing_address, state_id, city_id)
          values (
            ${user.tenantId}, ${lead.name}, ${lead.name}, ${lead.phone}, ${lead.email},
            ${data.gstin || null}, ${data.address || null}, ${data.stateId}, ${data.cityId || null}
          ) returning id`;
        customerId = customer.id as string;
      }

      const [project] = await sql`
        insert into projects (tenant_id, customer_id, lead_id, name, address, status)
        values (${user.tenantId}, ${customerId}, ${leadId}, ${data.projectName}, ${data.address || null}, 'active')
        returning id`;

      await sql`update leads set status = 'converted', customer_id = ${customerId}, updated_at = now() where id = ${leadId}`;

      return { projectId: project.id as string, customerId };
    }
  );

  await audit(user.tenantId, user.id, "lead", leadId, "convert", { projectId, customerId });
  revalidatePath("/leads");
  revalidatePath("/projects");
  redirect(`/quotes/new?projectId=${projectId}&customerId=${customerId}`);
}
