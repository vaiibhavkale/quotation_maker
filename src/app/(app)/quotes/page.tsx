import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSql } from "@/db";
import { Money, StatusBadge, EmptyState } from "@/components/ui";
import { STATUSES } from "@/lib/lifecycle";

export const dynamic = "force-dynamic";

export default async function QuotesPage(props: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { status, q } = await props.searchParams;
  const sql = getSql();

  const rows = await sql`
    select q.id, q.number, q.title, q.status, q.grand_total, q.current_revision,
           q.created_at, q.updated_at, c.name as customer_name, t.name as tenant_name
    from quotations q
    join customers c on c.id = q.customer_id
    join tenants t on t.id = q.tenant_id
    where ${user.scope === "global" ? sql`true` : sql`q.tenant_id = ${user.tenantId}`}
      ${status && (STATUSES as readonly string[]).includes(status) ? sql`and q.status = ${status}` : sql``}
      ${q ? sql`and (q.number ilike ${"%" + q + "%"} or q.title ilike ${"%" + q + "%"} or c.name ilike ${"%" + q + "%"})` : sql``}
    order by q.updated_at desc
    limit 100`;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Quotations</h1>
          <p className="text-sm text-ink-500">{rows.length} shown · sorted by activity</p>
        </div>
        {user.scope !== "global" && (
          <Link href="/quotes/new" className="btn-primary">+ New Quotation</Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/quotes" className={`btn-secondary px-3 py-1.5 text-xs ${!status ? "border-brand-500 text-brand-600" : ""}`}>All</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/quotes?status=${s}`}
            className={`btn-secondary px-3 py-1.5 text-xs capitalize ${status === s ? "border-brand-500 text-brand-600" : ""}`}>
            {s}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No quotations yet" hint="Create your first quote — it takes under two minutes." />
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Customer</th>
                {user.scope === "global" && <th>Partner</th>}
                <th>Status</th>
                <th className="text-right">Value</th>
                <th>Rev</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/quotes/${r.id}`} className="font-semibold text-brand-600 hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="max-w-[220px] truncate">{r.title}</td>
                  <td className="max-w-[180px] truncate">{r.customer_name}</td>
                  {user.scope === "global" && <td className="max-w-[160px] truncate text-ink-500">{r.tenant_name}</td>}
                  <td><StatusBadge status={r.status} /></td>
                  <td className="text-right font-semibold"><Money paise={Number(r.grand_total)} /></td>
                  <td className="text-ink-500">R{r.current_revision}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
