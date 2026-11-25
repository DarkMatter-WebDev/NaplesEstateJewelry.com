/**
 * Follow-ups → Upcoming → "View items" (owner, 2026-11-25: "add a button for
 * admin to view original item lines from the buy receipt… open in a new
 * overlay modal that can quickly be closed"). The shape the pop-up shows;
 * loaded by `lib/follow-up-items-server.ts`. Read-only.
 */

export type FollowUpItemLine = {
  /** Buy receipts carry a quantity; order lines show it only when it is not 1. */
  qty: number | null;
  description: string;
  amount: number | null;
};

export type FollowUpItemsView = {
  kind: 'receipt' | 'order';
  /** BUY-00041 / NEJ-20261124-AB12C */
  ref: string;
  name: string | null;
  /** When the receipt was written / the order was placed (ISO). */
  at: string | null;
  /** "Voided" / "Shipped" / "Picked up" … — null when there is nothing to add. */
  state: string | null;
  lines: FollowUpItemLine[];
  total: number | null;
  /** The owner's "Note for the thank-you email" (internal) — null when blank. */
  note: string | null;
  /** Exactly what the AI is given: item names with prices, weights and counts cut out. */
  aiPieces: string[];
};

export function formatItemMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
