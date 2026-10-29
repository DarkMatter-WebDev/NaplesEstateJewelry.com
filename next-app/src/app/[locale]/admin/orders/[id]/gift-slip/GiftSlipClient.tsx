'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import type { OrderGift } from '@/lib/order-gift';
import { CONTACT_PHONE_DISPLAY } from '@/lib/contact-links';

function closePreview(backHref: string) {
  if (window.opener) {
    window.close();
    return;
  }
  window.location.href = backHref;
}

/**
 * Printed and put in the box. ⛔ No prices, no buyer email / phone / address —
 * the recipient sees this. The order number stays so an exchange can be found.
 */
export default function GiftSlipClient({ backHref, orderNumber, from, gift, items }: {
  backHref: string;
  orderNumber: string;
  from: string | null;
  gift: OrderGift;
  items: string[];
}) {
  useEffect(() => {
    document.body.classList.add('order-print-preview-active');
    return () => document.body.classList.remove('order-print-preview-active');
  }, []);

  return (
    <div className="gift-slip-root">
      <div className="print-toolbar no-print">
        <button type="button" onClick={() => closePreview(backHref)}>Close Preview</button>
        <Link href={backHref}>Back to Order</Link>
        <strong>Gift Slip - {orderNumber}</strong>
        <button type="button" className="primary" onClick={() => window.print()}>Print</button>
      </div>

      <main className="slip">
        <p className="mark">Naples Estate Jewelry</p>
        <p className="sub">Naples, Florida</p>
        <p className="for">{gift.recipientName ? <>A gift for <b>{gift.recipientName}</b></> : 'A gift for you'}</p>
        {gift.message && <p className="msg">“{gift.message}”</p>}
        {from && <p className="from">— from {from}</p>}
        {items.length > 0 && (
          <div className="items">
            <p className="label">In this package</p>
            {items.map((title, i) => <p key={`${i}-${title}`}>{title}</p>)}
          </div>
        )}
        <p className="foot">
          Gift receipt · Order {orderNumber} · Questions or an exchange? Call{' '}
          <span style={{ whiteSpace: 'nowrap' }}>{CONTACT_PHONE_DISPLAY}</span> · naplesestatejewelry.com
        </p>
      </main>

      <style>{`
        body.order-print-preview-active { background: #efede7; }
        .gift-slip-root { min-height: 100vh; padding: 0 0 40px; color: #1a1c1c; font-family: var(--font-body, system-ui, sans-serif); }
        .print-toolbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #fff; border-bottom: 1px solid #ddd5c2; font-size: 14px; }
        .print-toolbar button, .print-toolbar a { border: 1px solid #c9bd9d; background: #fff; color: #735c00; border-radius: 999px; padding: 6px 14px; font-size: 13px; cursor: pointer; text-decoration: none; }
        .print-toolbar .primary { margin-left: auto; background: linear-gradient(135deg, #dcb336, #b5890c); color: #fff; border: none; font-weight: 700; }
        .slip { width: min(5.5in, calc(100% - 32px)); margin: 28px auto 0; background: #fff; border: 1px solid #cfc8b8; padding: 0.45in 0.5in 0.32in; text-align: center; box-shadow: 0 16px 40px rgba(0,0,0,0.1); }
        .mark { margin: 0; font-family: var(--font-headline, Georgia, serif); font-weight: 700; font-size: 20px; letter-spacing: 0.14em; text-transform: uppercase; color: #735c00; }
        .sub { margin: 4px 0 22px; font-size: 10.5px; letter-spacing: 0.2em; text-transform: uppercase; color: #4d4635; }
        .for { margin: 0 0 14px; font-size: 17px; }
        .msg { margin: 0 auto 6px; max-width: 4.2in; font-family: var(--font-headline, Georgia, serif); font-style: italic; font-size: 20px; line-height: 1.45; white-space: pre-line; overflow-wrap: anywhere; }
        .from { margin: 0 0 20px; font-size: 14px; color: #4d4635; }
        .items { border-top: 1px solid #e8e1cf; border-bottom: 1px solid #e8e1cf; padding: 12px 0; margin-bottom: 14px; }
        .items p { margin: 3px 0; font-size: 13.5px; }
        .items .label { font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #735c00; margin-bottom: 6px; }
        .foot { margin: 0; font-size: 10.5px; color: #4d4635; line-height: 1.5; }
        @page { size: letter; margin: 0.5in; }
        @media print {
          body { background: #fff; }
          body * { visibility: hidden !important; }
          .gift-slip-root, .gift-slip-root * { visibility: visible !important; }
          .gift-slip-root { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
          .slip { margin: 0 auto; box-shadow: none; }
        }
      `}</style>
    </div>
  );
}
