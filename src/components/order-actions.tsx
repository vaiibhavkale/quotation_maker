"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceOrderStage } from "@/app/actions/orders";
import { ORDER_STAGES, type OrderStage } from "@/lib/order-lifecycle";

export function AdvanceStageButton({ orderId, stage }: { orderId: string; stage: OrderStage }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const idx = ORDER_STAGES.indexOf(stage);
  const next = ORDER_STAGES[idx + 1];
  if (!next) return null;

  return (
    <button
      className="btn-primary text-xs"
      disabled={pending}
      onClick={() => start(async () => {
        await advanceOrderStage(orderId, next);
        router.refresh();
      })}
    >
      {pending ? "Updating…" : `Advance to ${next}`}
    </button>
  );
}
