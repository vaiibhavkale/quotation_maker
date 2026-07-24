"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { eq, and, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import { withTenant, getSql, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { computeTotals } from "@/lib/gst";
import { canTransition, currentFY, type QuoteStatus } from "@/lib/lifecycle";

const ItemSchema = z.object({
  description: z.string().min(1),
  hsnCode: z.string().optional().default(""),
  unit: z.string().default("nos"),
  quantity: z.coerce.number().positive(),      // human units
  rate: z.coerce.number().nonnegative(),       // rupees
  discountPct: z.coerce.number().min(0).max(100).default(0),
  gstRatePct: z.coerce.number().min(0).max(28).default(18),
});

const QuoteSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(2),
  validDays: z.coerce.number().min(1).max(90).default(15),
  items: z.array(ItemSchema).min(1),
});

async function audit(tenantId: string, actorId: string, entity: string, entityId: string, action: string, detail?: unknown) {
  const sqlc = getSql();
  await sqlc`insert into audit_logs (tenant_id, actor_id, entity, entity_id, action, detail)
    values (${tenantId}, ${actorId}, ${entity}, ${entityId}, ${action}, ${JSON.stringify(detail ?? {})})`;
}

export async function createQuote(payload: z.infer<typeof QuoteSchema>) {
  const user = await requireUser();
  const data = QuoteSchema.parse(payload);

  const quoteId = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async (tx) => {
    const [tenant] = await getSql()`select state_id from tenants where id = ${user.tenantId}`;
    const [customer] = await tx.select().from(schema.customers)
      .where(eq(schema.customers.id, data.customerId)).limit(1);
    if (!customer) throw new Error("Customer not found");

    const interState = Boolean(customer.stateId && tenant.state_id && customer.stateId !== tenant.state_id);
    const items = data.items.map((it) => ({
      quantity: Math.round(it.quantity * 100),
      rate: Math.round(it.rate * 100),
      discountPct: Math.round(it.discountPct * 100),
      gstRatePct: Math.round(it.gstRatePct * 100),
    }));
    const totals = computeTotals(items, interState);

    // per-tenant FY sequence
    const fy = currentFY();
    const seqRows = await tx.execute(dsql`
      insert into quote_sequences (tenant_id, fy, last_value) values (${user.tenantId}, ${fy}, 1)
      on conflict (tenant_id, fy) do update set last_value = quote_sequences.last_value + 1
      returning last_value`);
    const seq = Number((seqRows as unknown as { last_value: number }[])[0].last_value);
    const number = `${user.tenantSlug.toUpperCase()}/QT/${fy}/${String(seq).padStart(5, "0")}`;

    const [q] = await tx.insert(schema.quotations).values({
      tenantId: user.tenantId,
      customerId: data.customerId,
      createdById: user.id,
      number,
      title: data.title,
      status: "draft",
      placeOfSupplyStateId: customer.stateId,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      grandTotal: totals.grandTotal,
      validUntil: new Date(Date.now() + data.validDays * 864e5),
    }).returning({ id: schema.quotations.id });

    await tx.insert(schema.quoteItems).values(data.items.map((it, i) => ({
      tenantId: user.tenantId,
      quotationId: q.id,
      position: i,
      description: it.description,
      hsnCode: it.hsnCode || null,
      unit: it.unit,
      quantity: items[i].quantity,
      rate: items[i].rate,
      discountPct: items[i].discountPct,
      gstRatePct: items[i].gstRatePct,
      lineTotal: totals.lineTotals[i],
    })));

    await tx.insert(schema.quoteRevisions).values({
      tenantId: user.tenantId, quotationId: q.id, revisionNo: 1,
      snapshot: { number, title: data.title, items: data.items, totals },
      createdById: user.id,
    });

    await tx.insert(schema.quoteEvents).values({
      tenantId: user.tenantId, quotationId: q.id, type: "created", actorId: user.id,
    });

    return q.id;
  });

  await audit(user.tenantId, user.id, "quotation", quoteId, "create");
  revalidatePath("/quotes");
  redirect(`/quotes/${quoteId}`);
}

