'use client';

import Link from 'next/link';
import { type CSSProperties, useEffect, useState } from 'react';

const GOLD = '#735c00';

/**
 * Offers menu item (site shop "Make an Offer", 2026-10-15) with the number of
 * OPEN offers — ones still holding a buyer's money and waiting for an answer.
 * Unlike the Orders badge it is not "new since seen": an open offer is work
 * with a 72-hour clock, so the count stays until each one is answered.
 */
export default function AdminOffersLink({
  href,
  active = false,
  style,
}: {
  href: string;
  active?: boolean;
  style?: CSSProperties;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/offers?counts=1');
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && typeof data?.total === 'number') setCount(data.total);
      } catch {
        /* badge is best-effort */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const content = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      <span>Offers</span>
      {count > 0 && (
        <span
          aria-label={`${count} open offer${count === 1 ? '' : 's'}`}
          style={{
            minWidth: '1rem',
            height: '1rem',
            padding: '0 0.28rem',
            borderRadius: '999px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: GOLD,
            color: 'white',
            fontSize: '0.58rem',
            fontWeight: 800,
            lineHeight: 1,
            boxShadow: '0 0 0 2px white',
          }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </span>
  );

  if (active) {
    return <span style={style}>{content}</span>;
  }
  return (
    <Link href={href} style={style}>
      {content}
    </Link>
  );
}
