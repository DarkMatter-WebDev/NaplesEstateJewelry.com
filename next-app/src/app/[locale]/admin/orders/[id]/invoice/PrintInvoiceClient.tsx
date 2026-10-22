'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PAPER_PAGE_CSS, paperReceiptDocument, type PaperReceipt } from '@/lib/order-receipt-paper';
import { printPaperInFrame } from '@/lib/print-paper';

/**
 * Order → Print Invoice. Since 2026-10-21 this prints the ONE-PAGE paper
 * receipt / invoice (`lib/order-receipt-paper.ts`, the owner's approved
 * layout) instead of the email's HTML, which ran to two pages for one item.
 * The paper is drawn on the page as it will print; Print sends it through a
 * hidden frame (`lib/print-paper.ts`).
 */
export default function PrintInvoiceClient({
  paper,
  label,
  orderNumber,
  backHref,
}: {
  paper: PaperReceipt;
  /** "Receipt NEJ-…" / "Invoice NEJ-…". */
  label: string;
  orderNumber: string;
  backHref: string;
}) {
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function print() {
    setPrinting(true);
    setError(null);
    try {
      await printPaperInFrame(paperReceiptDocument(paper));
    } catch {
      setError('Could not open printing. Try again, or use the browser’s own Print (Ctrl+P).');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.85rem 1.25rem',
          background: '#ffffff',
          borderBottom: '1px solid #d5c697',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
      >
        <Link href={backHref} style={{ fontSize: '0.82rem', color: '#735c00', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}>
          ← {orderNumber}
        </Link>
        <span style={{ color: '#d5c697' }}>|</span>
        <span style={{ fontSize: '0.82rem', color: '#1d1a14', fontWeight: 700 }}>{label}</span>
        {error && <span role="alert" style={{ fontSize: '0.78rem', color: '#a32d2d' }}>{error}</span>}
        <button
          type="button"
          onClick={() => void print()}
          disabled={printing}
          style={{
            marginLeft: 'auto',
            padding: '0.5rem 1.25rem',
            background: 'linear-gradient(135deg, #dcb336, #b5890c)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '0.82rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {printing ? 'Opening print…' : 'Print'}
        </button>
      </div>

      {/* The paper as it prints: letter width, half-inch margins. */}
      <div className="paper-wrap" style={{ background: '#e9e5da', padding: '1.5rem 0 3rem', minHeight: 'calc(100vh - 3.2rem)' }}>
        <div className="paper-sheet" style={{ width: 'min(816px, calc(100% - 2rem))', margin: '0 auto', background: '#fff', padding: '48px', boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}>
          <style>{paper.css}</style>
          <div dangerouslySetInnerHTML={{ __html: paper.body }} />
        </div>
      </div>
      {/* The browser's own Print (Ctrl+P) gives the same one page: no toolbar, no grey surround. */}
      <style>{`
        ${PAPER_PAGE_CSS}
        @media print {
          .no-print { display: none !important; }
          .paper-wrap { background: none !important; padding: 0 !important; min-height: 0 !important; }
          .paper-sheet { box-shadow: none !important; padding: 0 !important; width: auto !important; }
        }
      `}</style>
    </>
  );
}
