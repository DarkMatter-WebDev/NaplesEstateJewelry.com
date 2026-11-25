import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * The three views of Admin → Buy Receipts. "Print station" is the page left
 * open on the PC that has the printer; it does nothing on any other computer
 * until that computer is chosen as the station, so opening it here is harmless.
 *
 * `end` is drawn at the right end of the row (it wraps under the tabs on a
 * narrow screen). Nothing uses it since "Customer input mode" was removed
 * (2026-11-25); kept for the next small control that belongs there.
 */
export type BuyReceiptTab = 'new' | 'log' | 'station';

const TABS: { key: BuyReceiptTab; label: string; path: string }[] = [
  { key: 'new', label: 'New receipt', path: '/buy-receipts' },
  { key: 'log', label: 'Log', path: '/buy-receipts/log' },
  { key: 'station', label: 'Print station', path: '/buy-receipts/station' },
];

export default function BuyReceiptTabs({
  adminBasePath,
  active,
  end,
}: {
  adminBasePath: string;
  active: BuyReceiptTab | null;
  end?: ReactNode;
}) {
  return (
    <nav className="mb-5 flex flex-wrap items-center gap-2" aria-label="Buy receipts">
      {TABS.map((tab) => {
        const current = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`${adminBasePath}${tab.path}`}
            aria-current={current ? 'page' : undefined}
            className="border px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              borderColor: current ? 'var(--color-primary)' : 'var(--color-outline-variant)',
              background: current
                ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)'
                : 'var(--color-surface-container-lowest)',
              color: current ? 'var(--color-primary)' : 'var(--color-on-surface)',
              fontFamily: 'var(--font-label)',
            }}
          >
            {tab.label}
          </Link>
        );
      })}
      {/* Gold traded toward a purchase (owner, 2026-11-21): the buy receipt and the sale on one screen. */}
      <Link
        href={`${adminBasePath}/instant-sale/trade`}
        className="px-2 py-2 text-sm font-semibold underline-offset-4 hover:underline"
        style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
      >
        Trade-in sale →
      </Link>
      {end ? <span className="ml-auto flex items-center">{end}</span> : null}
    </nav>
  );
}
