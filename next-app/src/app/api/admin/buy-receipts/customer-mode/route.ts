import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { isBuyReceiptStaffCode } from '@/lib/buy-receipt-staff-code';
import {
  CUSTOMER_MODE_COOKIE,
  CUSTOMER_MODE_COOKIE_MAX_AGE_SECONDS,
  CUSTOMER_MODE_MAX_TRIES,
  CUSTOMER_MODE_TRY_WINDOW_SECONDS,
} from '@/lib/customer-mode-lock';
import { rateLimitState } from '@/lib/rate-limit';

/**
 * Admin → Buy Receipts → Customer input mode (owner, 2026-10-03): the lock on
 * the tablet that is handed to the seller.
 *
 * POST starts it: this browser gets the lock cookie, and from then on the proxy
 * and `requireAdmin()` refuse it every admin page and admin call
 * (`lib/customer-mode-lock.ts`). DELETE ends it — only with the staff code,
 * which is checked here so it is never in the page the customer is holding.
 * GET only says whether this browser is locked.
 *
 * All three pass `duringCustomerMode`: this is the one route a locked browser
 * must still be able to call.
 */
export const runtime = 'nodejs';

function lockCookie(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Plain http only ever happens on the dev server.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/**
 * Is THIS browser locked? Asked by the browser's other tabs
 * (`CustomerModeTabGuard`): a tab that was already showing an admin page makes
 * no request the lock could refuse, so it asks, and leaves if the answer is yes.
 */
export async function GET() {
  const admin = await requireAdmin({ duringCustomerMode: true });
  if (admin.error) return admin.error;

  const locked = (await cookies()).has(CUSTOMER_MODE_COOKIE);
  return NextResponse.json({ locked }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST() {
  const admin = await requireAdmin({ duringCustomerMode: true });
  if (admin.error) return admin.error;

  const response = NextResponse.json({ locked: true });
  response.cookies.set(CUSTOMER_MODE_COOKIE, '1', lockCookie(CUSTOMER_MODE_COOKIE_MAX_AGE_SECONDS));
  return response;
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin({ duringCustomerMode: true });
  if (admin.error) return admin.error;

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;

  // Counted BEFORE the code is looked at, right or wrong: a limiter that only
  // counted misses would still let someone run through all 10,000 codes.
  // "unavailable" is let through on purpose — the caller is already a signed-in
  // admin, and an unreachable counter must not leave a tablet the right code
  // cannot unlock.
  const tries = await rateLimitState(
    `buy-receipt-code:${admin.user.id}`,
    CUSTOMER_MODE_MAX_TRIES,
    CUSTOMER_MODE_TRY_WINDOW_SECONDS,
  );
  if (tries === 'unavailable') console.warn('[buy-receipts] staff-code try counter unavailable');
  if (tries === 'limited') {
    return NextResponse.json(
      { error: 'Too many tries. Wait half a minute, then try again.', waitSeconds: CUSTOMER_MODE_TRY_WINDOW_SECONDS },
      { status: 429 },
    );
  }

  if (!isBuyReceiptStaffCode(body?.code)) {
    return NextResponse.json({ error: 'That code is not right.' }, { status: 403 });
  }

  console.info('[buy-receipts] customer input mode unlocked by', admin.user.email ?? admin.user.id);
  const response = NextResponse.json({ locked: false });
  response.cookies.set(CUSTOMER_MODE_COOKIE, '', lockCookie(0));
  return response;
}
