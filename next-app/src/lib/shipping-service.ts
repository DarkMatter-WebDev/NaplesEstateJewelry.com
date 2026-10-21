// Which shipping SERVICE an order bought — for the admin, at fulfillment time.
//
// Why (owner, 2026-09-17): `orders.shipping_method` stores only `pickup` /
// `shipping` / `local_delivery`; the checkout's two paid services ("Insured
// Shipping" = USPS Priority Mail, "Express Overnight Insured" = Priority Mail
// Express) both land as `shipping`, so the order page could not tell the
// owner which postage to buy. The fee is the fingerprint: every tier fee is
// unique per subtotal band across the two services (standard 19–165 vs
// express 55/79/119, never equal at the same subtotal), so fee + merchandise
// subtotal identifies the service exactly — for every order since the tiers
// went live (2026-07-30). Older or hand-typed fees fall through to an honest
// "check the receipt" line rather than a guess.
import {
  EXPRESS_SHIPPING_TIERS,
  REGISTERED_MAIL_MIN_SUBTOTAL,
  STANDARD_SHIPPING_TIERS,
  type ShippingTier,
} from '@/lib/checkout-shipping';

export type ShippingServiceKind = 'pickup' | 'local_delivery' | 'express' | 'priority' | 'registered' | 'unknown';

export type ShippingService = {
  kind: ShippingServiceKind;
  /** Short, for the summary line — what the buyer chose. */
  label: string;
  /** What to buy at the counter; null for pickup. */
  detail: string | null;
};

function tierFeeAt(tiers: readonly ShippingTier[], subtotal: number): number | null {
  const tier = tiers.find((t) => subtotal >= t.min && (t.max === null || subtotal < t.max));
  return tier ? tier.fee : null;
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

export function describeShippingService(order: {
  shipping_method: string | null | undefined;
  shipping_fee: number | string | null | undefined;
  /** Merchandise subtotal BEFORE discount — the tiers key off it. */
  subtotal: number | string | null | undefined;
  /** `in_store_<method>`: a shipped showroom sale, whose charge may be "No charge" or typed. */
  payment_method?: string | null;
}): ShippingService {
  const method = String(order.shipping_method ?? '').toLowerCase();
  if (method === 'pickup') return { kind: 'pickup', label: 'Local Pickup', detail: null };
  if (method === 'local_delivery') return { kind: 'local_delivery', label: 'Local Delivery', detail: 'Hand-delivered — no postage.' };

  const fee = Number(order.shipping_fee);
  const subtotal = Number(order.subtotal);
  if (!Number.isFinite(fee) || !Number.isFinite(subtotal)) {
    return { kind: 'unknown', label: 'Shipping', detail: 'Service unknown — check the receipt.' };
  }

  const expressFee = tierFeeAt(EXPRESS_SHIPPING_TIERS, subtotal);
  if (expressFee !== null && sameMoney(fee, expressFee)) {
    return {
      kind: 'express',
      label: 'Express Overnight Insured',
      detail: 'USPS Priority Mail Express — padded flat-rate envelope, insured, signature required. Ship same or next business day.',
    };
  }
  const standardFee = tierFeeAt(STANDARD_SHIPPING_TIERS, subtotal);
  if (standardFee !== null && sameMoney(fee, standardFee)) {
    if (subtotal >= REGISTERED_MAIL_MIN_SUBTOTAL) {
      return {
        kind: 'registered',
        label: 'Insured Shipping (Registered Mail)',
        detail: 'USPS Registered Mail — plain box sealed with kraft paper tape, insured, signature. Buyer was told 2–10 business days.',
      };
    }
    return {
      kind: 'priority',
      label: 'Insured Shipping (Standard)',
      detail: 'USPS Priority Mail — small flat-rate box, USPS insurance, signature required. No delivery date was promised.',
    };
  }
  // A showroom sale shipped afterwards (2026-10-20): the owner chose "No
  // charge" or typed the amount at the counter, so no service was promised.
  if (String(order.payment_method ?? '').startsWith('in_store_')) {
    return {
      kind: 'unknown',
      label: 'Shipping (in-store sale)',
      detail: fee > 0
        ? `$${fee.toFixed(2)} shipping charged in the store — no service was promised; pick and insure it when you ship.`
        : 'No shipping charged in the store — pick and insure the service when you ship.',
    };
  }
  return {
    kind: 'unknown',
    label: 'Shipping',
    detail: `Fee $${fee.toFixed(2)} does not match a current tier (manual or pre-2026-07-30 order) — check the receipt.`,
  };
}
