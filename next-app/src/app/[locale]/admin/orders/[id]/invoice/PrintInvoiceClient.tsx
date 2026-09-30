'use client';

import { useState } from 'react';
import Link from 'next/link';
import { waitForPrintImages, waitForPrintLayout } from '@/lib/print-images';

const INVOICE_PRINT_SCALE = 0.98;

export default function PrintInvoiceClient({
  invoiceHtml,
  invoiceNumber,
  orderNumber,
  backHref,
}: {
  invoiceHtml: string;
  invoiceNumber: string;
  orderNumber: string;
  backHref: string;
}) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      {/* Page toolbar */}
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
        <Link
          href={backHref}
          style={{
            fontSize: '0.82rem',
            color: '#735c00',
            fontWeight: 600,
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
          }}
        >
          ← {orderNumber}
        </Link>
        <span style={{ color: '#d5c697' }}>|</span>
        <span style={{ fontSize: '0.82rem', color: '#1d1a14', fontWeight: 700 }}>{invoiceNumber}</span>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
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
          Print Invoice
        </button>
      </div>

      {/* Invoice content on page */}
      <div dangerouslySetInnerHTML={{ __html: invoiceHtml }} />

      {/* Print preview overlay */}
      {showPreview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: '#2b2519',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {/* Preview toolbar — hidden on print */}
          <div
            className="no-print"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1.25rem',
              background: '#1e1b15',
              borderBottom: '1px solid #3d3522',
              position: 'sticky',
              top: 0,
              zIndex: 1,
              fontFamily: 'Arial, Helvetica, sans-serif',
            }}
          >
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              style={{
                fontSize: '0.82rem',
                color: '#e5d48a',
                fontWeight: 600,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              ← Back
            </button>
            <span style={{ color: '#55493a', fontSize: '0.82rem' }}>|</span>
            <span style={{ fontSize: '0.82rem', color: '#c8b264', fontWeight: 700 }}>Print Preview — {invoiceNumber}</span>
            <button
              type="button"
              onClick={async () => {
                const win = window.open('', '_blank');
                if (!win) return;
                win.document.write(
                  '<!DOCTYPE html><html><head><meta charset="utf-8">' +
                  `<title>${invoiceNumber}</title>` +
                  `<style>*{box-sizing:border-box;}body{margin:0;padding:0;zoom:${INVOICE_PRINT_SCALE};}@page{size:letter;margin:0.5in;}</style>` +
                  `</head><body>${invoiceHtml}</body></html>`,
                );
                win.document.close();
                win.onafterprint = () => win.close();
                await waitForPrintImages(win);
                await waitForPrintLayout(win);
                win.focus();
                win.print();
              }}
              style={{
                marginLeft: 'auto',
                padding: '0.5rem 1.4rem',
                background: 'linear-gradient(135deg, #dcb336, #b5890c)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.82rem',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Print Now
            </button>
          </div>

          {/* Paper — the only thing that prints */}
          <div
            className="invoice-print-paper"
            style={{
              width: 'min(816px, calc(100% - 2rem))',
              margin: '1.5rem auto 3rem',
              boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
            }}
            dangerouslySetInnerHTML={{ __html: invoiceHtml }}
          />
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; zoom: ${INVOICE_PRINT_SCALE}; }
        }
      `}</style>
    </>
  );
}
