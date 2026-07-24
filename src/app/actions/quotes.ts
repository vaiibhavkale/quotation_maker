"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { withTenant, getSql } from "@/db";
import { requireUser } from "@/lib/auth";
import { computeTotals } from "@/lib/gst";
import { canTransition, currentFY, type QuoteStatus } from "@/lib/lifecycle";
import { requiresDealDeskApproval, canApproveDeals, dealDeskReason } from "@/lib/deal-desk";
import { notify } from "@/lib/notifications";

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
  projectId: z.string().uuid().optional(),
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

  const quoteId = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    const [tenant] = await sql`select state_id from tenants where id = ${user.tenantId}`;
    const [customer] = await sql`select * from customers where id = ${data.customerId} limit 1`;
    if (!customer) throw new Error("Customer not found");

    const interState = Boolean(customer.state_id && tenant.state_id && customer.state_id !== tenant.state_id);
    const items = data.items.map((it) => ({
      quantity: Math.round(it.quantity * 100),
      rate: Math.round(it.rate * 100),
      discountPct: Math.round(it.discountPct * 100),
      gstRatePct: Math.round(it.gstRatePct * 100),
    }));
    const totals = computeTotals(items, interState);
    const discPct = totals.subtotal > 0 ? (totals.discountTotal / totals.subtotal) * 100 : 0;
    const needsApproval = requiresDealDeskApproval({ discountPct: discPct, grandTotal: totals.grandTotal });

    // per-tenant FY sequence
    const fy = currentFY();
    const [seqRow] = await sql`
      insert into quote_sequences (tenant_id, fy, last_value) values (${user.tenantId}, ${fy}, 1)
      on conflict (tenant_id, fy) do update set last_value = quote_sequences.last_value + 1
      returning last_value`;
    const seq = Number(seqRow.last_value);
    const number = `${user.tenantSlug.toUpperCase()}/QT/${fy}/${String(seq).padStart(5, "0")}`;
    const validUntil = new Date(Date.now() + data.validDays * 864e5);

    const [q] = await sql`
      insert into quotations (
        tenant_id, customer_id, project_id, created_by_id, number, title, status,
        place_of_supply_state_id, subtotal, discount_total, cgst, sgst, igst, grand_total, valid_until,
        needs_approval
      ) values (
        ${user.tenantId}, ${data.customerId}, ${data.projectId ?? null}, ${user.id}, ${number}, ${data.title}, 'draft',
        ${customer.state_id}, ${totals.subtotal}, ${totals.discountTotal}, ${totals.cgst}, ${totals.sgst},
        ${totals.igst}, ${totals.grandTotal}, ${validUntil}, ${needsApproval}
      ) returning id`;

    if (needsApproval) {
      const reason = dealDeskReason({ discountPct: discPct, grandTotal: totals.grandTotal }) ?? "Exceeds self-serve limit";
      await notify(sql, {
        tenantId: user.tenantId, userId: null, type: "approval_needed",
        title: `${number} needs deal-desk approval`, body: reason,
        link: `/quotes/${q.id}`, dedupeKey: `approval:${q.id}`,
      });
    }

    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      await sql`
        insert into quote_items (
          tenant_id, quotation_id, position, description, hsn_code, unit,
          quantity, rate, discount_pct, gst_rate_pct, line_total
        ) values (
          ${user.tenantId}, ${q.id}, ${i}, ${it.description}, ${it.hsnCode || null}, ${it.unit},
          ${items[i].quantity}, ${items[i].rate}, ${items[i].discountPct}, ${items[i].gstRatePct}, ${totals.lineTotals[i]}
        )`;
    }

    await sql`
      insert into quote_revisions (tenant_id, quotation_id, revision_no, snapshot, created_by_id)
      values (${user.tenantId}, ${q.id}, 1, ${JSON.stringify({ number, title: data.title, items: data.items, totals })}, ${user.id})`;

    await sql`
      insert into quote_events (tenant_id, quotation_id, type, actor_id)
      values (${user.tenantId}, ${q.id}, 'created', ${user.id})`;

    return q.id as string;
  });

  await audit(user.tenantId, user.id, "quotation", quoteId, "create");
  revalidatePath("/quotes");
  redirect(`/quotes/${quoteId}`);
}

export async function transitionQuote(quoteId: string, to: QuoteStatus, reason?: string) {
  const user = await requireUser();

  await withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    const [q] = await sql`select * from quotations where id = ${quoteId} limit 1`;
    if (!q) throw new Error("Quote not found");
    if (!canTransition(q.status as QuoteStatus, to)) {
      throw new Error(`Invalid transition ${q.status} → ${to}`);
    }

    if (to === "approved" && q.needs_approval && !q.approved_by_id && !canApproveDeals(user.role)) {
      throw new Error(
        "DEAL_DESK_APPROVAL_REQUIRED: this quote's discount/value exceeds the self-serve limit — only a partner admin or above can clear it"
      );
    }

    if (to === "lost") {
      await sql`update quotations set status = ${to}, updated_at = now(), lost_reason = ${reason ?? "Not specified"}
        where id = ${quoteId}`;
    } else if (to === "approved") {
      await sql`update quotations set status = ${to}, updated_at = now(), approved_by_id = ${user.id}
        where id = ${quoteId}`;
    } else {
      await sql`update quotations set status = ${to}, updated_at = now() where id = ${quoteId}`;
    }
    await sql`insert into quote_events (tenant_id, quotation_id, type, actor_id, meta)
      values (${q.tenant_id}, ${quoteId}, ${to}, ${user.id}, ${reason ? JSON.stringify({ reason }) : null})`;

    if (to === "converted") {
      const orderNumber = q.number.includes("/QT/")
        ? q.number.replace("/QT/", "/ORD/")
        : `${q.number}-ORD`;
      const [order] = await sql`
        insert into orders (tenant_id, quotation_id, order_number, stage)
        values (${q.tenant_id}, ${quoteId}, ${orderNumber}, 'production')
        on conflict (quotation_id) do nothing
        returning id`;
      if (order) {
        await sql`insert into order_events (tenant_id, order_id, type, actor_id)
          values (${q.tenant_id}, ${order.id}, 'created', ${user.id})`;
      }
    }
  });

  await audit(user.tenantId, user.id, "quotation", quoteId, `status:${to}`, { reason });
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/quotes");
}

