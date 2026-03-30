/**
 * Work Order Helper — routines use this to check for and claim work orders.
 * Keeps routine code clean by encapsulating the claim/complete/fail lifecycle.
 */

import type { BotContext } from "../bot/types";
import type { PersistentWorkOrder, FleetWorkOrder } from "../commander/types";

/**
 * Check for a matching work order and claim it.
 * Returns the claimed order, or null if no match.
 */
export async function claimWorkOrder(
  ctx: BotContext,
  orderTypes: FleetWorkOrder["type"][],
): Promise<PersistentWorkOrder | null> {
  const wom = ctx.workOrderManager;
  if (!wom) return null;

  const botRole = ctx.settings.role ?? "generalist";

  // Find best matching pending order for this bot's role
  for (const type of orderTypes) {
    const pending = wom.getPending(type);
    if (pending.length === 0) continue;

    // Try to claim the highest priority one
    for (const order of pending) {
      const claimed = await wom.claim(order.id, ctx.botId);
      if (claimed) {
        return claimed;
      }
    }
  }

  return null;
}

/** Mark a work order as completed */
export function completeWorkOrder(ctx: BotContext, orderId: string): void {
  ctx.workOrderManager?.complete(orderId);
}

/** Mark a work order as failed (bot couldn't fulfill it) */
export function failWorkOrder(ctx: BotContext, orderId: string): void {
  ctx.workOrderManager?.fail(orderId);
}

/** Mark a work order as in progress */
export function startWorkOrder(ctx: BotContext, orderId: string): void {
  ctx.workOrderManager?.markInProgress(orderId);
}
