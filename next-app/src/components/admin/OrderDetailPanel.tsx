'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startRouteProgress } from '@/components/layout/RouteProgressBar';
import { createClient } from '@/lib/supabase/client';
import type { Order, OrderItem, FulfillmentStatus, OrderStatus } from '@/types/sales';
import { formatCurrency, formatOrderDate, orderStatusLabel } from '@/types/sales';
import type { ProductStatus } from '@/types/product';
import { buildInvoiceEmailContent, invoiceNumberForOrder, isOrderPaid, withInvoiceLineDiscounts } from '@/lib/order-invoice-email';
import { buildFulfillmentUpdateEmailContent } from '@/lib/order-fulfillment-email';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import { formatUsdPrice } from '@/lib/pricing';
import { paymentMethodLabel } from '@/lib/in-store-sale';
import { describeShippingService } from '@/lib/shipping-service';
import { adminUpdateProductsStatus } from '@/app/actions/admin-products';
import { AppIcon } from '@/components/AppIcon';
import OrderTaxExemptionPanel from '@/components/admin/OrderTaxExemptionPanel';
import type { TaxExemptSnapshot } from '@/lib/tax-exempt';
import { heardAboutAdminLabel } from '@/lib/order-heard-about';
import type { OrderGift } from '@/lib/order-gift';

const GOLD = '#735c00';
const BORDER = 'var(--color-outline-variant)';
const FULFILLMENT_MARK_STATUSES: FulfillmentStatus[] = ['packed', 'shipped', 'picked_up'];
const ORDER_EMAIL_FROM_ADDRESS = 'noreply@naplesestatejewelry.com';

function emailInitiatorLabel(value: string | null) {
  if (!value) return 'Automatic send';
  return /^Automatic(?:\s|$)/i.test(value) ? value : `Initiated by ${value}`;
}

/** Format a stored address jsonb ({line1,line2,city,state,postal_code,country}) into display lines. */
function formatOrderAddress(address: unknown): string | null {
  if (!address || typeof address !== 'object') return null;
  const a = address as Record<string, unknown>;
  const get = (key: string) => (typeof a[key] === 'string' ? (a[key] as string).trim() : '');
  const cityLine = [[get('city'), get('state')].filter(Boolean).join(', '), get('postal_code')]
    .filter(Boolean)
    .join(' ')
    .trim();
  const lines = [get('line1'), get('line2'), cityLine, get('country')].filter((line) => line.length > 0);
  return lines.length > 0 ? lines.join('\n') : null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  created_at: string;
}

interface OrderEmail {
  id: string;
  email_type: string;
  recipient: string;
  subject: string | null;
  status: string | null;
  sent_by_email: string | null;
  created_at: string;
}

interface Props {
  initialOrder: Order & { order_items: OrderItem[] };
  /** Live melt value keyed by product_id; items without an entry show none. */
  itemMeltValues?: Record<string, number>;
  initialInvoices: Invoice[];
  initialOrderEmails: OrderEmail[];
  adminEmail: string | null;
  locale: string;
  recycleBinSupported?: boolean;
  trackingSupported?: boolean;
  /**
   * Admin-editable pickup hours (`formatPickupHours(await getStoreHours())`),
   * resolved by the server page — this client component cannot fetch the
   * schedule itself. Keeps the on-screen preview honest against what the
   * mailer will actually send.
   */
  pickupHours: string;
  /** The tax exemption noted on this order (lib/tax-exempt.ts), or null. */
  taxExemption?: TaxExemptSnapshot | null;
  /** "This is a gift" at checkout (lib/order-gift.ts), or null. */
  gift?: OrderGift | null;
}

