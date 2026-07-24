"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptButton({ token, color }: { token: string; color: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const accept = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/q/${token}/accept`, { method: "POST" });
      if (!res.ok) throw new Error("Could not record acceptance");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button onClick={accept} disabled={busy}
        className="w-full rounded-lg px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: color }}>
        {busy ? "Recording…" : "Accept this quotation"}
      </button>
      {err && <p className="mt-2 text-center text-xs text-rose-600">{err}</p>}
      <p className="mt-2 text-center text-[11px] text-ink-400">
        Your acceptance is recorded digitally with a timestamp.
      </p>
    </div>
  );
}
