"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeSiteVisit, dropLead } from "@/app/actions/leads";

export function CompleteVisitButton({ visitId, leadId }: { visitId: string; leadId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      className="btn-secondary text-xs"
      disabled={pending}
      onClick={() => {
        const notes = window.prompt("Site visit notes (optional)") ?? "";
        start(async () => {
          await completeSiteVisit(visitId, leadId, notes);
          router.refresh();
        });
      }}
    >
      {pending ? "Saving…" : "Mark completed"}
    </button>
  );
}

export function DropLeadButton({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      className="btn-ghost text-xs"
      disabled={pending}
      onClick={() => {
        const reason = window.prompt("Reason for dropping this lead?") ?? "Not specified";
        start(async () => {
          await dropLead(leadId, reason);
          router.refresh();
        });
      }}
    >
      Drop lead
    </button>
  );
}