export default function OrderDetailPanel({
  initialOrder,
  itemMeltValues = {},
  initialInvoices,
  initialOrderEmails,
  adminEmail,
  locale,
  recycleBinSupported = true,
  trackingSupported = true,
  pickupHours,
  taxExemption = null,
  gift = null,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const adminBasePath = locale === 'es' ? '/es/admin' : '/admin';
  const shopBasePath = locale === 'es' ? '/es/shop' : '/shop';
  const orderReturnPath = `${adminBasePath}/orders/${initialOrder.id}`;
  const [order, setOrder] = useState(initialOrder);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [orderEmails, setOrderEmails] = useState<OrderEmail[]>(initialOrderEmails);
  const [internalNotes, setInternalNotes] = useState(order.internal_notes ?? '');
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFullRefundConfirm, setShowFullRefundConfirm] = useState(false);
  const [showPartialRefund, setShowPartialRefund] = useState(false);
  const [partialRefundAmount, setPartialRefundAmount] = useState('');
  const [showEmailInvoice, setShowEmailInvoice] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState(order.customer_email ?? '');
  const [emailSending, setEmailSending] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pendingFulfillmentStatus, setPendingFulfillmentStatus] = useState<FulfillmentStatus | null>(null);
  const [notifyCustomerOnFulfillment, setNotifyCustomerOnFulfillment] = useState(true);
  const [showEmailUpdate, setShowEmailUpdate] = useState(false);
  const [emailUpdateStatus, setEmailUpdateStatus] = useState<FulfillmentStatus | null>(null);
  const [emailUpdateRecipient, setEmailUpdateRecipient] = useState(order.customer_email ?? '');
  const [emailUpdateSending, setEmailUpdateSending] = useState(false);
  const [emailUpdateMessage, setEmailUpdateMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [shippingCarrier, setShippingCarrier] = useState(order.shipping_carrier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? '');
  const [itemDiscounts, setItemDiscounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialOrder.order_items.map((item) => [item.id, String(item.discount ?? 0)])),
  );

  const orderIsPaid = isOrderPaid(order);
  const isPayPalOrder = order.payment_method === 'paypal';
  const refundedAmount = Number(order.refund_amount ?? 0);
  const remainingRefundAmount = Math.max(Number(order.total) - refundedAmount, 0);
  const invoiceDocLabel = orderIsPaid ? 'Receipt' : 'Invoice';
  const productIds = order.order_items.map((item) => item.product_id).filter(Boolean) as string[];
  const latestInvoice = invoices[0] ?? null;
  const invoiceNumber = invoiceNumberForOrder(order, latestInvoice?.invoice_number);
  const numericItemDiscounts = Object.fromEntries(Object.entries(itemDiscounts).map(([id, value]) => [id, Number(value) || 0]));
  const emailOrder = withInvoiceLineDiscounts(order, numericItemDiscounts);
  const emailContent = buildInvoiceEmailContent(emailOrder, invoiceNumber, { pickupHours });
  const emailUpdateContent = emailUpdateStatus ? buildFulfillmentUpdateEmailContent(order, emailUpdateStatus) : null;
  const persistedLineDiscount = order.order_items.reduce((sum, item) => sum + clampMoneyDiscount(Number(item.discount ?? 0), orderItemLineSubtotal(item)), 0);
  const editedLineDiscount = order.order_items.reduce((sum, item) => sum + clampMoneyDiscount(Number(itemDiscounts[item.id]) || 0, orderItemLineSubtotal(item)), 0);
  const orderLevelDiscount = Math.max(order.discount - persistedLineDiscount, 0);
  const editedTotalDiscount = orderLevelDiscount + editedLineDiscount;
  const taxableBeforeDiscount = Math.max(order.subtotal - order.discount, 0) + order.shipping_fee;
  const taxRate = taxableBeforeDiscount > 0 ? order.tax / taxableBeforeDiscount : 0;
  const editedTax = (Math.max(order.subtotal - editedTotalDiscount, 0) + order.shipping_fee) * taxRate;
  const editedTotal = Math.max(order.subtotal - editedTotalDiscount, 0) + editedTax + order.shipping_fee;

  async function updateOrder(updates: Partial<Order>, action: string) {
    setSaving(action);
    setMessage(null);
    const { error } = await supabase.from('orders').update(updates).eq('id', order.id);
    if (error) {
      setMessage({ text: error.message, ok: false });
      setSaving(null);
      return false;
    }
    setOrder((current) => ({ ...current, ...updates }));
    setSaving(null);
    router.refresh();
    return true;
  }

  async function updateProducts(status: ProductStatus) {
    if (productIds.length === 0) return true;
    const soldPrices = status === 'sold'
      ? Object.fromEntries(order.order_items
          .filter((item): item is OrderItem & { product_id: string } => Boolean(item.product_id))
          .map((item) => [item.product_id, Number(item.price_snapshot)]))
      : undefined;
    const result = await adminUpdateProductsStatus(productIds, status, soldPrices);
    if (result.error) {
      setMessage({ text: result.error, ok: false });
      return false;
    }
    // The server action also purges product/shop caches and coordinates
    // marketplace lifecycle handling for the affected products.
    return true;
  }

  async function restoreProductsToInventory() {
    setSaving('restore-inventory');
    setMessage(null);
    const ok = await updateProducts('available');
    setSaving(null);
    if (ok) {
      setMessage({
        text: 'Order item products restored to available inventory. The order status and payment record were left unchanged.',
        ok: true,
      });
    }
  }

  async function markPaid() {
    const ok = await updateOrder({ payment_status: 'paid', order_status: 'completed' }, 'paid');
    if (ok) {
      await updateProducts('sold');
      await generateInvoiceRecord({ silent: true });
      setMessage({ text: 'Order marked paid and products marked sold.', ok: true });
    }
  }

  async function markUnpaid() {
    // A PayPal-captured payment can't just be "marked unpaid" — the money is real.
    // Refund it (which is the correct state change) instead of desyncing the record.
    if (order.payment_method === 'paypal' && order.payment_status === 'paid') {
      setMessage({
        text: 'This PayPal order was actually paid. Use Refund (or Partial refund) instead of Mark Unpaid so the record matches the captured payment.',
        ok: false,
      });
      return;
    }
    const ok = await updateOrder({ payment_status: 'unpaid', order_status: 'open' }, 'unpaid');
    if (ok) {
      await updateProducts('pending_payment');
      setMessage({ text: 'Order marked unpaid and products returned to pending payment.', ok: true });
    }
  }

  async function refundPayPalOrder(targetRefundAmount: number, action: string) {
    setSaving(action);
    setMessage(null);
    const response = await fetch(`/api/admin/orders/${order.id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetRefundAmount }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage({
        text: result?.error ?? 'Could not complete the PayPal refund.',
        ok: false,
      });
      setSaving(null);
      return false;
    }

    if (result?.pending) {
      setMessage({ text: result.message ?? 'The PayPal refund is pending.', ok: true });
    } else {
      const nextRefundAmount = Number(result?.refundAmount ?? targetRefundAmount);
      const nextPaymentStatus = result?.paymentStatus === 'refunded' ? 'refunded' : 'partially_refunded';
      setOrder((current) => ({
        ...current,
        refund_amount: nextRefundAmount,
        payment_status: nextPaymentStatus,
        order_status: nextPaymentStatus === 'refunded' ? 'refunded' : current.order_status,
      }));
      setMessage({
        text: `${formatCurrency(nextRefundAmount)} has now been refunded through PayPal. Products were not returned to inventory automatically.`,
        ok: true,
      });
      router.refresh();
    }
    setSaving(null);
    return true;
  }

  async function markRefunded() {
    if (isPayPalOrder) {
      const ok = await refundPayPalOrder(order.total, 'refunded');
      if (ok) setShowFullRefundConfirm(false);
      return;
    }
    const ok = await updateOrder({
      payment_status: 'refunded',
      order_status: 'refunded',
      refund_amount: order.total,
    }, 'refunded');
    if (ok) setMessage({ text: 'Order marked refunded. Products were not returned to available automatically.', ok: true });
  }

  async function markPartiallyRefunded() {
    const additionalAmount = parseFloat(partialRefundAmount);
    if (!Number.isFinite(additionalAmount) || additionalAmount <= 0) {
      setMessage({ text: 'Enter a valid refund amount greater than zero.', ok: false });
      return;
    }
    if (additionalAmount > remainingRefundAmount) {
      setMessage({ text: `Additional refund cannot exceed ${formatCurrency(remainingRefundAmount)}.`, ok: false });
      return;
    }
    const targetRefundAmount = refundedAmount + additionalAmount;
    const ok = isPayPalOrder
      ? await refundPayPalOrder(targetRefundAmount, 'partial-refund')
      : await updateOrder({ payment_status: 'partially_refunded', refund_amount: targetRefundAmount }, 'partial-refund');
    if (ok) {
      setPartialRefundAmount('');
      setShowPartialRefund(false);
      if (!isPayPalOrder) {
        setMessage({ text: `Order marked partially refunded - ${formatCurrency(targetRefundAmount)} refunded in total.`, ok: true });
      }
    }
  }

  function openFulfillmentUpdate(status: FulfillmentStatus) {
    setPendingFulfillmentStatus(status);
    setNotifyCustomerOnFulfillment(true);
    setMessage(null);
    if (status === 'shipped') {
      setShippingCarrier(order.shipping_carrier ?? '');
      setTrackingNumber(order.tracking_number ?? '');
    }
  }

  async function updateFulfillment(status: FulfillmentStatus) {
    const updates: Partial<Order> = { fulfillment_status: status };
    if (status === 'shipped' && trackingSupported) {
      updates.shipping_carrier = shippingCarrier.trim() || null;
      updates.tracking_number = trackingNumber.trim() || null;
    }
    const ok = await updateOrder(updates, status);
    if (ok) setMessage({ text: `Fulfillment marked ${orderStatusLabel(status)}.`, ok: true });
    return ok;
  }

  async function confirmFulfillmentUpdate() {
    if (!pendingFulfillmentStatus) return;
    const status = pendingFulfillmentStatus;
    if (status === 'shipped' && !trackingSupported) {
      setMessage({
        text: 'Shipping details are not available until the order tracking database migration is applied.',
        ok: false,
      });
      return;
    }
    const shouldNotify = notifyCustomerOnFulfillment;
    const ok = await updateFulfillment(status);
    if (!ok) return;
    setPendingFulfillmentStatus(null);
    if (shouldNotify) {
      setEmailUpdateStatus(status);
      setEmailUpdateRecipient(order.customer_email ?? '');
      setEmailUpdateMessage(null);
      setShowEmailUpdate(true);
    }
  }

  async function sendFulfillmentUpdateEmail() {
    if (!emailUpdateStatus) return;
    setEmailUpdateMessage(null);
    const recipient = emailUpdateRecipient.trim();
    if (!recipient) {
      setEmailUpdateMessage({ text: 'Enter a recipient email address before sending.', ok: false });
      return;
    }

    setEmailUpdateSending(true);
    const response = await fetch(`/api/admin/orders/${order.id}/email-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, status: emailUpdateStatus }),
    });
    const result = await response.json().catch(() => null);
    setEmailUpdateSending(false);

    if (!response.ok) {
      setEmailUpdateMessage({ text: result?.error ?? 'Could not send update email.', ok: false });
      return;
    }

    recordSentEmail({
      email_type: 'fulfillment_update',
      recipient,
      subject: emailUpdateContent?.subject ?? null,
      status: emailUpdateStatus,
    });
    setEmailUpdateMessage({ text: `Update email sent to ${recipient}.`, ok: true });
  }

  async function cancelOrder() {
    const updates: Partial<Order> = {
      order_status: 'cancelled' as OrderStatus,
      fulfillment_status: 'cancelled',
    };
    const ok = await updateOrder(updates, 'cancelled');
    if (ok) {
      if (order.payment_status !== 'paid') {
        await updateProducts('available');
        setMessage({ text: 'Order cancelled and unpaid products returned to available.', ok: true });
      } else {
        setMessage({ text: 'Paid order cancelled. Products were left sold for review.', ok: true });
      }
    }
  }

  async function reopenOrder() {
    const ok = await updateOrder({
      order_status: 'open' as OrderStatus,
      fulfillment_status: 'pending',
    }, 'reopen');
    if (ok) {
      if (order.payment_status !== 'paid') {
        // Cancelling an unpaid order returned its products to 'available'; reopening
        // puts them back on hold so they leave the public gallery again.
        await updateProducts('pending_payment');
        setMessage({ text: 'Order reopened and unpaid products returned to pending payment.', ok: true });
      } else {
        setMessage({ text: 'Order reopened. Paid products were left sold for review.', ok: true });
      }
    }
  }

  async function deleteOrder(options: { returnToInventory?: boolean } = {}) {
    // Recycle Bin deletion is record-only unless the admin chooses return-to-inventory.
    if (!recycleBinSupported) {
      setMessage({ text: 'Run supabase/orders-recycle-bin.sql before using the orders Recycle Bin.', ok: false });
      return;
    }
    setSaving('delete');
    setMessage(null);

    if (options.returnToInventory && productIds.length > 0) {
      const restored = await updateProducts('available');
      if (!restored) {
        setSaving(null);
        return;
      }
    }

    const { error } = await supabase
      .from('orders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', order.id);
    if (error) {
      setMessage({ text: error.message, ok: false });
      setSaving(null);
      return;
    }
    startRouteProgress(`${adminBasePath}/orders`);
    router.push(`${adminBasePath}/orders`);
  }

  async function saveNotes() {
    const ok = await updateOrder({ internal_notes: internalNotes.trim() || null }, 'notes');
    if (ok) setMessage({ text: 'Internal notes saved.', ok: true });
  }

  async function saveLineDiscounts() {
    // Editing discounts recomputes the order total. On a paid order that would make
    // the stored total disagree with the amount actually captured at PayPal.
    if (order.payment_status === 'paid') {
      setMessage({
        text: 'This order is already paid — its total must match the captured payment. Issue a refund for any post-payment adjustment instead of editing line discounts.',
        ok: false,
      });
      return;
    }
    setSaving('line-discounts');
    setMessage(null);

    const updates = order.order_items.map((item) => {
      const discount = clampMoneyDiscount(Number(itemDiscounts[item.id]) || 0, orderItemLineSubtotal(item));
      return supabase.from('order_items').update({ discount }).eq('id', item.id);
    });
    const results = await Promise.all(updates);
    const itemError = results.find((result) => result.error)?.error;
    if (itemError) {
      setMessage({ text: itemError.message, ok: false });
      setSaving(null);
      return;
    }

    const ok = await updateOrder({
      discount: editedTotalDiscount,
      tax: editedTax,
      total: editedTotal,
    }, 'line-discounts');
    if (ok) {
      setOrder((current) => ({
        ...current,
        discount: editedTotalDiscount,
        tax: editedTax,
        total: editedTotal,
        order_items: current.order_items.map((item) => ({
          ...item,
          discount: clampMoneyDiscount(Number(itemDiscounts[item.id]) || 0, orderItemLineSubtotal(item)),
        })),
      }));
      setMessage({ text: 'Line discounts saved and order totals recalculated.', ok: true });
    }
  }


  // Prepend a just-sent email to the on-page history so it shows immediately.
  // (The server also persists it; a reload reflects the stored record.)
  function recordSentEmail(entry: { email_type: string; recipient: string; subject: string | null; status: string | null }) {
    setOrderEmails((prev) => [
      {
        id: `local-${Date.now()}`,
        email_type: entry.email_type,
        recipient: entry.recipient,
        subject: entry.subject,
        status: entry.status,
        sent_by_email: adminEmail,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  async function sendInvoiceEmail() {
    setEmailMessage(null);
    const recipient = emailRecipient.trim();
    if (!recipient) {
      setEmailMessage({ text: 'Enter a recipient email address before sending.', ok: false });
      return;
    }

    setEmailSending(true);
    const response = await fetch(`/api/admin/orders/${order.id}/email-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, itemDiscounts: numericItemDiscounts }),
    });
    const result = await response.json().catch(() => null);
    setEmailSending(false);

    if (!response.ok) {
      setEmailMessage({ text: result?.error ?? 'Could not send invoice email.', ok: false });
      return;
    }

    const documentLabel = orderIsPaid ? 'Receipt' : 'Invoice';
    recordSentEmail({ email_type: orderIsPaid ? 'receipt' : 'invoice', recipient, subject: emailContent.subject, status: null });
    setEmailMessage({ text: `${documentLabel} email sent to ${recipient}.`, ok: true });
  }

  async function generateInvoiceRecord(options: { silent?: boolean } = {}) {
    setSaving('invoice');
    if (!options.silent) setMessage(null);
    const response = await fetch(`/api/admin/orders/${order.id}/invoice`, { method: 'POST' });
    const result = await response.json().catch(() => null);
    setSaving(null);

    if (!response.ok || !result?.invoice) {
      if (!options.silent) {
        setMessage({ text: result?.error ?? 'Could not generate invoice.', ok: false });
      }
      return null;
    }

    setInvoices((current) => {
      const nextInvoice = result.invoice as Invoice;
      const existing = current.some((invoice) => invoice.id === nextInvoice.id || invoice.invoice_number === nextInvoice.invoice_number);
      return existing
        ? current.map((invoice) => (
            invoice.id === nextInvoice.id || invoice.invoice_number === nextInvoice.invoice_number
              ? { ...invoice, ...nextInvoice }
              : invoice
          ))
        : [nextInvoice, ...current];
    });
    if (!options.silent) {
      setMessage({ text: `Invoice ${result.invoice.invoice_number} generated.`, ok: true });
    }
    return result.invoice as Invoice;
  }

  function openOrderPrintPreview() {
    const previewWindow = window.open(
      `${adminBasePath}/orders/${order.id}/print`,
      `order-print-${order.id}`,
      'popup=yes,width=980,height=900,scrollbars=yes,resizable=yes',
    );
    if (!previewWindow) {
      setMessage({ text: 'Pop-ups are blocked. Allow pop-ups for this site to preview and print the order.', ok: false });
      return;
    }
    previewWindow.focus();
  }

  // The gift slip that goes in the box: item names + message, no prices.
  function openGiftSlip() {
    const slipWindow = window.open(
      `${adminBasePath}/orders/${order.id}/gift-slip`,
      `order-gift-slip-${order.id}`,
      'popup=yes,width=820,height=900,scrollbars=yes,resizable=yes',
    );
    if (!slipWindow) {
      setMessage({ text: 'Pop-ups are blocked. Allow pop-ups for this site to print the gift slip.', ok: false });
      return;
    }
    slipWindow.focus();
  }

  return (
    <main className="px-4 md:px-8 py-8">
      <div className="ultrawide-page max-w-[1300px] mx-auto">
        <div className="mb-6">
          <Link href={`${adminBasePath}/orders`} className="hover-underline-grow text-xs font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
            Back to Orders
          </Link>
        </div>

        {message && (
          <div className="mb-6 border px-4 py-3 text-sm"
            style={{
              borderColor: message.ok ? GOLD : 'var(--color-error)',
              color: message.ok ? GOLD : 'var(--color-error)',
              background: 'white',
            }}>
            {message.text}
          </div>
        )}

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
              Order Detail
            </p>
            <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              {order.order_number}
            </h1>
            <p className="text-sm mt-2" style={{ color: 'var(--color-on-surface-variant)' }}>
              Created {formatOrderDate(order.created_at)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowEmailInvoice(true)} className="outline-button text-sm">Email {invoiceDocLabel}</button>
              <button type="button" onClick={openOrderPrintPreview} className="outline-button text-sm">Print Order</button>
              <button
                type="button"
                onClick={restoreProductsToInventory}
                disabled={saving === 'restore-inventory' || productIds.length === 0}
                className="outline-button text-sm disabled:opacity-50"
              >
                {saving === 'restore-inventory' ? 'Restoring...' : 'Restore item to inventory'}
              </button>
              <button type="button" onClick={markPaid} disabled={saving === 'paid' || order.payment_status === 'paid'} className="gold-button text-sm disabled:opacity-50">Mark Paid</button>
              <button type="button" onClick={markUnpaid} disabled={saving === 'unpaid' || order.payment_status === 'unpaid'} className="outline-button text-sm disabled:opacity-50">Mark Unpaid</button>
              <button
                type="button"
                onClick={() => {
                  if (isPayPalOrder) {
                    setShowFullRefundConfirm(true);
                    setShowPartialRefund(false);
                    setMessage(null);
                  } else {
                    void markRefunded();
                  }
                }}
                disabled={saving === 'refunded' || order.payment_status === 'refunded' || remainingRefundAmount <= 0}
                className="outline-button text-sm disabled:opacity-50"
              >
                {isPayPalOrder ? 'Refund in PayPal' : 'Mark Refunded'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPartialRefund((value) => !value);
                  setShowFullRefundConfirm(false);
                  setPartialRefundAmount('');
                  setMessage(null);
                }}
                disabled={saving === 'partial-refund' || remainingRefundAmount <= 0}
                className="outline-button text-sm disabled:opacity-50"
              >
                {isPayPalOrder ? 'Partial PayPal Refund' : 'Mark Partially Refunded'}
              </button>
              {order.order_status === 'cancelled' && (
                <button
                  type="button"
                  onClick={() => { setShowCancelConfirm(false); setShowDeleteConfirm(false); reopenOrder(); }}
                  disabled={saving === 'reopen'}
                  className="outline-button text-sm disabled:opacity-50"
                  style={{ borderColor: GOLD, color: GOLD }}
                >
                  {saving === 'reopen' ? 'Reopening…' : 'Reopen Order'}
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowCancelConfirm(true); setShowDeleteConfirm(false); setMessage(null); }}
                disabled={saving === 'cancelled' || order.order_status === 'cancelled' || order.fulfillment_status === 'cancelled'}
                className="outline-button text-sm disabled:opacity-50"
              >
                Cancel Order
              </button>
              <button
                type="button"
                onClick={() => { setShowDeleteConfirm(true); setShowCancelConfirm(false); setMessage(null); }}
                disabled={saving === 'delete'}
                className="outline-button text-sm disabled:opacity-50"
                style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
              >
                Delete Order
              </button>
            </div>
            {showCancelConfirm && (
              <div className="flex flex-wrap items-center gap-3 border px-4 py-3" style={{ borderColor: 'var(--color-error)', background: 'white' }}>
                <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                  Cancel this order? This cannot be undone.
                </span>
                <button
                  type="button"
                  onClick={() => { setShowCancelConfirm(false); cancelOrder(); }}
                  disabled={saving === 'cancelled'}
                  className="outline-button text-sm disabled:opacity-50"
                  style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                >
                  {saving === 'cancelled' ? 'Cancelling…' : 'Yes, Cancel Order'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="outline-button text-sm"
                >
                  Keep Order
                </button>
              </div>
            )}
            {showDeleteConfirm && (
              <div className="flex flex-wrap items-center gap-3 border px-4 py-3" style={{ borderColor: 'var(--color-error)', background: 'white' }}>
                <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                  Move this order to the Recycle Bin? You can restore the order later.
                </span>
                <button
                  type="button"
                  onClick={() => { setShowDeleteConfirm(false); deleteOrder(); }}
                  disabled={saving === 'delete'}
                  className="outline-button text-sm disabled:opacity-50"
                  style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                >
                  {saving === 'delete' ? 'Deleting…' : 'Yes, Move to Recycle Bin'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDeleteConfirm(false); deleteOrder({ returnToInventory: true }); }}
                  disabled={saving === 'delete' || productIds.length === 0}
                  className="outline-button text-sm disabled:opacity-50"
                  style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                >
                  {saving === 'delete' ? 'Deleting…' : 'Move to Recycle Bin and return to inventory'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="outline-button text-sm"
                >
                  Keep Order
                </button>
              </div>
            )}
            {showFullRefundConfirm && (
              <div className="flex flex-wrap items-center gap-3 border px-4 py-3" style={{ borderColor: 'var(--color-error)', background: 'white' }}>
                <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                  Refund the remaining {formatCurrency(remainingRefundAmount)} through PayPal? This moves real money and does not restore inventory.
                </span>
                <button
                  type="button"
                  onClick={() => void markRefunded()}
                  disabled={saving === 'refunded'}
                  className="outline-button text-sm disabled:opacity-50"
                  style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                >
                  {saving === 'refunded' ? 'Refunding...' : 'Confirm PayPal Refund'}
                </button>
                <button type="button" onClick={() => setShowFullRefundConfirm(false)} className="outline-button text-sm">
                  Keep Payment
                </button>
              </div>
            )}
            {showPartialRefund && (
              <div className="flex flex-wrap items-center gap-3 border px-4 py-3" style={{ borderColor: BORDER, background: 'white' }}>
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Additional refund
                  <input
                    autoFocus
                    type="number"
                    className="form-field text-sm"
                    style={{ width: '7rem' }}
                    min="0.01"
                    max={remainingRefundAmount}
                    step="0.01"
                    value={partialRefundAmount}
                    onChange={(e) => setPartialRefundAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {formatCurrency(refundedAmount)} refunded; max additional {formatCurrency(remainingRefundAmount)}
                </span>
                <button
                  type="button"
                  onClick={markPartiallyRefunded}
                  disabled={saving === 'partial-refund'}
                  className="gold-button text-sm disabled:opacity-50"
                >
                  {saving === 'partial-refund' ? 'Refunding...' : (isPayPalOrder ? 'Refund in PayPal' : 'Confirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPartialRefund(false)}
                  className="outline-button text-sm"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_22rem] gap-6">
          <div className="flex flex-col gap-6">
            <section className="border p-5" style={{ borderColor: BORDER, background: 'white' }}>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                Customer
                {gift && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[0.65rem] tracking-[0.1em]"
                    style={{ background: '#f7efd7', border: '1px solid #dcc98f', color: GOLD }}
                  >
                    🎁 Gift
                  </span>
                )}
              </h2>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <Field label="Name" value={order.customer_name} />
                <Field label="Email" value={order.customer_email} />
                <Field label="Phone" value={order.customer_phone} />
              </div>
              {(() => {
                const shipping = formatOrderAddress(order.shipping_address);
                const billing = formatOrderAddress(order.billing_address);
                if (!shipping && !billing) return null;
                return (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                    {shipping && (
                      <div>
                        <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                          {gift?.recipientName ? 'Ship To (Gift Recipient)' : 'Shipping Address'}
                        </span>
                        {gift?.recipientName && (
                          <p className="font-bold" style={{ color: 'var(--color-on-surface)' }}>{gift.recipientName}</p>
                        )}
                        <p className="whitespace-pre-line" style={{ color: 'var(--color-on-surface)' }}>{shipping}</p>
                      </div>
                    )}
                    {billing && (
                      <div>
                        <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                          Billing Address
                        </span>
                        <p className="whitespace-pre-line" style={{ color: 'var(--color-on-surface)' }}>{billing}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
              {gift && (
                <div className="mt-4 text-sm">
                  <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                    Gift Message
                  </span>
                  <p className="whitespace-pre-line" style={{ color: 'var(--color-on-surface)' }}>
                    {gift.message ? `“${gift.message}”` : '(none — the slip will say who it is from)'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={openGiftSlip} className="gold-button text-sm">Print Gift Slip</button>
                  </div>
                  <p className="mt-2 rounded px-3 py-2 text-[0.8rem]" style={{ background: '#fff6e0', border: '1px solid #f0d58a', color: '#4d4635' }}>
                    Gift order — put the <b>gift slip</b> in the box, not the priced receipt.
                  </p>
                </div>
              )}
              {(() => {
                const heardAbout = heardAboutAdminLabel(order.heard_about, order.heard_about_other);
                if (!heardAbout) return null;
                return (
                  <div className="mt-4 text-sm">
                    <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                      Heard About Us
                    </span>
                    <p className="font-bold" style={{ color: GOLD }}>{heardAbout}</p>
                  </div>
                );
              })()}
              {order.customer_notes && (
                <div className="mt-4">
                  <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                    Customer Notes
                  </span>
                  <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {order.customer_notes}
                  </p>
                </div>
              )}
            </section>

            <section className="border" style={{ borderColor: BORDER, background: 'white' }}>
              <div className="border-b px-5 py-4" style={{ borderColor: BORDER }}>
                <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>Items</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead style={{ background: 'var(--color-surface-container-low)' }}>
                    <tr>
                      {['Inventory', 'Photo', 'Item', 'Melt', 'Unit Price', 'Qty', 'Discount'].map((heading) => (
                        // The Item column absorbs all slack width so the narrow
                        // data columns hug their content.
                        <th key={heading} className={`px-3 py-3 text-left text-[0.68rem] uppercase tracking-widest${heading === 'Item' ? ' w-full' : ''}`} style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.order_items.map((item) => {
                      const itemImage = normalizeLegacyLocalImageUrl(item.image_snapshot);
                      const meltValue = item.product_id ? itemMeltValues[item.product_id] : undefined;
                      return (
                      <tr key={item.id} className="border-t" style={{ borderColor: BORDER }}>
                        <td className="px-3 py-3" style={{ color: 'var(--color-on-surface-variant)' }}>{item.inventory_number || '-'}</td>
                        {/* p-0 + absolute fill: the thumbnail spans the full row
                            height without ever contributing to it. */}
                        <td className="relative w-16 min-w-16 p-0">
                          <div
                            className="absolute inset-0 flex items-center justify-center overflow-hidden"
                            style={{ background: 'var(--color-surface-container-low)' }}
                          >
                            {itemImage ? (
                              <Image
                                src={itemImage}
                                alt={item.title_snapshot}
                                fill
                                sizes="96px"
                                className="object-cover"
                                unoptimized={itemImage.startsWith('/assets/')}
                              />
                            ) : (
                              <AppIcon name="photo_camera" aria-hidden="true" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          {item.product_id ? (
                            <Link
                              href={`${shopBasePath}/${item.product_id}?returnTo=${encodeURIComponent(orderReturnPath)}`}
                              className="hover-underline-grow"
                              style={{ color: GOLD }}
                            >
                              {item.title_snapshot}
                            </Link>
                          ) : (
                            <span style={{ color: 'var(--color-on-surface)' }}>{item.title_snapshot}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>
                          {meltValue != null ? formatUsdPrice(meltValue) : '-'}
                        </td>
                        <td className="px-3 py-3 font-semibold" style={{ color: GOLD }}>{formatCurrency(item.price_snapshot)}</td>
                        <td className="px-3 py-3" style={{ color: 'var(--color-on-surface-variant)' }}>{orderItemQty(item)}</td>
                        <td className="px-3 py-3">
                          <label className="grid w-20 gap-1">
                            <span className="sr-only">Line discount for {item.title_snapshot}</span>
                            <input
                              className="form-field text-sm"
                              type="number"
                              min="0"
                              max={orderItemLineSubtotal(item)}
                              step="0.01"
                              value={itemDiscounts[item.id] ?? '0'}
                              onChange={(event) => setItemDiscounts((current) => ({ ...current, [item.id]: event.target.value }))}
                            />
                          </label>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                  {/* Footer lives inside the table so New total shares the
                      Unit Price column's exact left edge. The first cell spans
                      through the flexible Item column so the wide button never
                      stretches the narrow data columns. */}
                  <tfoot>
                    <tr className="border-t" style={{ borderColor: BORDER }}>
                      <td colSpan={4} className="px-3 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <button type="button" onClick={saveLineDiscounts} disabled={saving === 'line-discounts'} className="outline-button justify-center text-sm whitespace-nowrap disabled:opacity-50">
                            Save Line Discounts
                          </button>
                          <span className="whitespace-nowrap text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                            Line discounts: <strong style={{ color: GOLD }}>-{formatCurrency(editedLineDiscount)}</strong>
                          </span>
                        </div>
                      </td>
                      <td colSpan={3} className="whitespace-nowrap px-3 py-4 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                        New total: <strong style={{ color: GOLD }}>{formatCurrency(editedTotal)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section className="border p-5" style={{ borderColor: BORDER, background: 'white' }}>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>Fulfillment</h2>
              <div className="flex flex-wrap gap-2">
                {FULFILLMENT_MARK_STATUSES.includes(order.fulfillment_status) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => updateFulfillment('pending')}
                      disabled={saving === 'pending'}
                      className="outline-button text-sm disabled:opacity-50"
                    >
                      Unmark {orderStatusLabel(order.fulfillment_status)}
                    </button>
                    {order.fulfillment_status === 'shipped' && trackingSupported && (
                      <button
                        type="button"
                        onClick={() => openFulfillmentUpdate('shipped')}
                        disabled={saving === 'shipped'}
                        className="outline-button text-sm disabled:opacity-50"
                      >
                        {order.shipping_carrier || order.tracking_number ? 'Edit Shipping Details' : 'Add Shipping Details'}
                      </button>
                    )}
                  </>
                ) : (
                  FULFILLMENT_MARK_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => openFulfillmentUpdate(status)}
                      disabled={saving === status}
                      className="outline-button text-sm disabled:opacity-50"
                    >
                      Mark {orderStatusLabel(status)}
                    </button>
                  ))
                )}
              </div>
              {(order.shipping_carrier || order.tracking_number) && (
                <dl className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2" style={{ borderColor: BORDER }}>
                  {order.shipping_carrier && (
                    <div>
                      <dt className="form-label">Carrier</dt>
                      <dd className="mt-1 font-semibold" style={{ color: 'var(--color-on-surface)' }}>{order.shipping_carrier}</dd>
                    </div>
                  )}
                  {order.tracking_number && (
                    <div>
                      <dt className="form-label">Tracking Number</dt>
                      <dd className="mt-1 break-all font-semibold" style={{ color: 'var(--color-on-surface)' }}>{order.tracking_number}</dd>
                    </div>
                  )}
                </dl>
              )}
              {pendingFulfillmentStatus && (
                <div className="mt-3 grid gap-4 border px-4 py-4" style={{ borderColor: BORDER, background: 'var(--color-surface-container-low)' }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                      Mark this order as {orderStatusLabel(pendingFulfillmentStatus)}?
                    </span>
                    <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                      <input
                        type="checkbox"
                        checked={notifyCustomerOnFulfillment}
                        onChange={(event) => setNotifyCustomerOnFulfillment(event.target.checked)}
                      />
                      Update customer via email
                    </label>
                  </div>
                  {pendingFulfillmentStatus === 'shipped' && trackingSupported && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="form-label">Carrier</span>
                        <input
                          className="form-field"
                          type="text"
                          list="shipping-carrier-options"
                          maxLength={100}
                          value={shippingCarrier}
                          onChange={(event) => setShippingCarrier(event.target.value)}
                          placeholder="UPS, USPS, FedEx..."
                        />
                        <datalist id="shipping-carrier-options">
                          <option value="USPS" />
                          <option value="UPS" />
                          <option value="FedEx" />
                          <option value="DHL" />
                        </datalist>
                      </label>
                      <label className="grid gap-1">
                        <span className="form-label">Tracking Number</span>
                        <input
                          className="form-field"
                          type="text"
                          maxLength={200}
                          value={trackingNumber}
                          onChange={(event) => setTrackingNumber(event.target.value)}
                          placeholder="Enter tracking number"
                        />
                      </label>
                    </div>
                  )}
                  {pendingFulfillmentStatus === 'shipped' && !trackingSupported && (
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-error)' }}>
                      Apply supabase/order-shipping-tracking-2026-07.sql before saving shipment details.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={confirmFulfillmentUpdate}
                      disabled={saving === pendingFulfillmentStatus || (pendingFulfillmentStatus === 'shipped' && !trackingSupported)}
                      className="gold-button text-sm disabled:opacity-50"
                    >
                      {saving === pendingFulfillmentStatus ? 'Saving…' : 'Save Fulfillment'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingFulfillmentStatus(null)}
                      className="outline-button text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="border p-5" style={{ borderColor: BORDER, background: 'white' }}>
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>Invoices</h2>
                <button
                  type="button"
                  onClick={() => generateInvoiceRecord()}
                  disabled={saving === 'invoice'}
                  className="outline-button text-xs disabled:opacity-50"
                >
                  {saving === 'invoice' ? 'Generating...' : invoices.length > 0 ? 'Refresh Invoice' : 'Generate Invoice'}
                </button>
              </div>
              {invoices.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between border px-3 py-2 text-sm" style={{ borderColor: BORDER }}>
                      <Link
                        href={`${adminBasePath}/orders/${order.id}/invoice`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline underline-offset-2"
                        style={{ color: 'var(--color-on-surface)' }}
                      >
                        {invoice.invoice_number}
                      </Link>
                      <span style={{ color: 'var(--color-on-surface-variant)' }}>{orderStatusLabel(invoice.status)} — {formatCurrency(invoice.total)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>No invoice generated yet.</p>
              )}
            </section>

            <section className="border p-5" style={{ borderColor: BORDER, background: 'white' }}>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>Internal Notes</h2>
              <textarea className="form-field w-full resize-y" rows={4} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
              <button type="button" onClick={saveNotes} disabled={saving === 'notes'} className="gold-button text-sm mt-3 disabled:opacity-50">
                Save Notes
              </button>
            </section>
          </div>

          <div className="flex flex-col gap-6 h-fit">
          <aside className="border p-5" style={{ borderColor: BORDER, background: 'white' }}>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>Summary</h2>
            <StatusRow label="Payment" value={order.payment_status} />
            <StatusRow label="Fulfillment" value={order.fulfillment_status} />
            <StatusRow label="Order" value={order.order_status} />
            <div className="border-t mt-4 pt-4" style={{ borderColor: BORDER }}>
              <MoneyRow label="Subtotal" value={order.subtotal} />
              {order.discount > 0 && <MoneyRow label="Discount" value={-order.discount} />}
              <MoneyRow label={taxExemption ? 'Tax · exempt' : 'Tax'} value={order.tax} />
              <MoneyRow label="Shipping" value={order.shipping_fee} />
              <div className="border-t mt-3 pt-3" style={{ borderColor: BORDER }}>
                <MoneyRow label="Total" value={order.total} strong />
              </div>
              {order.refund_amount != null && order.refund_amount > 0 && (
                <div className="border-t mt-3 pt-3" style={{ borderColor: BORDER }}>
                  <MoneyRow label="Refunded" value={-order.refund_amount} />
                </div>
              )}
            </div>
            <div className="border-t mt-4 pt-4 text-sm" style={{ borderColor: BORDER, color: 'var(--color-on-surface-variant)' }}>
              <div>Payment method: {paymentMethodLabel(order.payment_method)}</div>
              <div>Reference: {order.payment_reference || '-'}</div>
              {(() => {
                // Which SERVICE was bought (Priority vs Express vs Registered) —
                // the DB only stores 'shipping'; the fee is the fingerprint.
                const service = describeShippingService(order);
                return (
                  <div className="mt-2 rounded-md border px-3 py-2" style={{ borderColor: service.kind === 'express' ? 'var(--color-error)' : BORDER, background: service.kind === 'express' ? 'color-mix(in srgb, var(--color-error) 8%, white)' : 'var(--color-surface-container-low)' }}>
                    <div className="font-bold" style={{ color: service.kind === 'express' ? 'var(--color-error)' : 'var(--color-on-surface)' }}>
                      Shipping: {service.label}
                    </div>
                    {service.detail && <div className="mt-0.5 text-xs leading-snug">{service.detail}</div>}
                  </div>
                );
              })()}
            </div>
          </aside>

          {taxExemption && <OrderTaxExemptionPanel snapshot={taxExemption} adminBasePath={adminBasePath} />}

          <section className="border p-5" style={{ borderColor: BORDER, background: 'white' }}>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>Email History</h2>
            {orderEmails.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {orderEmails.map((email) => (
                  <li key={email.id} className="border-b pb-3 last:border-b-0 last:pb-0" style={{ borderColor: BORDER }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.7rem] font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                        {emailTypeLabel(email)}
                      </span>
                      <span className="text-[0.7rem] whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>
                        {formatOrderDate(email.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm break-words" style={{ color: 'var(--color-on-surface)' }}>
                      To {email.recipient}
                    </p>
                    {email.subject && (
                      <p className="mt-0.5 text-xs break-words" style={{ color: 'var(--color-on-surface-variant)' }}>
                        {email.subject}
                      </p>
                    )}
                    <p className="mt-0.5 text-[0.68rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                      From {ORDER_EMAIL_FROM_ADDRESS} &middot; {emailInitiatorLabel(email.sent_by_email)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>No emails sent from this page yet.</p>
            )}
          </section>
          </div>
        </div>
      </div>

      {showEmailInvoice && (
        <div className="fixed inset-0 z-50 overflow-y-auto px-4 py-6" style={{ background: 'rgba(0, 0, 0, 0.42)' }}>
          <div className="relative mx-auto w-full max-w-3xl border bg-white shadow-2xl" style={{ borderColor: BORDER }}>
            <button
              type="button"
              onClick={() => setShowEmailInvoice(false)}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border bg-white"
              style={{ borderColor: 'rgba(115, 92, 0, 0.18)', color: GOLD }}
              aria-label="Close email invoice preview"
            >
              <AppIcon name="close" className="text-[1.2rem]" aria-hidden="true" />
            </button>

            <div className="border-b px-5 py-5 pr-16 md:px-7" style={{ borderColor: BORDER }}>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em]" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                Email {invoiceDocLabel}
              </p>
              <h2 className="mt-2 text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
                Preview and Recipient
              </h2>
            </div>

            <div className="grid gap-5 p-5 md:p-7">
              <label className="grid gap-1">
                <span className="form-label">Customer Email</span>
                <input
                  className="form-field"
                  type="email"
                  value={emailRecipient}
                  onChange={(event) => setEmailRecipient(event.target.value)}
                  placeholder="customer@example.com"
                />
              </label>

              <div className="grid gap-1">
                <span className="form-label">Subject</span>
                <div className="border bg-white px-3 py-3 text-sm" style={{ borderColor: BORDER, color: 'var(--color-on-surface)' }}>
                  {emailContent.subject}
                </div>
              </div>

              <section className="border bg-white" style={{ borderColor: BORDER }}>
                <div className="border-b px-4 py-3" style={{ borderColor: BORDER }}>
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                    Email Preview
                  </h3>
                </div>
                <div className="px-4 py-4 text-sm leading-relaxed" style={{ color: 'var(--color-on-surface)' }}>
                  <p>{emailContent.greeting}</p>
                  <p className="mt-3">{emailContent.intro}</p>
                  <div className="mt-5 overflow-hidden border" style={{ borderColor: BORDER }}>
                    {emailContent.items.length > 0 ? emailContent.items.map((item) => {
                      const imageUrl = normalizeLegacyLocalImageUrl(item.imageUrl);
                      return (
                      <div key={`${item.inventory}-${item.title}`} className="grid gap-3 border-b px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" style={{ borderColor: 'rgba(115, 92, 0, 0.12)' }}>
                        <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
                          <div className="relative h-[4.5rem] overflow-hidden border" style={{ borderColor: 'rgba(115, 92, 0, 0.18)', background: '#f7f3e8' }}>
                            {imageUrl ? (
                              <Image
                                src={imageUrl}
                                alt={item.title}
                                fill
                                sizes="72px"
                                className="object-contain"
                                unoptimized={imageUrl.startsWith('/assets/')}
                              />
                            ) : (
                              <AppIcon name="photo_camera" className="flex h-full w-full items-center justify-center text-[1.4rem]" aria-hidden="true" style={{ color: 'rgba(115, 92, 0, 0.34)' }} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <strong className="block" style={{ color: 'var(--color-on-surface)' }}>{item.title}</strong>
                            <span className="mt-1 block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                              {item.inventory} - {item.details}
                            </span>
                          </div>
                        </div>
                        <div className="text-right font-bold" style={{ color: GOLD }}>
                          {item.discount && (
                            <>
                              <span className="block text-xs font-normal line-through" style={{ color: 'var(--color-on-surface-variant)' }}>
                                {item.originalPrice}
                              </span>
                              <span className="block text-xs">
                                Discount {item.discount}
                              </span>
                            </>
                          )}
                          <span>{item.price}</span>
                        </div>
                      </div>
                    ); }) : (
                      <p className="px-3 py-3" style={{ color: 'var(--color-on-surface-variant)' }}>No item details were attached.</p>
                    )}
                  </div>
                  <div className="mt-5 border px-4 py-3" style={{ borderColor: BORDER, background: 'var(--color-surface-container-low)' }}>
                    <EmailTotalRow label="Subtotal" value={emailContent.totals.subtotal} />
                    {emailContent.totals.discount && <EmailTotalRow label="Discount" value={emailContent.totals.discount} />}
                    <EmailTotalRow label="Tax" value={emailContent.totals.tax} />
                    <EmailTotalRow label="Shipping" value={emailContent.totals.shipping} />
                    <div className="mt-2 border-t pt-2" style={{ borderColor: BORDER }}>
                      <EmailTotalRow label="Total" value={emailContent.totals.total} strong />
                    </div>
                  </div>
                  {emailContent.note && <p className="mt-5">{emailContent.note}</p>}
                  {/* Mirrors the pickup panel in the sent email. Without it this
                      preview silently omits the address the buyer is given. */}
                  {emailContent.pickup && (
                    <div className="mt-5 border px-4 py-3" style={{ borderColor: BORDER, background: 'var(--color-surface-container-low)' }}>
                      <strong className="block text-[11px] font-bold uppercase tracking-wider">{emailContent.pickup.label}</strong>
                      {emailContent.pickup.addressLines.map((addressLine) => (
                        <span key={addressLine} className="block">{addressLine}</span>
                      ))}
                      <span className="block opacity-70">{emailContent.pickup.landmark}</span>
                      <div className="mt-3 border-t pt-3" style={{ borderColor: BORDER }}>
                        <strong className="block text-[11px] font-bold uppercase tracking-wider">{emailContent.pickup.hoursLabel}</strong>
                        <span className="block">{emailContent.pickup.hours}</span>
                        <span className="block opacity-70">{emailContent.pickup.byAppointment}</span>
                      </div>
                    </div>
                  )}
                  <p className="mt-5">{emailContent.contactNote}</p>
                  <p className="mt-3">{emailContent.closing}</p>
                </div>
              </section>

              {emailMessage && (
                <p className="text-sm font-bold" style={{ color: emailMessage.ok ? GOLD : 'var(--color-error)' }}>
                  {emailMessage.text}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 border-t pt-4 md:flex-row md:justify-end" style={{ borderColor: BORDER }}>
                <button type="button" onClick={() => setShowEmailInvoice(false)} className="outline-button justify-center text-sm">
                  Close
                </button>
                <button type="button" onClick={sendInvoiceEmail} disabled={emailSending} className="gold-button justify-center text-sm disabled:opacity-50">
                  {emailSending ? 'Sending...' : `Send ${invoiceDocLabel} Email`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEmailUpdate && emailUpdateContent && (
        <div className="fixed inset-0 z-50 overflow-y-auto px-4 py-6" style={{ background: 'rgba(0, 0, 0, 0.42)' }}>
          <div className="relative mx-auto w-full max-w-lg border bg-white shadow-2xl" style={{ borderColor: BORDER }}>
            <button
              type="button"
              onClick={() => setShowEmailUpdate(false)}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border bg-white"
              style={{ borderColor: 'rgba(115, 92, 0, 0.18)', color: GOLD }}
              aria-label="Close email update preview"
            >
              <AppIcon name="close" className="text-[1.2rem]" aria-hidden="true" />
            </button>

            <div className="border-b px-5 py-5 pr-16 md:px-7" style={{ borderColor: BORDER }}>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em]" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                Email Update
              </p>
              <h2 className="mt-2 text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
                Notify Customer{emailUpdateStatus ? `: ${orderStatusLabel(emailUpdateStatus)}` : ''}
              </h2>
            </div>

            <div className="grid gap-5 p-5 md:p-7">
              <label className="grid gap-1">
                <span className="form-label">Customer Email</span>
                <input
                  className="form-field"
                  type="email"
                  value={emailUpdateRecipient}
                  onChange={(event) => setEmailUpdateRecipient(event.target.value)}
                  placeholder="customer@example.com"
                />
              </label>

              <div className="grid gap-1">
                <span className="form-label">Subject</span>
                <div className="border bg-white px-3 py-3 text-sm" style={{ borderColor: BORDER, color: 'var(--color-on-surface)' }}>
                  {emailUpdateContent.subject}
                </div>
              </div>

              <section className="border bg-white" style={{ borderColor: BORDER }}>
                <div className="border-b px-4 py-3" style={{ borderColor: BORDER }}>
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                    Email Preview
                  </h3>
                </div>
                <div className="whitespace-pre-line px-4 py-4 text-sm leading-relaxed" style={{ color: 'var(--color-on-surface)' }}>
                  {emailUpdateContent.text}
                </div>
              </section>

              {emailUpdateMessage && (
                <p className="text-sm font-bold" style={{ color: emailUpdateMessage.ok ? GOLD : 'var(--color-error)' }}>
                  {emailUpdateMessage.text}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 border-t pt-4 md:flex-row md:justify-end" style={{ borderColor: BORDER }}>
                <button type="button" onClick={() => setShowEmailUpdate(false)} className="outline-button justify-center text-sm">
                  Close
                </button>
                <button type="button" onClick={sendFulfillmentUpdateEmail} disabled={emailUpdateSending} className="gold-button justify-center text-sm disabled:opacity-50">
                  {emailUpdateSending ? 'Sending...' : 'Send Update Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function EmailTotalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1" style={{ color: strong ? GOLD : 'var(--color-on-surface-variant)' }}>
      <span className={strong ? 'font-bold' : ''}>{label}</span>
      <span className={strong ? 'font-bold' : ''}>{value}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>{label}</p>
      <p className="mt-1 font-medium" style={{ color: 'var(--color-on-surface)' }}>{value || '-'}</p>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      <span className="font-bold" style={{ color: GOLD }}>{orderStatusLabel(value)}</span>
    </div>
  );
}

function MoneyRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm" style={{ color: strong ? GOLD : 'var(--color-on-surface-variant)' }}>
      <span className={strong ? 'font-bold' : ''}>{label}</span>
      <span className={strong ? 'font-bold' : ''}>{formatCurrency(value)}</span>
    </div>
  );
}

function clampMoneyDiscount(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

function orderItemQty(item: { quantity?: number | null }): number {
  const qty = Math.floor(Number(item.quantity ?? 1));
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

// Line subtotal (unit price × quantity) — the ceiling for a line-level discount.
function orderItemLineSubtotal(item: { price_snapshot: number; quantity?: number | null }): number {
  return item.price_snapshot * orderItemQty(item);
}

function emailTypeLabel(email: { email_type: string; status: string | null }): string {
  if (email.email_type === 'invoice') return 'Invoice';
  if (email.email_type === 'receipt') return 'Receipt';
  if (email.email_type === 'fulfillment_update') {
    return email.status ? `Update — ${orderStatusLabel(email.status)}` : 'Fulfillment Update';
  }
  return email.email_type;
}
