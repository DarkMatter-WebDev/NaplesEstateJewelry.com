'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Order, OrderItem } from '@/types/sales';
import { formatCurrency, formatOrderDate, formatPublicPurity, orderStatusLabel } from '@/types/sales';
import { formatProductItemYear } from '@/types/product';
import { describeShippingService } from '@/lib/shipping-service';
import { describeOrderShippingService } from '@/lib/checkout-shipping';
import { itemTitleIn, metalIn, orderDateTimeLine, orderStatusLabelEs, paymentMethodLabelIn, type OrderLanguage } from '@/lib/order-language';
import PrintLanguageSwitch from '@/components/admin/PrintLanguageSwitch';

type PrintableOrder = Order & { order_items: OrderItem[] };

function formatOrderAddress(address: unknown): string[] {
  if (!address || typeof address !== 'object') return [];
  const a = address as Record<string, unknown>;
  const get = (key: string) => (typeof a[key] === 'string' ? (a[key] as string).trim() : '');
  const cityLine = [[get('city'), get('state')].filter(Boolean).join(', '), get('postal_code')]
    .filter(Boolean)
    .join(' ')
    .trim();
  return [get('line1'), get('line2'), cityLine, get('country')].filter((line) => line.length > 0);
}

function clampMoneyDiscount(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

function closePreview(backHref: string) {
  if (window.opener) {
    window.close();
    return;
  }
  window.location.href = backHref;
}

export default function PrintOrderClient({
  adminEmail,
  backHref,
  invoiceNumber,
  order,
  printedAt,
  language,
  orderLanguage,
  spanishTitles,
  basePath,
}: {
  adminEmail: string | null;
  backHref: string;
  invoiceNumber: string;
  order: PrintableOrder;
  printedAt: string;
  /** Spanish for a Spanish order, or on "Print in: Español" (2026-11-21). */
  language: OrderLanguage;
  orderLanguage: OrderLanguage;
  spanishTitles: Record<string, string> | null;
  basePath: string;
}) {
  const es = language === 'es';
  const shippingAddress = formatOrderAddress(order.shipping_address);
  const billingAddress = formatOrderAddress(order.billing_address);
  const service = describeShippingService(order);
  // Spanish: the customer's shipping name only; the packing notes are the shop's, in English.
  const shippingLabel = es
    ? describeOrderShippingService(String(order.shipping_method ?? ''), Number(order.subtotal), Number(order.shipping_fee), true)
    : service.label;
  const dateLine = (iso: string) => (es ? orderDateTimeLine(iso, 'es') : formatOrderDate(iso));

  useEffect(() => {
    document.body.classList.add('order-print-preview-active');
    return () => document.body.classList.remove('order-print-preview-active');
  }, []);

  return (
    <div className="order-print-preview-root">
      <div className="print-toolbar no-print">
        <button type="button" onClick={() => closePreview(backHref)}>
          Close Preview
        </button>
        <Link href={backHref}>Back to Order</Link>
        <strong>Print Preview - {order.order_number}</strong>
        <span className="lang"><PrintLanguageSwitch current={language} orderLanguage={orderLanguage} basePath={basePath} /></span>
        <button type="button" className="primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <main className="paper" lang={language}>
        <header className="print-document-header">
          <div>
            <div className="brand">Naples Estate Jewelry</div>
            <h1>{es ? 'Factura del pedido' : 'Order Invoice'}</h1>
            <p className="meta">{order.order_number} - {invoiceNumber}</p>
          </div>
          <div className="meta right">
            {es ? 'Creado' : 'Created'} {dateLine(order.created_at)}<br />
            {es ? 'Impreso' : 'Printed'} {dateLine(printedAt)}
          </div>
        </header>

        <section className="status-grid">
          <StatusBox label={es ? 'Pago' : 'Payment'} value={order.payment_status} es={es} />
          <StatusBox label={es ? 'Entrega' : 'Fulfillment'} value={order.fulfillment_status} es={es} />
          <StatusBox label={es ? 'Pedido' : 'Order'} value={order.order_status} es={es} />
        </section>

        <section className="info-grid">
          <InfoBlock label={es ? 'Cliente' : 'Customer'}>
            <p>
              {order.customer_name || '-'}<br />
              {order.customer_email || '-'}<br />
              {order.customer_phone || '-'}
            </p>
          </InfoBlock>
          <InfoBlock label={es ? 'Pago / Envío' : 'Payment / Shipping'}>
            <p>
              {es ? 'Forma de pago' : 'Method'}: {paymentMethodLabelIn(order.payment_method, language)}<br />
              {/* Spanish: the stored reference is the shop's English note ("In store · Check"); Forma de pago above already says it. */}
              {!(es && /^(In store|Invoice) · /.test(order.payment_reference ?? '')) && <>{es ? 'Referencia' : 'Reference'}: {order.payment_reference || '-'}<br /></>}
              {es ? 'Envío' : 'Shipping'}: {shippingLabel}
              {!es && service.detail ? <><br /><span style={{ fontSize: '0.85em' }}>{service.detail}</span></> : null}
            </p>
          </InfoBlock>
          {shippingAddress.length > 0 && (
            <InfoBlock label={es ? 'Dirección de envío' : 'Shipping Address'}>
              <AddressLines lines={shippingAddress} />
            </InfoBlock>
          )}
          {billingAddress.length > 0 && (
            <InfoBlock label={es ? 'Dirección de facturación' : 'Billing Address'}>
              <AddressLines lines={billingAddress} />
            </InfoBlock>
          )}
        </section>

        <table>
          <thead>
            <tr>
              <th>{es ? 'Artículo' : 'Item'}</th>
              <th>{es ? 'Inventario' : 'Inventory'}</th>
              <th className="money">{es ? 'Precio unitario' : 'Unit Price'}</th>
              <th className="money">{es ? 'Cant.' : 'Qty'}</th>
              <th className="money">{es ? 'Descuento' : 'Discount'}</th>
              <th className="money">{es ? 'Total' : 'Line Total'}</th>
            </tr>
          </thead>
          <tbody>
            {order.order_items.length > 0 ? order.order_items.map((item) => {
              const qty = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
              const lineSubtotal = item.price_snapshot * qty;
              const discount = clampMoneyDiscount(Number(item.discount ?? 0), lineSubtotal);
              const lineTotal = Math.max(lineSubtotal - discount, 0);
              const year = formatProductItemYear(item.item_year_snapshot);
              const specs = [
                year ? `Ca. ${year}` : null,
                metalIn(item.metal_snapshot, language),
                item.purity_snapshot ? (es ? `pureza ${formatPublicPurity(item.purity_snapshot)}` : `${formatPublicPurity(item.purity_snapshot)} purity`) : null,
                item.gram_weight_snapshot ? `${item.gram_weight_snapshot}g` : null,
              ].filter(Boolean).join(' - ');

              return (
                <tr key={item.id}>
                  <td>
                    <strong>{itemTitleIn(item, language, spanishTitles)}</strong>
                    <span>{specs || (es ? 'Joya de patrimonio' : 'Estate jewelry item')}</span>
                  </td>
                  <td>{item.inventory_number || '-'}</td>
                  <td className="money">{formatCurrency(item.price_snapshot)}</td>
                  <td className="money">{qty}</td>
                  <td className="money">{discount > 0 ? `-${formatCurrency(discount)}` : '-'}</td>
                  <td className="money strong">{formatCurrency(lineTotal)}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={6}>{es ? 'No se adjuntaron detalles de los artículos.' : 'No item details were attached.'}</td></tr>
            )}
          </tbody>
        </table>

        <section className="summary">
          <SummaryRow label="Subtotal" value={formatCurrency(order.subtotal)} />
          {order.discount > 0 && <SummaryRow label={es ? 'Descuento' : 'Discount'} value={`-${formatCurrency(order.discount)}`} />}
          <SummaryRow label={es ? 'Impuesto' : 'Tax'} value={formatCurrency(order.tax)} />
          <SummaryRow label={es ? 'Envío' : 'Shipping'} value={formatCurrency(order.shipping_fee)} />
          <SummaryRow label="Total" value={formatCurrency(order.total)} strong />
          {order.refund_amount != null && order.refund_amount > 0 && (
            <SummaryRow label={es ? 'Reembolsado' : 'Refunded'} value={`-${formatCurrency(order.refund_amount)}`} />
          )}
        </section>

        {(order.customer_notes || order.internal_notes) && (
          <section className="notes">
            {order.customer_notes && (
              <InfoBlock label={es ? 'Notas del cliente' : 'Customer Notes'}>
                <p className="preline">{order.customer_notes}</p>
              </InfoBlock>
            )}
            {order.internal_notes && (
              <InfoBlock label={es ? 'Notas internas' : 'Internal Notes'}>
                <p className="preline">{order.internal_notes}</p>
              </InfoBlock>
            )}
          </section>
        )}

        <footer>
          {es
            ? <>Impreso desde la página del pedido{adminEmail ? ` por ${adminEmail}` : ''}.</>
            : <>Printed from the admin order detail page{adminEmail ? ` by ${adminEmail}` : ''}.</>}
        </footer>
      </main>

      <style>{`
        * { box-sizing: border-box; }
        body.order-print-preview-active [data-customer-reveal-root] > :not(.order-print-preview-root),
        body.order-print-preview-active [role="dialog"],
        body.order-print-preview-active [role="region"],
        body.order-print-preview-active header:not(.print-document-header),
        body.order-print-preview-active footer {
          display: none !important;
        }
        body {
          margin: 0;
          background: #2b2519;
          color: #1d1a14;
          font-family: Arial, Helvetica, sans-serif;
          line-height: 1.45;
        }
        .print-toolbar {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.8rem 1rem;
          background: #1e1b15;
          border-bottom: 1px solid #3d3522;
          color: #e5d48a;
        }
        .print-toolbar a,
        .print-toolbar button {
          border: 1px solid #705f2d;
          background: transparent;
          color: #f3e6a9;
          cursor: pointer;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 700;
          padding: 0.55rem 0.9rem;
          text-decoration: none;
        }
        .print-toolbar strong {
          color: #f3e6a9;
          font-size: 0.88rem;
        }
        .print-toolbar .lang { margin-left: auto; }
        .print-toolbar .lang a { border: none; padding: 0.3rem 0.7rem; font-size: 0.78rem; }
        .print-toolbar .primary {
          border-color: #b5890c;
          background: #b5890c;
          color: #ffffff;
        }
        .paper {
          width: min(8.5in, calc(100% - 2rem));
          min-height: 11in;
          margin: 1.25rem auto 2rem;
          padding: 0.5in;
          background: #ffffff;
          box-shadow: 0 12px 42px rgba(0, 0, 0, 0.42);
        }
        header {
          display: flex;
          justify-content: space-between;
          gap: 1.5rem;
          border-bottom: 2px solid #d5c697;
          padding-bottom: 0.22in;
        }
        .brand {
          color: #735c00;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }
        h1, h2, h3 { margin: 0; }
        h1 {
          margin-top: 0.08in;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 27px;
          line-height: 1.15;
        }
        .meta {
          color: #746b5b;
          font-size: 12px;
          margin-top: 0.08in;
        }
        .right { text-align: right; }
        .status-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.12in;
          margin-top: 0.24in;
        }
        .status, .info-block {
          border: 1px solid #eadfbd;
          break-inside: avoid;
        }
        .status {
          padding: 0.1in 0.12in;
          background: #fbfaf5;
          font-size: 12px;
        }
        .status span, .info-block h2 {
          display: block;
          color: #746b5b;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.11em;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .status strong { color: #735c00; }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.18in;
          margin-top: 0.24in;
        }
        .info-block { padding: 0.14in; }
        .info-block p {
          margin: 0;
          font-size: 12px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 0.24in;
          font-size: 11.5px;
        }
        th {
          border-bottom: 1px solid #d5c697;
          color: #746b5b;
          font-size: 9.5px;
          letter-spacing: 0.1em;
          padding: 0.09in 0.06in;
          text-align: left;
          text-transform: uppercase;
        }
        td {
          border-bottom: 1px solid #eadfbd;
          padding: 0.1in 0.06in;
          vertical-align: top;
        }
        td strong { display: block; }
        td span {
          color: #746b5b;
          display: block;
          font-size: 10.5px;
          margin-top: 2px;
        }
        .money { text-align: right; white-space: nowrap; }
        .strong { color: #735c00; font-weight: 700; }
        .summary {
          margin-left: auto;
          margin-top: 0.2in;
          width: min(3.2in, 100%);
          border: 1px solid #eadfbd;
          padding: 0.12in 0.16in;
          background: #fbfaf5;
          font-size: 12px;
        }
        .summary div {
          display: flex;
          justify-content: space-between;
          gap: 0.3in;
          padding: 0.035in 0;
        }
        .summary .total {
          border-top: 1px solid #d5c697;
          color: #735c00;
          font-weight: 700;
          margin-top: 0.05in;
          padding-top: 0.09in;
        }
        .notes {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.18in;
          margin-top: 0.22in;
        }
        .preline { white-space: pre-line; }
        footer {
          border-top: 1px solid #d5c697;
          color: #746b5b;
          font-size: 10.5px;
          margin-top: 0.25in;
          padding-top: 0.12in;
        }
        @page { size: letter; margin: 0.45in; }
        @media print {
          body { background: #ffffff; }
          body * { visibility: hidden !important; }
          .order-print-preview-root,
          .order-print-preview-root * { visibility: visible !important; }
          .order-print-preview-root {
            left: 0;
            position: absolute;
            top: 0;
            width: 100%;
          }
          .no-print { display: none !important; }
          .paper {
            width: auto;
            min-height: auto;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }
        }
        @media (max-width: 720px) {
          .paper { padding: 0.28in; }
          header, .info-grid, .notes, .status-grid { grid-template-columns: 1fr; display: grid; }
          .right { text-align: left; }
          .print-toolbar { flex-wrap: wrap; }
          .print-toolbar .primary { margin-left: 0; }
        }
      `}</style>
    </div>
  );
}

function StatusBox({ label, value, es = false }: { label: string; value: string; es?: boolean }) {
  return (
    <div className="status">
      <span>{label}</span>
      <strong>{es ? orderStatusLabelEs(value) : orderStatusLabel(value)}</strong>
    </div>
  );
}

function InfoBlock({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="info-block">
      <h2>{label}</h2>
      {children}
    </section>
  );
}

function AddressLines({ lines }: { lines: string[] }) {
  return (
    <p>
      {lines.map((line) => (
        <span key={line}>
          {line}<br />
        </span>
      ))}
    </p>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'total' : ''}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
