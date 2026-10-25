// Meta shop "checkout URL" (2026-10-25). When a shopper taps Checkout in the
// Instagram / Facebook shop, Meta opens
//   https://naplesestatejewelry.com/meta-checkout?products=nej-123%3A1,nej-77%3A1&coupon=CODE
// Each entry is `<content id>:<quantity>`, and the content id is the feed's
// `g:id` (`nej-<inventory#>`, or the product id when a piece has no inventory
// number — see `feedId` in app/api/merchant-feed/route.ts). The page puts the
// pieces that are still for sale in the cart and opens /checkout, where every
// price is recomputed on the server as usual. `coupon` is ignored: no Meta
// promotions are set up (a code can still be typed at checkout).

export const META_CHECKOUT_MAX_LINES = 20;
export const META_CHECKOUT_MAX_QUANTITY = 99;

export type MetaCheckoutLine = {
  /** The content id exactly as Meta sent it (`nej-123` or a product id). */
  ref: string;
  /** Set when the ref is `nej-<inventory#>`. */
  inventoryNumber: number | null;
  quantity: number;
};

const REF_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/i;
const INVENTORY_REF = /^nej-(\d{1,9})$/i;

export function parseMetaCheckoutProducts(param: string | null | undefined): MetaCheckoutLine[] {
  if (!param) return [];
  const byRef = new Map<string, MetaCheckoutLine>();

  for (const raw of param.split(',')) {
    const entry = raw.trim();
    if (!entry) continue;
    const colon = entry.lastIndexOf(':');
    const ref = (colon === -1 ? entry : entry.slice(0, colon)).trim();
    if (!REF_PATTERN.test(ref)) continue;

    const parsedQty = colon === -1 ? 1 : Number(entry.slice(colon + 1).trim());
    const quantity = Number.isInteger(parsedQty) && parsedQty > 0
      ? Math.min(parsedQty, META_CHECKOUT_MAX_QUANTITY)
      : 1;

    const key = ref.toLowerCase();
    const existing = byRef.get(key);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, META_CHECKOUT_MAX_QUANTITY);
      continue;
    }
    if (byRef.size >= META_CHECKOUT_MAX_LINES) break;

    const inventory = INVENTORY_REF.exec(ref);
    byRef.set(key, {
      ref,
      inventoryNumber: inventory ? Number(inventory[1]) : null,
      quantity,
    });
  }

  return [...byRef.values()];
}
