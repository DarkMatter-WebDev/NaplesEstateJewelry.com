'use client';

import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import type { SpotData } from '@/types/product';
import { formatCurrency } from '@/types/sales';
import { round2 } from '@/lib/checkout-pricing';
import { parseInStorePrice, salePaymentPartLabel, salePaymentsCollectPhrase } from '@/lib/in-store-sale';
import { tradeInBalance, tradeInSaleTotals } from '@/lib/trade-in-sale';
import { paperReceiptDocument, type PaperReceipt } from '@/lib/order-receipt-paper';
import { printPaperInFrame } from '@/lib/print-paper';
import { SALE_PRINT_MESSAGES } from '@/lib/sale-print-requests';
import BuyReceiptForm, { type BuyReceiptTradeMode, type TradeSaved, type TradeSideContext } from '@/components/admin/buy-receipts/BuyReceiptForm';
import SaleItemsEditor, {
  newSaleItem,
  saleItemLabel,
  saleItemPayload,
  saleItemsProblem,
  type InStoreProduct,
  type SaleItemDraft,
} from './SaleItemsEditor';
import SalePaymentsEditor, {
  newSalePayments,
  salePaymentParts,
  salePaymentsPayload,
  salePaymentsProblem,
  type SalePaymentsDraft,
} from './SalePaymentsEditor';
import SaleStationPrint from './SaleStationPrint';
import type { BuyReceiptRow } from '@/lib/buy-receipts';

/**
 * Admin → Instant Sale → Trade-in sale (owner, 2026-11-21, option C mockup 1:
 * "Yes, build it"). A customer trades gold toward a purchase:
 * - LEFT, the buy receipt — the very form Buy Receipts uses (`BuyReceiptForm`
 *   in trade mode): seller boxes, ID photo, thumbprint, customer input mode,
 *   the Spanish copy, print sets. Its "Paid by" starts with the locked
 *   trade-in credit.
 * - RIGHT, what they buy (the In-store sale's item box, pickup only) and the
 *   difference: the customer pays the rest, or — gold worth more — the rest is
 *   paid to them on the receipt.
 * One save makes both records, each naming the other (`/api/admin/trade-in-sales`).
 */

