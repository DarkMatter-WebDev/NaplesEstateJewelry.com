import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  buildOrderDraft,
  isOrderDraftError,
  normalizeOrderLines,
  toOrderQuote,
  type OrderLine,
} from '@/lib/checkout-pricing';
import { isCheckoutShippingMethod } from '@/lib/checkout-shipping';
import { normalizeDiscountCode } from '@/lib/discount-codes';
import { makeDiscountResolver } from '@/lib/discount-codes-server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { parseCheckoutExemptionInput, resolveCheckoutExemption } from '@/lib/tax-exempt-server';

export const runtime = 'nodejs';

const MAX_CART_ITEMS = 50;

/**
 * READ-ONLY checkout quote.
 *
 * Returns exactly the prices the create-order route would compute, so the
 * buyer's summary can render live figures instead of the price labels frozen
 * into the cart when each item was added. 64% of the catalog is spot-linked, so
 * a cart more than a few minutes old otherwise displays a stale total.
 *
 * ⚠️ **Writes nothing and reserves nothing.** It calls the same
 * `buildOrderDraft()` the order route uses and simply does not persist the
 * result — no order row, no PayPal order, no inventory hold, no discount
 * redemption. If a future edit makes this endpoint write anything, it is no
 * longer a quote and the name is a lie.
 *
 * This endpoint reduces how often the `price_changed` guard in
 * `paypal/create-order` fires; the guard is the actual guarantee. Without a
 * fresh quote the guard would trip on nearly every checkout, which trains
 * buyers to click through it.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  // Generous: the checkout page re-quotes on cart/shipping/state changes.
  if (!(await checkRateLimit(`checkout-quote:${ip}`, 120, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please try again in a bit.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const rawLines: OrderLine[] = Array.isArray(body.items)
    ? body.items.map((entry: { id?: unknown; quantity?: unknown }) => ({
        productId: String(entry?.id ?? ''),
        quantity: Number(entry?.quantity ?? 1),
      }))
    : [];
  const orderLines = normalizeOrderLines(rawLines);
  if (orderLines.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }
  if (orderLines.length > MAX_CART_ITEMS) {
    return NextResponse.json(
      { error: `A checkout can contain at most ${MAX_CART_ITEMS} unique products.` },
      { status: 400 },
    );
  }

  const shippingMethod = String(body.shippingMethod ?? 'local-pickup');
  if (!isCheckoutShippingMethod(shippingMethod)) {
    return NextResponse.json({ error: 'Invalid shipping method.' }, { status: 400 });
  }

  const supabase = await createClient();
  const discountCode = normalizeDiscountCode(
    typeof body.discountCode === 'string' ? body.discountCode : null,
  );
  // Resolving the code here keeps the quoted total identical to the charged
  // total. It reads the code; redemption still only happens at capture.
  const discountResolver = discountCode
    ? makeDiscountResolver(createServiceClient(), discountCode, body.email ?? null)
    : null;

  // Tax-exempt (lib/tax-exempt.ts): only an owner-approved request for this
  // email, or the signed-in buyer's saved certificate, ever drops the tax.
  const exemptionInput = parseCheckoutExemptionInput(body.taxExempt);
  const exemption = exemptionInput
    ? await resolveCheckoutExemption(createServiceClient(), exemptionInput, {
      email: typeof body.email === 'string' ? body.email : null,
      userId: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    : null;

  const draft = await buildOrderDraft(
    supabase,
    orderLines,
    shippingMethod,
    body.shippingState ?? null,
    discountResolver,
    { taxExempt: Boolean(exemption) },
  );

  if (isOrderDraftError(draft)) {
    // A quote failing for an unavailable item or a stale spot feed is useful
    // information for the summary, not an error to swallow.
    return NextResponse.json({ error: draft.error, code: draft.code ?? null }, { status: draft.status });
  }

  return NextResponse.json({ quote: toOrderQuote(draft) });
}
