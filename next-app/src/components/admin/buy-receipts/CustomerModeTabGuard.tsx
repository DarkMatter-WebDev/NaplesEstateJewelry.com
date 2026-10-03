'use client';

import { useEffect } from 'react';
import { CUSTOMER_MODE_API } from '@/lib/buy-receipt-customer-mode';
import { CUSTOMER_MODE_MARKER_KEY, customerModeBounce } from '@/lib/customer-mode-lock';

/**
 * The buy receipt's customer input mode, seen from every OTHER tab.
 *
 * The server refuses a locked browser any new admin or account page — but a
 * tab that was already open on one (the Log, an order, the password page) asks
 * the server for nothing, so a seller who switches tabs would simply find it.
 * This closes that: when the mode starts in another tab, when this tab is
 * shown again, or when it comes back from the browser's page cache, it asks the
 * server whether this browser is locked and, if so, leaves for the New receipt
 * page — which opens as the customer screen.
 *
 * Where it runs:
 * - every admin page that has the admin menu — `AdminHeader` calls the hook;
 * - the two admin pages without that menu (the printable order and invoice) —
 *   they render the component;
 * - every account page — `app/[locale]/account/layout.tsx` renders the component.
 * ⛔ There is deliberately NO `app/[locale]/admin/layout.tsx` (STRUCTURE.md,
 * "Phone listing editor"), which is why the admin side goes through the header.
 * A test fails if an admin page has neither.
 *
 * It does nothing at all unless the note in localStorage is set, which only the
 * mode itself sets. The server's answer decides, never the note: a stale note
 * is deleted and the page stays.
 */
export function useCustomerModeTabGuard() {
  useEffect(() => {
    let checking = false;

    const check = async () => {
      if (checking) return;
      try {
        if (window.localStorage.getItem(CUSTOMER_MODE_MARKER_KEY) !== '1') return;
      } catch {
        return;
      }
      // The New receipt page and the sign-in page are where a locked browser belongs.
      const destination = customerModeBounce(window.location.pathname);
      if (!destination) return;

      checking = true;
      const root = document.documentElement;
      // Nothing on this page is to be read while the question is open.
      root.style.visibility = 'hidden';

      // Unknown (offline, an error) counts as locked: an admin page is never shown on a guess.
      let locked = true;
      try {
        const res = await fetch(CUSTOMER_MODE_API, { cache: 'no-store' });
        if (res.ok) locked = ((await res.json()) as { locked?: boolean }).locked === true;
        // Not signed in as an admin: there is no hand-over to protect, and the page's own gate decides.
        else if (res.status === 401 || res.status === 403) locked = false;
      } catch {
        // Stays locked.
      }

      if (locked) {
        window.location.replace(destination);
        return;
      }
      try {
        window.localStorage.removeItem(CUSTOMER_MODE_MARKER_KEY);
      } catch {
        // Nothing to clean up then.
      }
      root.style.visibility = '';
      checking = false;
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === CUSTOMER_MODE_MARKER_KEY && event.newValue === '1') void check();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const onShow = () => void check();

    void check();
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

/** The same guard for a page with no client component of its own to call the hook from. Draws nothing. */
export default function CustomerModeTabGuard() {
  useCustomerModeTabGuard();
  return null;
}
