"use server";

import { requireUser } from "@/lib/auth";
import { listNotifications, markRead, markAllRead, unreadCount, syncAgeingNotifications } from "@/lib/notifications";

export async function getMyNotifications() {
  const user = await requireUser();
  const ctx = { tenantId: user.tenantId, scope: user.scope };
  await syncAgeingNotifications(ctx);
  const [items, count] = await Promise.all([
    listNotifications(ctx, user.id, { limit: 20 }),
    unreadCount(ctx, user.id),
  ]);
  return { items, count };
}

export async function markNotificationRead(id: string) {
  const user = await requireUser();
  await markRead({ tenantId: user.tenantId, scope: user.scope }, id);
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await markAllRead({ tenantId: user.tenantId, scope: user.scope }, user.id);
}
