"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMyNotifications, markNotificationRead, markAllNotificationsRead } from "@/app/actions/notifications";

type Notif = {
  id: string; type: string; title: string; body: string | null;
  link: string | null; read_at: string | null; created_at: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [count, setCount] = useState(0);
  const [, start] = useTransition();
  const router = useRouter();

  const load = () => {
    start(async () => {
      const res = await getMyNotifications();
      setItems(res.items as unknown as Notif[]);
      setCount(res.count);
    });
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openItem = (n: Notif) => {
    start(async () => {
      if (!n.read_at) await markNotificationRead(n.id);
      setOpen(false);
      if (n.link) router.push(n.link);
      load();
    });
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-ghost relative px-2.5 py-1.5 text-sm">
        🔔
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-ink-200 bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
              <p className="text-sm font-bold">Notifications</p>
              <button
                onClick={() => start(async () => { await markAllNotificationsRead(); load(); })}
                className="text-xs font-semibold text-brand-600 hover:underline"
              >
                Mark all read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 && <p className="p-4 text-center text-xs text-ink-500">You&apos;re all caught up.</p>}
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`block w-full border-b border-ink-50 px-4 py-2.5 text-left text-xs hover:bg-ink-50 ${!n.read_at ? "bg-brand-50/40" : ""}`}
                >
                  <p className="font-semibold text-ink-800">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-ink-500">{n.body}</p>}
                  <p className="mt-1 text-[10px] text-ink-400">
                    {new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
