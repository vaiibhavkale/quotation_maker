import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSql, withTenant } from "@/db";
import { QuoteBuilder } from "@/components/quote-builder";

export const dynamic = "force-dynamic";

export default async function NewQuotePage(props: {
  searchParams: Promise<{ projectId?: string; customerId?: string }>;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;

  const { customers, projects } = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    const customerRows = await sql`
      select id, name, state_id from customers
      where tenant_id = ${user.tenantId} order by name`;
    const projectRows = await sql`
      select id, name, customer_id from projects
      where tenant_id = ${user.tenantId} and status = 'active' order by created_at desc`;
    return { customers: customerRows, projects: projectRows };
  });
  const [tenant] = await getSql()`select state_id from tenants where id = ${user.tenantId}`;

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
        projects={projects.map((p) => ({ id: p.id, name: p.name, customerId: p.customer_id }))}
        sellerStateId={tenant?.state_id ?? null}
        initialCustomerId={sp.customerId}
        initialProjectId={sp.projectId}
      />
    </div>
  );
}
