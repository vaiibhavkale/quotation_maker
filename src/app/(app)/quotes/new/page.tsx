import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSql } from "@/db";
import { QuoteBuilder } from "@/components/quote-builder";

export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const user = await requireUser();
  const sql = getSql();

  const customers = await sql`
    select id, name, state_id from customers
    where tenant_id = ${user.tenantId} order by name`;
  const [tenant] = await sql`select state_id from tenants where id = ${user.tenantId}`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">New Quotation</h1>
        <p className="text-sm text-ink-500">
          Manual BOQ builder · quick-add from catalogue ·{" "}
          {customers.length === 0 && (
            <Link className="text-brand-600 underline" href="/customers">add a customer first</Link>
          )}
        </p>
      </div>
      <QuoteBuilder
        customers={customers.map((c) => ({ id: c.id, name: c.name, stateId: c.state_id }))}
        sellerStateId={tenant?.state_id ?? null}
      />
    </div>
  );
}
