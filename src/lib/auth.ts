import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getSql } from "@/db";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: string;
  scope: "tenant" | "global";
  geoScope: { zoneId?: string; stateId?: string; cityId?: string } | null;
};

const GLOBAL_ROLES = new Set(["super_admin", "ceo", "zone_manager", "state_manager"]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        const sql = getSql();
        const rows = await sql`
          select u.id, u.email, u.name, u.password_hash,
                 m.role, m.geo_scope, m.tenant_id,
                 t.slug as tenant_slug, t.name as tenant_name
          from users u
          join memberships m on m.user_id = u.id
          join tenants t on t.id = m.tenant_id
          where u.email = ${email}
          limit 1`;
        const row = rows[0];
        if (!row) return null;
        const ok = await bcrypt.compare(password, row.password_hash as string);
        if (!ok) return null;

        const su: SessionUser = {
          id: row.id,
          email: row.email,
          name: row.name,
          tenantId: row.tenant_id,
          tenantSlug: row.tenant_slug,
          tenantName: row.tenant_name,
          role: row.role,
          scope: GLOBAL_ROLES.has(row.role) ? "global" : "tenant",
          geoScope: (row.geo_scope as SessionUser["geoScope"]) ?? null,
        };
        return su as unknown as Record<string, unknown>;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) Object.assign(token, user);
      return token;
    },
    session({ session, token }) {
      (session as unknown as { user: SessionUser }).user = {
        id: token.id as string,
        email: token.email as string,
        name: token.name as string,
        tenantId: token.tenantId as string,
        tenantSlug: token.tenantSlug as string,
        tenantName: token.tenantName as string,
        role: token.role as string,
        scope: token.scope as "tenant" | "global",
        geoScope: (token.geoScope as SessionUser["geoScope"]) ?? null,
      };
      return session;
    },
  },
});

/** Server-side helper: current user or throw (use inside (app) routes). */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const user = (session as unknown as { user?: SessionUser } | null)?.user;
  if (!user?.id) throw new Error("UNAUTHENTICATED");
  return user;
}