const label = 'form-label';
const labelStyle = { color: 'var(--color-primary)' } as const;
const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;
const headline = { fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' } as const;

function Step({ n }: { n: number }) {
  return (
    <span
      className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full border text-[0.8rem] align-[2px]"
      style={{ borderColor: 'var(--color-primary-container)', background: '#fbf5dd', color: 'var(--color-primary)', fontFamily: 'var(--font-headline)' }}
    >
      {n}
    </span>
  );
}

/**
 * The sale's state, owned by `TradeInSaleForm` and read by the two pieces the
 * buy-receipt form draws (the right-hand column and the after-save panel).
 * Passed through context so those pieces are ordinary components defined once
 * here — never re-created on each render (which would remount them, and the
 * boxes would lose the cursor at every key).
 */
type SaleState = {
  adminBasePath: string;
  products: InStoreProduct[];
  spotData: SpotData | null;
  tradeInPrices: Record<string, number>;
  items: SaleItemDraft[];
  setItems: Dispatch<SetStateAction<SaleItemDraft[]>>;
  payments: SalePaymentsDraft;
  setPayments: (next: SalePaymentsDraft) => void;
  note: string;
  setNote: (next: string) => void;
  round: number;
  prices: (number | null)[];
  subtotal: number | null;
  totals: { subtotal: number; shippingFee: number; tax: number; total: number } | null;
};
const SaleStateContext = createContext<SaleState | null>(null);

function useSaleState(): SaleState {
  const state = useContext(SaleStateContext);
  if (!state) throw new Error('TradeInSaleForm pieces must be drawn inside TradeInSaleForm.');
  return state;
}

function listedItem(): SaleItemDraft {
  // A trade is nearly always toward a piece from the case: start on "Listed item".
  return { ...newSaleItem(), mode: 'listed' };
}

/** The right-hand column: what they are buying, the difference, and the one save. */
function TradeSaleSide({ context }: { context: TradeSideContext }) {
  const { products, spotData, tradeInPrices, items, setItems, payments, setPayments, note, setNote, round, prices, subtotal, totals } = useSaleState();
  const balance = totals && context.tradeValue > 0 ? tradeInBalance(context.tradeValue, totals.total) : null;
  const parts = balance && balance.customerPays > 0 ? salePaymentParts(payments, balance.customerPays) : null;
  const firstName = context.seller.name.trim().split(/\s+/)[0] || 'the seller';
  const working = context.busy !== null;
  return (
    <div className="grid gap-4">
      <section className="grid gap-4 rounded-[1.25rem] border bg-white p-5" style={cardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold" style={headline}><Step n={2} />What they&rsquo;re buying</h2>
          <span className="rounded-full px-2.5 py-1 text-[0.65rem] font-bold" style={{ background: '#eaf4ec', color: '#16653c' }}>Pickup today</span>
        </div>
        <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: '#e9d7a0', background: '#fbf5dd' }}>
          <strong>Customer:</strong>{' '}
          {context.seller.name.trim() || <span style={hintStyle}>the seller&rsquo;s name</span>}
          {context.seller.phone.trim() ? ` · ${context.seller.phone.trim()}` : ''}
          {context.seller.email.trim() ? ` · ${context.seller.email.trim()}` : ''}
          <span className="block text-xs" style={hintStyle}>Taken from the receipt — nothing to type twice.</span>
        </div>
        <SaleItemsEditor
          key={round}
          items={items}
          setItems={setItems}
          products={products}
          spotData={spotData}
          priceLabel="Price sold (before tax)"
          listedNote="marketplace listings end on save"
          tradeInPrices={tradeInPrices}
        />
      </section>

      <section className="grid gap-3 rounded-[1.25rem] border p-5" style={{ ...cardStyle, background: 'var(--color-surface-container-low)' }}>
        <h2 className="text-lg font-bold" style={headline}><Step n={3} />The difference</h2>
        {items.length > 1 && items.map((item, index) => (
          <div key={item.key} className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{index + 1} · {saleItemLabel(item)}</span>
            <span>{prices[index] != null ? formatCurrency(prices[index] as number) : '—'}</span>
          </div>
        ))}
        <div className={`flex justify-between gap-3 text-sm${items.length > 1 ? ' border-t border-dashed pt-2' : ''}`} style={items.length > 1 ? cardStyle : undefined}>
          <span>{items.length > 1 ? `Items · ${items.length}` : saleItemLabel(items[0])}</span>
          <span>{subtotal != null ? formatCurrency(subtotal) : '—'}</span>
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <span>FL sales tax · 6% <span className="text-xs" style={hintStyle}>(full price, as on every pickup)</span></span>
          <span>{totals ? formatCurrency(totals.tax) : '—'}</span>
        </div>
        <div className="flex justify-between gap-3 border-t border-dashed pt-2 text-sm font-bold" style={cardStyle}>
          <span>Sale total</span><span>{totals ? formatCurrency(totals.total) : '—'}</span>
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <span>Trade-in credit · gold received <span className="text-xs" style={hintStyle}>(the receipt: {formatCurrency(context.tradeValue)})</span></span>
          <span className="font-bold" style={{ color: '#16653c' }}>{balance ? `− ${formatCurrency(balance.credit)}` : '—'}</span>
        </div>

        {!balance ? (
          <p className="border-t pt-3 text-sm" style={{ ...cardStyle, ...hintStyle }}>
            {context.tradeValue > 0 ? 'Price what they are buying to see the difference.' : 'Add the gold and its amount on the receipt, and price what they are buying.'}
          </p>
        ) : balance.customerPays > 0 ? (
          <>
            <div className="flex justify-between border-t pt-3 text-2xl font-bold" style={{ ...cardStyle, fontFamily: 'var(--font-headline)', color: '#8a4b00' }}>
              <span>Customer pays</span><span>{formatCurrency(balance.customerPays)}</span>
            </div>
            <span className={label} style={labelStyle}>Paid by</span>
            <SalePaymentsEditor draft={payments} onChange={setPayments} total={balance.customerPays} compact totalWord="rest" />
            <span className="text-xs" style={hintStyle}>
              {parts ? <>Collect <strong>{salePaymentsCollectPhrase(parts)}</strong> before saving.</> : 'The payments must add up to what the customer pays.'}
              {' '}The {formatCurrency(balance.credit)} credit is already on the receipt.
            </span>
          </>
        ) : balance.payout > 0 ? (
          <>
            <div className="flex justify-between border-t pt-3 text-2xl font-bold" style={{ ...cardStyle, fontFamily: 'var(--font-headline)', color: '#16653c' }}>
              <span>You pay {firstName}</span><span>{formatCurrency(balance.payout)}</span>
            </div>
            <p className="rounded-r-lg border-l-[3px] px-3 py-2 text-xs" style={{ borderColor: '#1a4d8f', background: '#eef3fa' }}>
              The gold is worth more than the purchase, so the sale is paid in full by the trade and the{' '}
              <strong>{formatCurrency(balance.payout)} is paid out on the buy receipt</strong> — choose how under
              &ldquo;Paid by&rdquo; on the left (cash, check, Zelle…).
            </p>
          </>
        ) : (
          <div className="flex justify-between border-t pt-3 text-2xl font-bold" style={{ ...cardStyle, fontFamily: 'var(--font-headline)' }}>
            <span>Even trade</span><span>{formatCurrency(0)}</span>
          </div>
        )}

        <label className="block">
          <span className={label} style={labelStyle}>Note<span style={{ ...hintStyle, letterSpacing: '0.06em' }}> optional · kept on the order</span></span>
          <input className="form-field" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Anything to remember about this trade" />
        </label>

        {context.error && (
          <div className="rounded-lg px-3 py-2 text-sm" role="alert" style={{ background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}>{context.error}</div>
        )}
        <div className="grid gap-2 pt-1">
          <button type="button" className="gold-button text-xs" disabled={working} onClick={() => context.save('save')}>
            {context.busy === 'save' ? 'Saving…' : balance && balance.customerPays > 0 ? `Save trade · collect ${formatCurrency(balance.customerPays)}` : balance && balance.payout > 0 ? `Save trade · pay ${formatCurrency(balance.payout)}` : 'Save trade'}
          </button>
          <button type="button" className="outline-button text-xs" style={{ borderWidth: '1.5px', borderColor: '#b5890c' }} disabled={working} onClick={() => context.save('print')}>
            {context.busy === 'print' ? 'Saving…' : 'Save & print both receipts'}
          </button>
          <button type="button" className="outline-button text-xs" style={{ borderWidth: '1.5px', borderColor: '#b5890c' }} disabled={working} onClick={() => context.save('send')}>
            {context.busy === 'send' ? 'Saving…' : 'Save & send both to desktop printer'}
          </button>
          <button type="button" className="justify-self-start text-xs underline" style={hintStyle} disabled={working} onClick={context.clear}>Clear</button>
        </div>
        <span className="text-xs" style={hintStyle}>
          One save makes <strong>two records</strong>: the buy receipt (BUY-…, your Florida record) and the sale (NEJ-…). Each names the other.
          {context.emailCopy ? ' Both receipts are emailed to the seller.' : ' Tick “Email copy” on the receipt to email both.'}
        </span>
      </section>
    </div>
  );
}

/** The sale's half of the after-save panel, beside the buy receipt's. */
function TradeSaleSaved({ saved, receipt, buyPrintDone }: { saved: TradeSaved; receipt: BuyReceiptRow; buyPrintDone: boolean }) {
  const { items, totals, payments, adminBasePath } = useSaleState();
  const saleTotal = totals?.total ?? null;
  const [printNote, setPrintNote] = useState<string | null>(null);
  const balance = saleTotal != null ? tradeInBalance(receipt.total, saleTotal) : null;
  const collected = balance && balance.customerPays > 0 ? salePaymentParts(payments, balance.customerPays) : null;

  /** Print the one-page sale receipt in a hidden frame; a failure is said under the buttons. */
  function printSale(paper: PaperReceipt) {
    return printPaperInFrame(paperReceiptDocument(paper)).catch(() => {
      setPrintNote('Printing did not open. Press Print sale receipt to try again.');
    });
  }

  // "Save & print both": the sale's paper prints once the buy receipt's print is done.
  const printed = useRef(false);
  useEffect(() => {
    if (saved.action !== 'print' || !buyPrintDone || printed.current || !saved.paper) return;
    printed.current = true;
    void printSale(saved.paper);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyPrintDone]);

  return (
    <div className="grid gap-4" role="status">
      <div className="grid justify-items-center gap-2 pt-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border" style={{ borderColor: 'var(--color-primary)', background: '#fbf5dd' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
        </span>
        <h2 className="text-2xl font-bold" style={headline}>Sale recorded</h2>
        <span className="text-xs" style={hintStyle}>Order <strong>{saved.orderNumber}</strong> · paid toward with <strong>{receipt.receipt_number}</strong></span>
      </div>
      <div className="grid gap-2 rounded-[1.25rem] border bg-white p-5 text-sm" style={cardStyle}>
        <div className="flex justify-between gap-3">
          <span style={hintStyle}>{items.length > 1 ? `Items · ${items.length}` : 'Item'}</span>
          <span className="text-right">{items.map((item) => <span key={item.key} className="block">{item.mode === 'listed' && item.selected ? `#${item.selected.inventory_number ?? '—'} · ${item.selected.title}` : saleItemLabel(item)}</span>)}</span>
        </div>
        <div className="flex justify-between gap-3"><span style={hintStyle}>Sale total</span><span>{saleTotal != null ? formatCurrency(saleTotal) : '—'}</span></div>
        <div className="flex justify-between gap-3">
          <span style={hintStyle}>Paid by</span>
          <span className="text-right">
            {balance && <span className="block">{salePaymentPartLabel({ method: 'trade_credit', reference: receipt.receipt_number })} {formatCurrency(balance.credit)}</span>}
            {collected?.map((part, index) => <span key={`${index}-${part.method}`} className="block">{salePaymentPartLabel(part)} {formatCurrency(part.amount)}</span>)}
          </span>
        </div>
        {balance && balance.payout > 0 && (
          <div className="flex justify-between gap-3"><span style={hintStyle}>Paid to the seller</span><span className="font-bold" style={{ color: '#16653c' }}>{formatCurrency(balance.payout)} (on {receipt.receipt_number})</span></div>
        )}
        <div className="flex justify-between gap-3">
          <span style={hintStyle}>Sale receipt</span>
          <span className="font-bold" style={{ color: saved.saleReceiptEmailed ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}>{saved.saleReceiptEmailed ? 'Emailed' : 'Not emailed'}</span>
        </div>
        {saved.linkError && <span className="text-xs" role="alert" style={{ color: 'var(--color-error)' }}>{saved.linkError}</span>}
      </div>
      <div className="grid gap-2">
        {printNote && <span className="text-center text-xs" role="alert" style={{ color: 'var(--color-error)' }}>{printNote}</span>}
        {saved.paper ? (
          <button type="button" className="outline-button text-xs" onClick={() => { setPrintNote(null); void printSale(saved.paper as PaperReceipt); }}>Print sale receipt</button>
        ) : (
          <Link href={`${adminBasePath}/orders/${saved.orderId}/invoice`} target="_blank" rel="noopener noreferrer" className="outline-button text-xs">Print sale receipt</Link>
        )}
        <SaleStationPrint
          orderId={saved.orderId}
          initialRequest={saved.stationRequest}
          initialError={saved.action === 'send' && !saved.stationRequest ? `${SALE_PRINT_MESSAGES.notSent}${saved.stationError ? ` (${saved.stationError})` : ''}` : null}
        />
        <Link href={`${adminBasePath}/orders/${saved.orderId}`} className="outline-button text-xs">Open order {saved.orderNumber}</Link>
      </div>
    </div>
  );
}

export default function TradeInSaleForm({
  adminBasePath,
  nowIso,
  products,
  spotData,
  tradeInPrices,
}: {
  adminBasePath: string;
  nowIso: string;
  products: InStoreProduct[];
  spotData: SpotData | null;
  tradeInPrices: Record<string, number>;
}) {
  const [items, setItems] = useState<SaleItemDraft[]>(() => [listedItem()]);
  const [payments, setPayments] = useState(() => newSalePayments('zettle'));
  const [note, setNote] = useState('');
  /** Bumped by "Clear" / "New trade-in sale" so the item editor starts fresh. */
  const [round, setRound] = useState(0);

  const prices = items.map((item) => parseInStorePrice(item.price));
  const subtotal = prices.every((value) => value != null) ? round2(prices.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null;
  const totals = subtotal != null ? tradeInSaleTotals(subtotal) : null;

  function clearSale() {
    setItems([listedItem()]);
    setPayments(newSalePayments('zettle'));
    setNote('');
    setRound((value) => value + 1);
  }

  const trade: BuyReceiptTradeMode = {
    saleTotal: totals?.total ?? null,
    salePart: (tradeValue) => {
      const problem = saleItemsProblem(items);
      if (problem) return { error: `What they're buying: ${problem}` };
      if (!totals) return { error: "What they're buying: enter the price, e.g. 1460." };
      const balance = tradeInBalance(tradeValue, totals.total);
      if (balance.customerPays > 0) {
        const paymentProblem = salePaymentsProblem(payments, balance.customerPays);
        if (paymentProblem) return { error: paymentProblem };
      }
      return {
        value: {
          items: items.map(saleItemPayload),
          ...(balance.customerPays > 0 ? salePaymentsPayload(payments, balance.customerPays) : {}),
          note,
        },
      };
    },
    Side: TradeSaleSide,
    Saved: TradeSaleSaved,
    onClear: clearSale,
  };

  const state: SaleState = {
    adminBasePath, products, spotData, tradeInPrices, items, setItems, payments, setPayments, note, setNote, round, prices, subtotal, totals,
  };
  return (
    <SaleStateContext.Provider value={state}>
      <BuyReceiptForm adminBasePath={adminBasePath} nowIso={nowIso} trade={trade} />
    </SaleStateContext.Provider>
  );
}
