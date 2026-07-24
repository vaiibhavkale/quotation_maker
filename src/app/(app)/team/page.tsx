import { requireUser } from "@/lib/auth";
import { getSql } from "@/db";
import { InviteForm, RoleSelect, RemoveMemberButton } from "@/components/team-actions";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireUser();
  const isAdmin = ["partner_admin", "super_admin"].includes(user.role);
  const sql = getSql();

  // memberships/users have RLS off (platform data, not tenant-row-scoped) -
  // tenant isolation here is enforced by this WHERE clause, not the database.
  const members = await sql`
    select m.id as membership_id, m.role, u.id as user_id, u.name, u.email
    from memberships m join users u on u.id = m.user_id
    where m.tenant_id = ${user.tenantId}
    order by u.name`;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight">Team</h1>
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th>{isAdmin && <th></th>}</tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.membership_id}>
                  <td className="font-semibold">
                    {m.name}
                    {m.user_id === user.id && <span className="ml-1.5 text-xs font-normal text-ink-400">(you)</span>}
                  </td>
                  <td className="text-ink-500">{m.email}</td>
                  <td>
                    {isAdmin && m.user_id !== user.id ? (
                      <RoleSelect membershipId={m.membership_id} role={m.role} />
                    ) : (
                      <span className="capitalize text-ink-700">{String(m.role).replace("_", " ")}</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="text-right">
                      {m.user_id !== user.id && <RemoveMemberButton membershipId={m.membership_id} />}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && (
        <div>
          <h2 className="mb-6 text-lg font-bold">Invite team member</h2>
          <InviteForm />
        </div>
      )}
    </div>
  );
}
