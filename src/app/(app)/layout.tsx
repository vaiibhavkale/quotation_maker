import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut, type SessionUser } from "@/lib/auth";
import { getSql } from "@/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = (session as unknown as { user?: SessionUser } | null)?.user;
  if (!user) redirect("/login");

  const sql = getSql();
  const [brand] = await sql`
    select display_name, primary_color, powered_by_heseos
    from branding_profiles where tenant_id = ${user.tenantId}`;
  const color = (brand?.primary_color as string) ?? "#E8821E";
  const isLeadership = user.scope === "global";

  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: "◧" },
    { href: "/quotes", label: "Quotations", icon: "▤" },
    ...(isLeadership ? [] : [{ href: "/customers", label: "Customers", icon: "◉" }]),
    { href: "/ask", label: "Ask HIQM", icon: "✦" },
    ...(user.role === "partner_admin" ? [{ href: "/settings/branding", label: "Branding", icon: "◨" }] : []),
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-ink-200 bg-white">
        <div className="border-b border-ink-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-extrabold text-white"
              style={{ backgroundColor: color }}
            >
              {(brand?.display_name as string ?? "H").slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{brand?.display_name ?? user.tenantName}</p>
              <p className="text-[11px] text-ink-500 capitalize">{user.role.replace("_", " ")}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-100"
            >
              <span className="text-ink-400">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-ink-100 p-3">
          {brand?.powered_by_heseos && (
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              Powered by <span className="text-brand-600">HESEOS</span>
            </p>
          )}
          <div className="flex items-center justify-between px-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{user.name}</p>
              <p className="truncate text-[11px] text-ink-500">{user.email}</p>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="btn-ghost px-2 py-1 text-xs">Exit</button>
            </form>
          </div>
        </div>
      </aside>

      <main className="ml-60 flex-1 p-8">{children}</main>
    </div>
  );
}
