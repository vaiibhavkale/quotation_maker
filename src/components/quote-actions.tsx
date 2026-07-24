"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShare, transitionQuote } from "@/app/actions/quotes";
import type { QuoteStatus } from "@/lib/lifecycle";

/** Silently refreshes the page every 5s so 'Viewed' flips live during the demo. */
export function LivePoller() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function ShareButtons({ quoteId, customerPhone, appUrl }: {
  quoteId: string; customerPhone: string | null; appUrl: string;
}) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const share = (channel: "whatsapp" | "link") =>
    start(async () => {
      const token = await createShare(quoteId, channel);
      const url = `${appUrl}/q/${token}`;
      setLink(url);
      if (channel === "whatsapp") {
        const text = encodeURIComponent(`Hello! Please find your quotation here: ${url}`);
        const phone = (customerPhone ?? "").replace(/[^0-9]/g, "");
        window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
      } else {
        await navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button onClick={() => share("whatsapp")} disabled={pending}
          className="btn bg-[#25D366] text-white hover:bg-[#1DA851]">
          Share on WhatsApp
        </button>
        <button onClick={() => share("link")} disabled={pending} className="btn-secondary">
          {copied ? "Copied ✓" : "Copy tracked link"}
        </button>
      </div>
      {link && (
        <p className="break-all rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-500">
          Tracked link: {link}
        </p>
      )}
    </div>
  );
}

export function TransitionButtons({ quoteId, status }: { quoteId: string; status: QuoteStatus }) {
  const [pending, start] = useTransition();
  const go = (to: QuoteStatus) => {
    const reason = to === "lost" ? window.prompt("Loss reason?") ?? "Not specified" : undefined;
    start(async () => { await transitionQuote(quoteId, to, reason); });
  };

  const next: { to: QuoteStatus; label: string; cls: string }[] = [];
  if (status === "viewed" || status === "shared") next.push({ to: "negotiation", label: "Start negotiation", cls: "btn-secondary" });
  if (["shared", "viewed", "negotiation"].includes(status)) next.push({ to: "approved", label: "Mark approved", cls: "btn-primary" });
  if (status === "approved") next.push({ to: "converted", label: "Convert to order", cls: "btn-primary" });
  if (!["converted", "lost"].includes(status)) next.push({ to: "lost", label: "Mark lost", cls: "btn-ghost" });

  if (next.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {next.map((n) => (
        <button key={n.to} onClick={() => go(n.to)} disabled={pending} className={n.cls + " text-xs"}>
          {n.label}
        </button>
      ))}
    </div>
  );
}

export function FollowupDrafter({ quoteId, customerPhone }: { quoteId: string; customerPhone: string | null }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/ai/followup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI unavailable");
      setDraft(data.draft);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const sendWa = () => {
    if (!draft) return;
    const phone = (customerPhone ?? "").replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(draft)}`, "_blank");
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">✦ AI Follow-up</h3>
        <button onClick={generate} disabled={loading} className="btn-secondary text-xs">
          {loading ? "Drafting…" : draft ? "Redraft" : "Draft follow-up"}
        </button>
      </div>
      {err && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{err}</p>}
      {draft && (
        <>
          <textarea className="input mt-3 h-32 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button onClick={sendWa} className="btn bg-[#25D366] text-xs text-white hover:bg-[#1DA851]">Send on WhatsApp</button>
            <button onClick={() => navigator.clipboard.writeText(draft)} className="btn-secondary text-xs">Copy</button>
          </div>
        </>
      )}
      <p className="mt-3 text-[11px] text-ink-400">
        AI drafts the message from quote context — it never changes prices or terms.
      </p>
    </div>
  );
}
