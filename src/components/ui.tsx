import { STATUS_COLOR, STATUS_LABEL, type QuoteStatus } from "@/lib/lifecycle";
import { fmtINR } from "@/lib/money";

export function StatusBadge({ status }: { status: string }) {
  const s = status as QuoteStatus;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[s] ?? "bg-ink-100 text-ink-700"}`}>
      {STATUS_LABEL[s] ?? status}
    </span>
  );
}

export function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`card p-5 ${accent ? "border-brand-500/40 bg-gradient-to-br from-brand-50 to-white" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

export function Money({ paise, compact = true }: { paise: number; compact?: boolean }) {
  return <span className="tabular-nums">{fmtINR(Number(paise), { compact })}</span>;
}

export function HealthBadge({ score, grade }: { score: number; grade: string }) {
  const cls = grade === "healthy" ? "bg-emerald-100 text-emerald-700"
    : grade === "warm" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>
      ♥ {score}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center p-12 text-center">
      <p className="text-sm font-semibold text-ink-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