export async function transitionQuote(quoteId: string, to: QuoteStatus, reason?: string) {
  const user = await requireUser();

  await withTenant({ tenantId: user.tenantId, scope: user.scope }, async (tx) => {
    const [q] = await tx.select().from(schema.quotations).where(eq(schema.quotations.id, quoteId)).limit(1);
    if (!q) throw new Error("Quote not found");
    if (!canTransition(q.status as QuoteStatus, to)) {
      throw new Error(`Invalid transition ${q.status} → ${to}`);
    }
    await tx.update(schema.quotations)
      .set({ status: to, updatedAt: new Date(), ...(to === "lost" ? { lostReason: reason ?? "Not specified" } : {}) })
      .where(eq(schema.quotations.id, quoteId));
    await tx.insert(schema.quoteEvents).values({
      tenantId: q.tenantId, quotationId: quoteId, type: to, actorId: user.id,
      meta: reason ? { reason } : null,
    });
  });

  await audit(user.tenantId, user.id, "quotation", quoteId, `status:${to}`, { reason });
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/quotes");
}

/** Creates a new immutable revision from edited items, then re-shares. */
export async function reviseQuote(quoteId: string, payload: z.infer<typeof QuoteSchema>, reason: string) {
  const user = await requireUser();
  const data = QuoteSchema.parse(payload);

  await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async (tx) => {
    const [q] = await tx.select().from(schema.quotations).where(eq(schema.quotations.id, quoteId)).limit(1);
    if (!q) throw new Error("Quote not found");

    const [tenant] = await getSql()`select state_id from tenants where id = ${user.tenantId}`;
    const [customer] = await tx.select().from(schema.customers).where(eq(schema.customers.id, q.customerId)).limit(1);
    const interState = Boolean(customer?.stateId && tenant.state_id && customer.stateId !== tenant.state_id);

    const items = data.items.map((it) => ({
      quantity: Math.round(it.quantity * 100),
      rate: Math.round(it.rate * 100),
      discountPct: Math.round(it.discountPct * 100),
      gstRatePct: Math.round(it.gstRatePct * 100),
    }));
    const totals = computeTotals(items, interState);
    const nextRev = q.currentRevision + 1;

    await tx.delete(schema.quoteItems).where(eq(schema.quoteItems.quotationId, quoteId));
    await tx.insert(schema.quoteItems).values(data.items.map((it, i) => ({
      tenantId: user.tenantId, quotationId: quoteId, position: i,
      description: it.description, hsnCode: it.hsnCode || null, unit: it.unit,
      quantity: items[i].quantity, rate: items[i].rate,
      discountPct: items[i].discountPct, gstRatePct: items[i].gstRatePct,
      lineTotal: totals.lineTotals[i],
    })));

    await tx.update(schema.quotations).set({
      title: data.title,
      currentRevision: nextRev,
      status: "shared",
      subtotal: totals.subtotal, discountTotal: totals.discountTotal,
      cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst, grandTotal: totals.grandTotal,
      updatedAt: new Date(),
    }).where(eq(schema.quotations.id, quoteId));

    await tx.insert(schema.quoteRevisions).values({
      tenantId: user.tenantId, quotationId: quoteId, revisionNo: nextRev,
      snapshot: { title: data.title, items: data.items, totals }, reason, createdById: user.id,
    });
    await tx.insert(schema.quoteEvents).values({
      tenantId: user.tenantId, quotationId: quoteId, type: "revised", actorId: user.id, meta: { revision: nextRev, reason },
    });
  });

  await audit(user.tenantId, user.id, "quotation", quoteId, "revise", { reason });
  revalidatePath(`/quotes/${quoteId}`);
}

export async function createShare(quoteId: string, channel: "whatsapp" | "email" | "link") {
  const user = await requireUser();
  const token = randomBytes(18).toString("base64url");

  await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async (tx) => {
    const [q] = await tx.select().from(schema.quotations).where(eq(schema.quotations.id, quoteId)).limit(1);
    if (!q) throw new Error("Quote not found");

    await tx.insert(schema.quoteShares).values({
      tenantId: user.tenantId, quotationId: quoteId, token, channel,
      expiresAt: new Date(Date.now() + 30 * 864e5),
    });
    if (q.status === "draft") {
      await tx.update(schema.quotations).set({ status: "shared", updatedAt: new Date() })
        .where(and(eq(schema.quotations.id, quoteId), eq(schema.quotations.status, "draft")));
      await tx.insert(schema.quoteEvents).values({
        tenantId: user.tenantId, quotationId: quoteId, type: "shared", actorId: user.id, meta: { channel },
      });
    }
  });

  await audit(user.tenantId, user.id, "quotation", quoteId, "share", { channel });
  revalidatePath(`/quotes/${quoteId}`);
  return token;
}
