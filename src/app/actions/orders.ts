"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ORDER_STAGES, type OrderStage } from "@/lib/order-lifecycle";

export async function advanceOrderStage(orderId: string, to: OrderStage) {
  const user = await requireUser();

  await withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    const [order] = await sql`select * from orders where id = ${orderId} limit 1`;
    if (!order) throw new Error("Order not found");

    const curIdx = ORDER_STAGES.indexOf(order.stage as OrderStage);
    const toIdx = ORDER_STAGES.indexOf(to);
    if (toIdx !== curIdx + 1) throw new Error(`Cannot skip stages: ${order.stage} → ${to}`);

    await sql`update orders set stage = ${to}, updated_at = now() where id = ${orderId}`;
    await sql`insert into order_events (tenant_id, order_id, type, actor_id)
      values (${order.tenant_id}, ${orderId}, ${to}, ${user.id})`;
  });

  await audit(user.tenantId, user.id, "order", orderId, `stage:${to}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

const AdvanceSchema = z.object({ amount: z.coerce.number().positive() });

export async function recordAdvancePayment(orderId: string, form: FormData) {
  const user = await requireUser();
  const data = AdvanceSchema.parse(Object.fromEntries(form));
  const paise = Math.round(data.amount * 100);

  await withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    const [order] = await sql`select * from orders where id = ${orderId} limit 1`;
    if (!order) throw new Error("Order not found");

    await sql`update orders set advance_received = advance_received + ${paise}, updated_at = now() where id = ${orderId}`;
    await sql`insert into order_events (tenant_id, order_id, type, actor_id, meta)
      values (${order.tenant_id}, ${orderId}, 'advance_recorded', ${user.id}, ${JSON.stringify({ amount: paise })})`;
  });

  await audit(user.tenantId, user.id, "order", orderId, "advance_payment", { amount: paise });
  revalidatePath(`/orders/${orderId}`);
}
