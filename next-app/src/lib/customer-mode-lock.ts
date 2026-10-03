// Buy receipt "Customer input mode" — the lock (owner, 2026-10-03).
//
// The owner hands a signed-in admin tablet to a seller so they can type their
// own name and address. While the tablet is in that mode the SERVER must refuse
// to show it the back end, because a screen that merely covers the admin page
// stops nobody who types an address into the browser's bar:
//
// - `src/proxy.ts` sends every admin and account PAGE on that browser back to
//   the New receipt page (which opens straight into the customer screen);
// - `requireAdmin()` refuses every admin API call from that browser;
// - only the staff code, checked on the server, lifts the lock
//   (`api/admin/buy-receipts/customer-mode`).
//
// The lock is a cookie, so it is per browser: the Print Station, the owner's
// laptop and every other computer never notice it.
//
// This file has no imports on purpose — the proxy loads it on every request.

/** Present = this browser is in customer input mode. HttpOnly: page scripts cannot clear it. */
export const CUSTOMER_MODE_COOKIE = 'nej_customer_mode';

/** A tablet nobody unlocked frees itself by the next morning. */
export const CUSTOMER_MODE_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

/**
 * localStorage note, '1' while the mode is on. The cookie above is the lock;
 * this is only how OTHER TABS of the same browser hear about it, because a tab
 * that was already showing an admin page makes no request the server could
 * refuse. `CustomerModeTabGuard` reads it, asks the server whether the lock is
 * real, and leaves the page if it is. A stale note is harmless: the server
 * says "not locked" and the guard deletes it.
 */
export const CUSTOMER_MODE_MARKER_KEY = 'nej-customer-mode';

/** Wrong-code limit: this many tries, then a pause of this many seconds. */
export const CUSTOMER_MODE_MAX_TRIES = 5;
export const CUSTOMER_MODE_TRY_WINDOW_SECONDS = 30;

/** The one admin page a locked browser may open: the New receipt form, which shows the customer screen. */
const LOCK_PAGE = '/admin/buy-receipts';

/**
 * Still reachable while locked, so an expired sign-in can be renewed. Nothing
 * else under /account is: the reset-password page lets a signed-in session set
 * a new password WITHOUT the old one, and the security page changes it too.
 */
const SIGN_IN_PAGE = '/account/sign-in';

const GUARDED_ROOTS = ['/admin', '/account'];

/**
 * Where a locked browser is sent instead of `pathname`, or null when the page
 * may load (the public site, the lock page itself, the sign-in page).
 *
 * Loop-free by construction: the destination is never guarded, and the lock
 * page's own gate sends a signed-out visitor to the sign-in page and anyone
 * who is not an admin to the home page — neither of which is guarded.
 */
export function customerModeBounce(pathname: string): string | null {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A malformed escape is not a route; fall through with the raw text.
  }
  const spanish = path === '/es' || path.startsWith('/es/');
  let bare = path.replace(/^\/(en|es)(?=\/|$)/, '');
  if (bare.length > 1) bare = bare.replace(/\/+$/, '');
  if (!bare) bare = '/';

  const guarded = GUARDED_ROOTS.some((root) => bare === root || bare.startsWith(`${root}/`));
  if (!guarded) return null;
  if (bare === LOCK_PAGE || bare === SIGN_IN_PAGE) return null;
  return `${spanish ? '/es' : ''}${LOCK_PAGE}`;
}
