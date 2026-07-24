"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteTeamMember, changeTeamMemberRole, removeTeamMember } from "@/app/actions/team";

const ROLES = ["partner_admin", "partner_sales", "viewer"] as const;

export function InviteForm() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submit = (formData: FormData) => {
    setError(null);
    setResult(null);
    start(async () => {
      try {
        const { tempPassword } = await inviteTeamMember(formData);
        setResult(tempPassword ? `Added. Temporary password: ${tempPassword}` : "Added existing user to this team.");
        router.refresh();
      } catch (e) {
        setError((e as Error).message || "Failed");
      }
    });
  };

  return (
    <form action={submit} className="card space-y-3 p-5">
      <div><label className="label">Name</label><input name="name" required className="input" /></div>
      <div><label className="label">Email</label><input name="email" type="email" required className="input" /></div>
      <div><label className="label">Role</label>
        <select name="role" className="input" defaultValue="partner_sales">
          {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
        </select></div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {result && <p className="break-all rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{result}</p>}
      <button disabled={pending} className="btn-primary w-full">{pending ? "Inviting…" : "Invite"}</button>
    </form>
  );
}

export function RoleSelect({ membershipId, role }: { membershipId: string; role: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      className="input py-1 text-xs"
      defaultValue={role}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value as (typeof ROLES)[number];
        start(async () => {
          await changeTeamMemberRole(membershipId, value);
          router.refresh();
        });
      }}
    >
      {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
    </select>
  );
}

export function RemoveMemberButton({ membershipId }: { membershipId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      className="btn-ghost text-xs"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Remove this team member?")) return;
        start(async () => {
          await removeTeamMember(membershipId);
          router.refresh();
        });
      }}
    >
      Remove
    </button>
  );
}
