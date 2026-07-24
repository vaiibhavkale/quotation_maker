"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSql } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

const TEAM_ADMIN_ROLES = ["partner_admin", "super_admin"];
const INVITABLE_ROLES = ["partner_admin", "partner_sales", "viewer"] as const;

function assertTeamAdmin(role: string) {
  if (!TEAM_ADMIN_ROLES.includes(role)) throw new Error("FORBIDDEN");
}

const InviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(INVITABLE_ROLES),
});

/**
 * `users`/`memberships` have RLS disabled entirely (they're platform/auth
 * data, not tenant-owned rows - see 0001_fix_rls.sql), so unlike every
 * other action in this app, there is no database-level isolation net here.
 * Every statement below filters by tenant_id in application code on
 * purpose - that's the whole enforcement boundary for this file.
 */
export async function inviteTeamMember(form: FormData) {
  const user = await requireUser();
  assertTeamAdmin(user.role);
  const data = InviteSchema.parse(Object.fromEntries(form));
  const sql = getSql();

  const email = data.email.toLowerCase().trim();
  const [existingByEmail] = await sql`select id from users where email = ${email} limit 1`;

  let userId = existingByEmail?.id as string | undefined;
  let tempPassword: string | null = null;
  if (!userId) {
    tempPassword = randomBytes(6).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const [row] = await sql`
      insert into users (email, name, password_hash) values (${email}, ${data.name}, ${passwordHash}) returning id`;
    userId = row.id as string;
  }

  const [already] = await sql`
    select id from memberships where user_id = ${userId} and tenant_id = ${user.tenantId} limit 1`;
  if (already) throw new Error("Already a member of this team");

  await sql`insert into memberships (user_id, tenant_id, role) values (${userId}, ${user.tenantId}, ${data.role})`;

  await audit(user.tenantId, user.id, "membership", userId, "invite", { role: data.role });
  revalidatePath("/team");
  return { tempPassword };
}

export async function changeTeamMemberRole(membershipId: string, role: (typeof INVITABLE_ROLES)[number]) {
  const user = await requireUser();
  assertTeamAdmin(user.role);
  const sql = getSql();

  await sql`update memberships set role = ${role} where id = ${membershipId} and tenant_id = ${user.tenantId}`;

  await audit(user.tenantId, user.id, "membership", membershipId, `role:${role}`);
  revalidatePath("/team");
}

export async function removeTeamMember(membershipId: string) {
  const user = await requireUser();
  assertTeamAdmin(user.role);
  const sql = getSql();

  const [m] = await sql`select user_id from memberships where id = ${membershipId} and tenant_id = ${user.tenantId} limit 1`;
  if (!m) throw new Error("Not found");
  if (m.user_id === user.id) throw new Error("Cannot remove yourself");

  await sql`delete from memberships where id = ${membershipId} and tenant_id = ${user.tenantId}`;

  await audit(user.tenantId, user.id, "membership", membershipId, "remove");
  revalidatePath("/team");
}
