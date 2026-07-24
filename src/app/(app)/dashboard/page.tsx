import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { overview, drilldown, statusFunnel, channelRanking, ageing, topPerformers } from "@/lib/analytics";
import { fmtINR } from "@/lib/money";
import { StatCard, Money, StatusBadge } from "@/components/ui";
import { withTenant } from "@/db";

export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = {
  zone: "Zones", state: "States", city: "Cities", tenant: "Organizations", employee: "Team",
};
const LEVEL_SINGULAR: Record<string, string> = {
  zone: "Zone", state: "State", city: "City", tenant: "Organization", employee: "Team member",
};

export default async function Dashboard(props: {
  searchParams: Promise<{ zone?: string; state?: string; city?: string; tenant?: string; tenantName?: string }>;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const drill = { zoneId: sp.zone, stateId: sp.state, cityId: sp.city, tenantId: sp.tenant };
  const isLeadership = user.scope === "global";

  const [ov, dd, funnel, channels, age, leaders] = await Promise.all([
    overview(user, drill),
    drilldown(user, drill),
    statusFunnel(user, drill),
    channelRanking(user),
    ageing(user),
    topPerformers(user),
  ]);

  const conv = Number(ov.total_quotes) > 0
    ? ((Number(ov.won_count) / Number(ov.total_quotes)) * 100).toFixed(1)
    : "0.0";

  const crumbs: { label: string; href: string }[] = [{ label: "India", href: "/dashboard" }];
  if (sp.zone) crumbs.push({ label: sp.zone, href: `/dashboard?zone=${sp.zone}` });
  if (sp.state) crumbs.push({ label: sp.state, href: `/dashboard?zone=${sp.zone}&state=${sp.state}` });
  if (sp.city) crumbs.push({ label: sp.city, href: `/dashboard?zone=${sp.zone}&state=${sp.state}&city=${sp.city}` });
  if (sp.tenant) crumbs.push({
    label: sp.tenantName || sp.tenant,
    href: `/dashboard?zone=${sp.zone}&state=${sp.state}&city=${sp.city}&tenant=${sp.tenant}`,
  });

  const drillHref = (key: string, name?: string) => {
    if (dd.level === "zone") return `/dashboard?zone=${key}`;
    if (dd.level === "state") return `/dashboard?zone=${sp.zone}&state=${key}`;
    if (dd.level === "city") return `/dashboard?zone=${sp.zone}&state=${sp.state}&city=${key}`;
    if (dd.level === "tenant") {
      return `/dashboard?zone=${sp.zone ?? ""}&state=${sp.state ?? ""}&city=${sp.city ?? ""}&tenant=${key}&tenantName=${encodeURIComponent(name ?? "")}`;
    }
    return `/quotes`;
  };

  // recent activity feed
  const recent = await withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => sql`
    select e.type, e.created_at, q.number, q.id as quote_id, t.name as tenant_name
    from quote_events e
    join quotations q on q.id = e.quotation_id
    join tenants t on t.id = e.tenant_id
    where true
    order by e.created_at desc limit 8`);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {isLeadership ? "Command Center" : "Dashboard"}
          </h1>
          {isLeadership ? (
            <nav className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
              {crumbs.map((c, i) => (
                <span key={c.href} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-ink-300">→</span>}
                  <Link href={c.href} className="font-semibold capitalize text-brand-600 hover:underline">{c.label}</Link>
                </span>
              ))}
            </nav>
          ) : (
            <p className="text-sm text-ink-500">{user.tenantName} — your pipeline at a glance</p>
          )}
        </div>
        {!isLeadership && <Link href="/quotes/new" className="btn-primary">+ New Quotation</Link>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Quotation value" value={fmtINR(Number(ov.total_value), { compact: true })} sub={`${ov.total_quotes} quotes`} accent />
        <StatCard label="Pipeline (open)" value={fmtINR(Number(ov.pipeline_value), { compact: true })} sub={`${ov.open_count} active`} />
        <StatCard label="Won" value={fmtINR(Number(ov.won_value), { compact: true })} sub={`${ov.won_count} converted`} />
        <StatCard label="Conversion" value={`${conv}%`} sub={`${ov.lost_count} lost`} />
        <StatCard label="Avg ticket" value={fmtINR(Number(ov.avg_ticket), { compact: true })} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {dd.rows.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
                <h3 className="text-sm font-bold">
                  {isLeadership ? `Drilldown — ${LEVEL_LABEL[dd.level]}` : "Your team"}
                </h3>
                {isLeadership && dd.level !== "employee" && <span className="text-xs text-ink-400">click to drill</span>}
              </div>
              <table className="table-base">
                <thead>
                  <tr><th>{LEVEL_SINGULAR[dd.level] ?? "Group"}</th>
                    <th className="text-right">Quotes</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">Pipeline</th>
                    <th className="text-right">Won</th></tr>
                </thead>
                <tbody>
                  {dd.rows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        {isLeadership && dd.level !== "employee" ? (
                          <Link href={drillHref(r.key, r.name)} className="font-semibold text-brand-600 hover:underline">
                            {r.name}
                          </Link>
                        ) : (
                          <span className="font-semibold">{r.name}</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{r.quotes}</td>
                      <td className="text-right font-semibold"><Money paise={Number(r.value)} /></td>
                      <td className="text-right"><Money paise={Number(r.pipeline)} /></td>
                      <td className="text-right tabular-nums">{r.won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isLeadership && channels.length > 0 && (
            <div className="card overflow-hidden">
              <div className="border-b border-ink-100 px-5 py-3"><h3 className="text-sm font-bold">Channel contribution</h3></div>
              <table className="table-base">
                <thead><tr><th>Channel</th><th className="text-right">Quotes</th><th className="text-right">Value</th><th className="text-right">Won</th></tr></thead>
                <tbody>
                  {channels.map((c) => (
                    <tr key={c.type}>
                      <td className="font-semibold capitalize">{c.type === "si" ? "System Integrator" : c.type}</td>
                      <td className="text-right tabular-nums">{c.quotes}</td>
                      <td className="text-right font-semibold"><Money paise={Number(c.value)} /></td>
                      <td className="text-right tabular-nums">{c.won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {isLeadership && leaders.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-bold">Top performers — PAN-India</h3>
              <ol className="space-y-2">
                {leaders.map((p, i) => (
                  <li key={p.id ?? i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 font-bold text-ink-500">{i + 1}</span>
                      <span>
                        <span className="font-semibold text-ink-800">{p.name}</span>
                        <span className="ml-1.5 text-ink-400">{p.tenant_name}</span>
                      </span>
                    </span>
                    <span className="text-right font-semibold tabular-nums"><Money paise={Number(p.won_value)} /></span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold">Funnel</h3>
            <div className="space-y-2">
              {["draft", "shared", "viewed", "negotiation", "approved", "converted", "lost"].map((st) => {
                const row = funnel.find((f) => f.status === st);
                const n = Number(row?.n ?? 0);
                const max = Math.max(...funnel.map((f) => Number(f.n)), 1);
                return (
                  <Link key={st} href={`/quotes?status=${st}`} className="block">
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="capitalize text-ink-700">{st}</span>
                      <span className="font-semibold tabular-nums">{n}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(n / max) * 100}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold">Open-quote ageing</h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              {["0-3d", "3-7d", "7-15d", "15d+"].map((b) => {
                const row = age.find((a) => a.bucket === b);
                const warn = b === "15d+" && Number(row?.n ?? 0) > 0;
                return (
                  <div key={b} className={`rounded-lg p-2 ${warn ? "bg-rose-50" : "bg-ink-50"}`}>
                    <p className={`text-lg font-extrabold tabular-nums ${warn ? "text-rose-600" : ""}`}>{row?.n ?? 0}</p>
                    <p className="text-[10px] text-ink-500">{b}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold">Live activity</h3>
            <ol className="space-y-2">
              {recent.map((e, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <StatusBadge status={e.type === "created" ? "draft" : e.type === "accepted_online" ? "approved" : e.type} />
                  <Link href={`/quotes/${e.quote_id}`} className="font-semibold text-brand-600 hover:underline">{e.number}</Link>
                  {isLeadership && <span className="truncate text-ink-400">{e.tenant_name}</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