/** Creates a new immutable revision from edited items, then re-shares. */
export async function reviseQuote(quoteId: string, payload: z.infer<typeof QuoteSchema>, reason: string) {
  const user = await requireUser();
  const data = QuoteSchema.parse(payload);

  await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    const [q] = await sql`select * from quotations where id = ${quoteId} limit 1`;
    if (!q) throw new Error("Quote not found");

    const [tenant] = await sql`select state_id from tenants where id = ${user.tenantId}`;
    const [customer] = await sql`select * from customers where id = ${q.customer_id} limit 1`;
    const interState = Boolean(customer?.state_id && tenant.state_id && customer.state_id !== tenant.state_id);

    const items = data.items.map((it) => ({
      quantity: Math.round(it.quantity * 100),
      rate: Math.round(it.rate * 100),
      discountPct: Math.round(it.discountPct * 100),
      gstRatePct: Math.round(it.gstRatePct * 100),
    }));
    const totals = computeTotals(items, interState);
    const nextRev = q.current_revision + 1;
    const discPct = totals.subtotal > 0 ? (totals.discountTotal / totals.subtotal) * 100 : 0;
    const needsApproval = requiresDealDeskApproval({ discountPct: discPct, grandTotal: totals.grandTotal });

    await sql`delete from quote_items where quotation_id = ${quoteId}`;
    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      await sql`
        insert into quote_items (
          tenant_id, quotation_id, position, description, hsn_code, unit,
          quantity, rate, discount_pct, gst_rate_pct, line_total
        ) values (
          ${user.tenantId}, ${quoteId}, ${i}, ${it.description}, ${it.hsnCode || null}, ${it.unit},
          ${items[i].quantity}, ${items[i].rate}, ${items[i].discountPct}, ${items[i].gstRatePct}, ${totals.lineTotals[i]}
        )`;
    }

    await sql`
      update quotations set
        title = ${data.title}, current_revision = ${nextRev}, status = 'shared',
        subtotal = ${totals.subtotal}, discount_total = ${totals.discountTotal},
        cgst = ${totals.cgst}, sgst = ${totals.sgst}, igst = ${totals.igst}, grand_total = ${totals.grandTotal},
        needs_approval = ${needsApproval}, approved_by_id = null,
        updated_at = now()
      where id = ${quoteId}`;

    await sql`
      insert into quote_revisions (tenant_id, quotation_id, revision_no, snapshot, reason, created_by_id)
      values (${user.tenantId}, ${quoteId}, ${nextRev}, ${JSON.stringify({ title: data.title, items: data.items, totals })}, ${reason}, ${user.id})`;
    await sql`
      insert into quote_events (tenant_id, quotation_id, type, actor_id, meta)
      values (${user.tenantId}, ${quoteId}, 'revised', ${user.id}, ${JSON.stringify({ revision: nextRev, reason })})`;

    if (needsApproval) {
      const dealReason = dealDeskReason({ discountPct: discPct, grandTotal: totals.grandTotal }) ?? "Exceeds self-serve limit";
      await notify(sql, {
        tenantId: user.tenantId, userId: null, type: "approval_needed",
        title: `${q.number} needs deal-desk approval`, body: dealReason,
        link: `/quotes/${quoteId}`, dedupeKey: `approval:${quoteId}:r${nextRev}`,
      });
    }
  });

  await audit(user.tenantId, user.id, "quotation", quoteId, "revise", { reason });
  revalidatePath(`/quotes/${quoteId}`);
}

export async function createShare(quoteId: string, channel: "whatsapp" | "email" | "link") {
  const user = await requireUser();
  const token = randomBytes(18).toString("base64url");

  await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    const [q] = await sql`select * from quotations where id = ${quoteId} limit 1`;
    if (!q) throw new Error("Quote not found");

    const expiresAt = new Date(Date.now() + 30 * 864e5);
    await sql`insert into quote_shares (tenant_id, quotation_id, token, channel, expires_at)
      values (${user.tenantId}, ${quoteId}, ${token}, ${channel}, ${expiresAt})`;

    if (q.status === "draft") {
      await sql`update quotations set status = 'shared', updated_at = now()
        where id = ${quoteId} and status = 'draft'`;
      await sql`insert into quote_events (tenant_id, quotation_id, type, actor_id, meta)
        values (${user.tenantId}, ${quoteId}, 'shared', ${user.id}, ${JSON.stringify({ channel })})`;
    }
  });

  await audit(user.tenantId, user.id, "quotation", quoteId, "share", { channel });
  revalidatePath(`/quotes/${quoteId}`);
  return token;
}
