'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startRouteProgress } from '@/components/layout/RouteProgressBar';
import { createClient } from '@/lib/supabase/client';
import type { Product } from '@/types/product';
import { isProductPurchasable, normalizeProductQuantity, productStatusLabel } from '@/types/product';
import type { Order, PaymentStatus, FulfillmentStatus, OrderStatus, ShippingMethod } from '@/types/sales';
import { formatCurrency, formatOrderDate, orderStatusLabel } from '@/types/sales';
import type { SpotData } from '@/types/product';
import { buildAddressObject, generateOrderNumber, getProductImages, getProductMetal, getProductWeight, getSnapshotPrice } from '@/lib/sales';
import { calculateFlSalesTax, isFloridaState } from '@/lib/checkout-pricing';
import { adminGetManualOrderProducts, adminUpdateProductsStatus } from '@/app/actions/admin-products';
import { AppIcon } from '@/components/AppIcon';
import { removeOrderPickupFiles } from '@/components/admin/pickup/pickup-client';
import { EMPTY_SELECTION, bulkDeleteConfirmText, bulkDeleteLabel, selectionState, toggleAll, toggleId } from '@/lib/trash-selection';
import {
  MARKETPLACE_LABEL,
  marketplaceOrderUrl,
  marketplaceRecordMatches,
  marketplaceSalesLabel,
  mergeOrdersAndMarketplace,
  type MarketplaceHideAction,
  type MarketplaceSaleRecord,
} from '@/lib/marketplace-sale-records';

const GOLD = '#735c00';
const BORDER = 'var(--color-outline-variant)';

function isMissingItemYearColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('item_year'))
    || Boolean(error?.message?.toLowerCase().includes('quantity'));
}

interface Props {
  initialOrders: Order[];
  products: Product[];
  spotData: SpotData | null;
  locale: string;
  view?: OrdersView;
  trashCount?: number;
  recycleBinSupported?: boolean;
  /** eBay / Etsy sales, mixed into the list (2026-11-16) — records only, no buyer data. In the trash view: the deleted ones. */
  marketplaceRecords?: MarketplaceSaleRecord[];
  /** Delete / Restore / Delete Forever on eBay / Etsy rows (2026-11-18) — false until supabase/marketplace-sale-hide-2026-11.sql runs. */
  marketplaceHideSupported?: boolean;
}

type OrdersView = 'active' | 'trash';

type FormState = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  payment_method: string;
  shipping_method: ShippingMethod;
  shipping_fee: string;
  discount: string;
  customer_notes: string;
  internal_notes: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};

const emptyForm: FormState = {
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  payment_method: 'manual',
  shipping_method: 'pickup',
  shipping_fee: '0',
  discount: '0',
  customer_notes: '',
  internal_notes: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: 'FL',
  postal_code: '',
  country: 'United States',
};

export default function OrdersPanel({
  initialOrders,
  products: initialProducts,
  spotData: initialSpotData,
  locale,
  view = 'active',
  trashCount = 0,
  recycleBinSupported = true,
  marketplaceRecords = [],
  marketplaceHideSupported = false,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const adminBasePath = locale === 'es' ? '/es/admin' : '/admin';
  const ordersPath = `${adminBasePath}/orders`;
  const isTrash = view === 'trash';
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [spotData, setSpotData] = useState<SpotData | null>(initialSpotData);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [syncedFrom, setSyncedFrom] = useState(initialOrders);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('');
  const [orderFilter, setOrderFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedProductDiscounts, setSelectedProductDiscounts] = useState<Record<string, string>>({});
  const [selectedProductQuantities, setSelectedProductQuantities] = useState<Record<string, number>>({});
  const [productSearch, setProductSearch] = useState('');
  const [showAllProductMatches, setShowAllProductMatches] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Order | null>(null);
  const [returnToInventory, setReturnToInventory] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [actingOrderId, setActingOrderId] = useState<string | null>(null);
  // Recycle Bin multi-select (owner, 2026-09-16): ids ticked in the trash
  // view. Read through selectionState() so only rows still on screen count.
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(() => new Set());
  const [purgingSelected, setPurgingSelected] = useState(false);
  // eBay / Etsy sales the owner deletes from the site (2026-11-18). Keys are
  // `record.key` ("ebay:<order id>"); hidden at once here, gone for real on
  // the server (lib/marketplace-sale-records-server.ts).
  const [removedMarketplaceKeys, setRemovedMarketplaceKeys] = useState<Set<string>>(() => new Set());
  const [syncedMarketplace, setSyncedMarketplace] = useState(marketplaceRecords);
  const [selectedMarketplaceKeys, setSelectedMarketplaceKeys] = useState<Set<string>>(() => new Set());
  const [confirmMarketplace, setConfirmMarketplace] = useState<MarketplaceSaleRecord[] | null>(null);
  const [marketplaceBusy, setMarketplaceBusy] = useState(false);
  const [actingMarketplaceKey, setActingMarketplaceKey] = useState<string | null>(null);

  if (initialOrders !== syncedFrom) {
    setSyncedFrom(initialOrders);
    setOrders(initialOrders);
    setConfirmDelete(null);
    setActingOrderId(null);
  }
  if (marketplaceRecords !== syncedMarketplace) {
    setSyncedMarketplace(marketplaceRecords);
    setRemovedMarketplaceKeys(new Set());
    setConfirmMarketplace(null);
    setActingMarketplaceKey(null);
  }

  const availableProducts = useMemo(
    () => products.filter((product) => isProductPurchasable(product.status, product.quantity)),
    [products],
  );

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIds.includes(product.id)),
    [products, selectedProductIds],
  );

  const productMatches = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    const unselectedProducts = availableProducts.filter((product) => !selectedProductIds.includes(product.id));
    if (!term) return showAllProductMatches ? unselectedProducts : [];
    return unselectedProducts
      .filter((product) => {
        const searchable = [
          product.inventory_number != null ? String(product.inventory_number) : '',
          product.sku,
          product.id,
          product.title,
          product.title_es,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(term);
      })
      .slice(0, 8);
  }, [availableProducts, productSearch, selectedProductIds, showAllProductMatches]);

  const selectedProductPrices = useMemo(
    () => Object.fromEntries(selectedProducts.map((product) => [product.id, getSnapshotPrice(product, spotData)])),
    [selectedProducts, spotData],
  );
  const productStockCap = (product: Product) => Math.max(1, normalizeProductQuantity(product.quantity));
  const qtyFor = (product: Product) =>
    Math.min(productStockCap(product), Math.max(1, Math.floor(selectedProductQuantities[product.id] ?? 1)));
  const lineSubtotalFor = (product: Product) => selectedProductPrices[product.id] * qtyFor(product);
  const subtotal = selectedProducts.reduce((sum, product) => sum + lineSubtotalFor(product), 0);
  const lineDiscount = selectedProducts.reduce(
    (sum, product) => sum + clampMoneyDiscount(Number(selectedProductDiscounts[product.id]) || 0, lineSubtotalFor(product)),
    0,
  );
  const discount = (Number(form.discount) || 0) + lineDiscount;
  const shippingFee = Math.max(Number(form.shipping_fee) || 0, 0);
  // Pickup and local delivery are completed in Florida. Shipped orders owe
  // Florida tax only when their destination is also in Florida.
  const chargesTax = form.shipping_method !== 'shipping' || isFloridaState(form.state);
  const tax = chargesTax
    ? calculateFlSalesTax(Math.max(subtotal - discount, 0), shippingFee)
    : 0;
  const total = Math.max(subtotal - discount, 0) + tax + shippingFee;

  const filteredOrders = orders.filter((order) => {
    if (paymentFilter && order.payment_status !== paymentFilter) return false;
    if (fulfillmentFilter && order.fulfillment_status !== fulfillmentFilter) return false;
    if (orderFilter && order.order_status !== orderFilter) return false;
    if (search) {
      const haystack = [
        order.order_number,
        order.customer_name,
        order.customer_email,
        order.customer_phone,
        ...(order.order_items ?? []).map((item) => item.title_snapshot),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  // eBay / Etsy sales (owner, 2026-11-16, option B): mixed in by date. They
  // have no site payment/fulfillment/order status, so any of those filters
  // hides them; the search box matches their order id, item and marketplace.
  // In the Recycle Bin the page passes the deleted ones (2026-11-18).
  const statusFilterOn = Boolean(paymentFilter || fulfillmentFilter || orderFilter);
  const visibleMarketplace = marketplaceRecords.filter((record) => !removedMarketplaceKeys.has(record.key));
  const filteredMarketplace = statusFilterOn
    ? []
    : visibleMarketplace.filter((record) => marketplaceRecordMatches(record, search));
  const listEntries = mergeOrdersAndMarketplace(filteredOrders, filteredMarketplace);
  // The list's checkbox column: always in the Recycle Bin; in the list only
  // for eBay / Etsy rows, and only once the hide SQL has run.
  const showMarketplaceSelect = !isTrash && marketplaceHideSupported && visibleMarketplace.length > 0;
  const selectColumn = isTrash || showMarketplaceSelect;
  const filteredMarketplaceKeys = filteredMarketplace.map((record) => record.key);
  const marketplaceSelection = showMarketplaceSelect
    ? selectionState(filteredMarketplaceKeys, selectedMarketplaceKeys)
    : EMPTY_SELECTION;

  async function openCreateOrder() {
    setShowCreate(true);
    if (products.length > 0 || loadingProducts) return;

    setLoadingProducts(true);
    setMessage(null);
    const result = await adminGetManualOrderProducts();
    setLoadingProducts(false);
    if (result.error || !result.products) {
      setMessage({ text: result.error ?? 'Could not load products.', ok: false });
      return;
    }
    setProducts(result.products);
    setSpotData(result.spotData ?? null);
  }

  function addProduct(id: string) {
    setSelectedProductIds((current) => current.includes(id) ? current : [...current, id]);
    setProductSearch('');
    setShowAllProductMatches(false);
  }

  function removeProduct(id: string) {
    setSelectedProductIds((current) => current.filter((item) => item !== id));
    setSelectedProductDiscounts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSelectedProductQuantities((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function createOrder() {
    if (selectedProducts.length === 0) {
      setMessage({ text: 'Select at least one available product.', ok: false });
      return;
    }
    if (!form.customer_name.trim() || !form.customer_email.trim()) {
      setMessage({ text: 'Customer name and email are required.', ok: false });
      return;
    }

    setSaving(true);
    setMessage(null);

    const orderPayload = {
      order_number: generateOrderNumber(),
      customer_name: form.customer_name.trim(),
      customer_email: form.customer_email.trim(),
      customer_phone: form.customer_phone.trim() || null,
      subtotal,
      tax,
      shipping_fee: shippingFee,
      discount,
      total,
      payment_status: 'unpaid' as PaymentStatus,
      fulfillment_status: 'pending' as FulfillmentStatus,
      order_status: 'open' as OrderStatus,
      payment_method: form.payment_method.trim() || 'manual',
      shipping_method: form.shipping_method,
      shipping_address: buildAddressObject({
        line1: form.address_line1,
        line2: form.address_line2,
        city: form.city,
        state: form.state,
        postalCode: form.postal_code,
        country: form.country,
      }),
      billing_address: null,
      internal_notes: form.internal_notes.trim() || null,
      customer_notes: form.customer_notes.trim() || null,
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select()
      .single();

    if (orderError || !order) {
      setMessage({ text: orderError?.message ?? 'Could not create order.', ok: false });
      setSaving(false);
      return;
    }

    const itemPayloads = selectedProducts.map((product) => ({
      order_id: order.id,
      product_id: product.id,
      inventory_number: product.inventory_number != null ? String(product.inventory_number) : product.sku ?? product.id,
      title_snapshot: product.title,
      item_year_snapshot: product.item_year,
      metal_snapshot: getProductMetal(product),
      purity_snapshot: product.purity ? String(product.purity) : null,
      gram_weight_snapshot: getProductWeight(product),
      price_snapshot: selectedProductPrices[product.id],
      quantity: qtyFor(product),
      discount: clampMoneyDiscount(Number(selectedProductDiscounts[product.id]) || 0, lineSubtotalFor(product)),
      image_snapshot: getProductImages(product)[0] ?? null,
    }));

    let { error: itemsError } = await supabase.from('order_items').insert(itemPayloads);
    if (isMissingItemYearColumnError(itemsError)) {
      const fallbackPayloads = itemPayloads.map((item) => {
        const fallbackItem: Record<string, unknown> = { ...item };
        delete fallbackItem.item_year_snapshot;
        delete fallbackItem.quantity;
        return fallbackItem;
      });
      const retry = await supabase.from('order_items').insert(fallbackPayloads);
      itemsError = retry.error;
    }
    if (itemsError) {
      setMessage({ text: itemsError.message, ok: false });
      setSaving(false);
      return;
    }

    const { error: productError } = await adminUpdateProductsStatus(selectedProductIds, 'pending_payment');

    if (productError) {
      setMessage({ text: `Order created, but product statuses were not updated: ${productError}`, ok: false });
      setSaving(false);
      return;
    }

    await fetch(`/api/admin/orders/${order.id}/invoice`, { method: 'POST' });

    setOrders((current) => [{ ...(order as Order), order_items: itemPayloads as never }, ...current]);
    setSaving(false);
    setShowCreate(false);
    setSelectedProductIds([]);
    setSelectedProductDiscounts({});
    setSelectedProductQuantities({});
    setProductSearch('');
    setShowAllProductMatches(false);
    setForm(emptyForm);
    startRouteProgress(`${adminBasePath}/orders/${order.id}`);
    router.push(`${adminBasePath}/orders/${order.id}`);
    router.refresh();
  }

  async function deleteOrder() {
    if (!confirmDelete) return;
    const order = confirmDelete;
    setDeleting(true);
    setMessage(null);
    if (!recycleBinSupported) {
      setConfirmDelete(null);
      setMessage({ text: 'Run supabase/orders-recycle-bin.sql before using the orders Recycle Bin.', ok: false });
      setDeleting(false);
      return;
    }

    // Optionally return the order's products to sellable inventory before
    // removing the order. The reservation columns only exist once the PayPal
    // migration is applied, so fall back to clearing just the status.
    if (returnToInventory) {
      // A paid order's items are 'sold'. Returning them to available here would
      // re-list a sold piece while destroying its payment record. Refund/cancel
      // the order to resolve inventory instead.
      if (order.payment_status === 'paid') {
        setConfirmDelete(null);
        setMessage({
          text: 'This order is paid — its items are sold. Refund or cancel it to resolve inventory instead of returning sold items to stock.',
          ok: false,
        });
        setDeleting(false);
        return;
      }
      const productIds = Array.from(
        new Set((order.order_items ?? []).map((item) => item.product_id).filter((id): id is string => Boolean(id))),
      );
      if (productIds.length > 0) {
        const { error: productError } = await adminUpdateProductsStatus(productIds, 'available');
        if (productError) {
          setConfirmDelete(null);
          setMessage({ text: `Could not return items to inventory: ${productError}`, ok: false });
          setDeleting(false);
          return;
        }
      }
    }

    const { error } = await supabase
      .from('orders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', order.id);
    if (error) {
      setConfirmDelete(null);
      setMessage({ text: `Could not delete order: ${error.message}`, ok: false });
      setDeleting(false);
      return;
    }

    setOrders((current) => current.filter((existing) => existing.id !== order.id));
    setDeleting(false);
    setConfirmDelete(null);
    setMessage({ text: `Order ${order.order_number} moved to the Recycle Bin.`, ok: true });
    router.refresh();
  }

  async function restoreOrder(order: Order) {
    setActingOrderId(order.id);
    setMessage(null);
    const { error } = await supabase
      .from('orders')
      .update({ deleted_at: null })
      .eq('id', order.id);
    setActingOrderId(null);
    if (error) {
      setMessage({ text: `Could not restore order: ${error.message}`, ok: false });
      return;
    }
    setOrders((current) => current.filter((existing) => existing.id !== order.id));
    setSelectedTrashIds((current) => (current.has(order.id) ? toggleId(current, order.id) : current));
    setMessage({ text: `Order ${order.order_number} restored. Inventory statuses were not changed.`, ok: true });
    router.refresh();
  }

  async function purgeOrder(order: Order) {
    if (!window.confirm(`Permanently delete ${order.order_number}? This cannot be undone.`)) return;
    setActingOrderId(order.id);
    setMessage(null);
    const { error } = await supabase.from('orders').delete().eq('id', order.id);
    setActingOrderId(null);
    if (error) {
      setMessage({ text: `Could not permanently delete order: ${error.message}`, ok: false });
      return;
    }
    void removeOrderPickupFiles([order.id]);
    setOrders((current) => current.filter((existing) => existing.id !== order.id));
    setSelectedTrashIds((current) => (current.has(order.id) ? toggleId(current, order.id) : current));
    setMessage({ text: `Order ${order.order_number} permanently deleted.`, ok: true });
    router.refresh();
  }

  // The selection as it stands against the rows currently shown (search and
  // filters applied). "Select all" and "Delete All" mean these rows.
  // eBay / Etsy rows in the bin share the selection (their keys never collide
  // with order uuids — "ebay:…" / "etsy:…").
  const trashVisibleIds = [...filteredOrders.map((order) => order.id), ...filteredMarketplaceKeys];
  const trashSelection = isTrash ? selectionState(trashVisibleIds, selectedTrashIds) : EMPTY_SELECTION;

  async function purgeSelectedOrders() {
    if (trashSelection.count === 0 || purgingSelected) return;
    if (!window.confirm(bulkDeleteConfirmText(trashSelection))) return;
    setPurgingSelected(true);
    setMessage(null);
    const marketplaceKeySet = new Set(filteredMarketplaceKeys);
    const orderIds = trashSelection.ids.filter((id) => !marketplaceKeySet.has(id));
    const marketplaceKeys = trashSelection.ids.filter((id) => marketplaceKeySet.has(id));
    if (orderIds.length > 0) {
      const { error } = await supabase.from('orders').delete().in('id', orderIds);
      if (error) {
        setPurgingSelected(false);
        setMessage({ text: `Could not permanently delete the selected orders: ${error.message}`, ok: false });
        return;
      }
      void removeOrderPickupFiles(orderIds);
      const removed = new Set(orderIds);
      setOrders((current) => current.filter((existing) => !removed.has(existing.id)));
    }
    if (marketplaceKeys.length > 0) {
      const result = await postMarketplaceAction('purge', marketplaceKeys);
      if ('error' in result) {
        setPurgingSelected(false);
        setSelectedTrashIds(new Set(marketplaceKeys));
        setMessage({
          text: `${orderIds.length > 0 ? `${orderIds.length} ${orderIds.length === 1 ? 'order' : 'orders'} permanently deleted, but the` : 'The'} eBay / Etsy sales could not be deleted: ${result.error}`,
          ok: false,
        });
        router.refresh();
        return;
      }
      setRemovedMarketplaceKeys((current) => new Set([...current, ...marketplaceKeys]));
    }
    setPurgingSelected(false);
    setSelectedTrashIds(new Set());
    setMessage({ text: `${trashSelection.count} ${trashSelection.count === 1 ? 'order' : 'orders'} permanently deleted.`, ok: true });
    router.refresh();
  }

  // eBay / Etsy sale records (2026-11-18): the server only HIDES them — the
  // rows stay as the sales sweep's "already seen" marks; no product changes.
  async function postMarketplaceAction(action: MarketplaceHideAction, keys: string[]): Promise<{ changed: number } | { error: string }> {
    try {
      const res = await fetch('/api/admin/orders/marketplace-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, keys }),
      });
      const json = await res.json().catch(() => ({})) as { changed?: number; error?: string };
      if (!res.ok) return { error: json.error ?? `Request failed (${res.status}).` };
      return { changed: json.changed ?? 0 };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Network error.' };
    }
  }

  async function deleteMarketplaceSales() {
    if (!confirmMarketplace || marketplaceBusy) return;
    const records = confirmMarketplace;
    const keys = records.map((record) => record.key);
    setMarketplaceBusy(true);
    setMessage(null);
    const result = await postMarketplaceAction('delete', keys);
    setMarketplaceBusy(false);
    setConfirmMarketplace(null);
    if ('error' in result) {
      setMessage({ text: `Could not delete: ${result.error}`, ok: false });
      return;
    }
    setRemovedMarketplaceKeys((current) => new Set([...current, ...keys]));
    setSelectedMarketplaceKeys((current) => {
      const next = new Set(current);
      for (const key of keys) next.delete(key);
      return next;
    });
    setMessage({ text: `${marketplaceSalesLabel(records)} moved to the Recycle Bin. Nothing changed on ${records.some((r) => r.channel === 'ebay') && records.some((r) => r.channel === 'etsy') ? 'eBay or Etsy' : MARKETPLACE_LABEL[records[0].channel]}.`, ok: true });
    router.refresh();
  }

  async function restoreMarketplaceSale(record: MarketplaceSaleRecord) {
    setActingMarketplaceKey(record.key);
    setMessage(null);
    const result = await postMarketplaceAction('restore', [record.key]);
    setActingMarketplaceKey(null);
    if ('error' in result) {
      setMessage({ text: `Could not restore: ${result.error}`, ok: false });
      return;
    }
    setRemovedMarketplaceKeys((current) => new Set([...current, record.key]));
    setSelectedTrashIds((current) => (current.has(record.key) ? toggleId(current, record.key) : current));
    setMessage({ text: `${marketplaceSalesLabel([record])} restored to Orders.`, ok: true });
    router.refresh();
  }

  async function purgeMarketplaceSale(record: MarketplaceSaleRecord) {
    if (!window.confirm(`Delete ${marketplaceSalesLabel([record])} forever? It will never show on this site again. Nothing changes on ${MARKETPLACE_LABEL[record.channel]}.`)) return;
    setActingMarketplaceKey(record.key);
    setMessage(null);
    const result = await postMarketplaceAction('purge', [record.key]);
    setActingMarketplaceKey(null);
    if ('error' in result) {
      setMessage({ text: `Could not delete forever: ${result.error}`, ok: false });
      return;
    }
    setRemovedMarketplaceKeys((current) => new Set([...current, record.key]));
    setSelectedTrashIds((current) => (current.has(record.key) ? toggleId(current, record.key) : current));
    setMessage({ text: `${marketplaceSalesLabel([record])} permanently deleted from this site.`, ok: true });
    router.refresh();
  }

  function marketplaceRowProps(record: MarketplaceSaleRecord): MarketplaceRowActions {
    if (isTrash) {
      return {
        mode: 'trash',
        selected: selectedTrashIds.has(record.key),
        onToggle: () => setSelectedTrashIds((current) => toggleId(current, record.key)),
        onRestore: () => void restoreMarketplaceSale(record),
        onPurge: () => void purgeMarketplaceSale(record),
        busy: actingMarketplaceKey === record.key,
      };
    }
    if (!marketplaceHideSupported) return { mode: 'none' };
    return {
      mode: 'active',
      selected: selectedMarketplaceKeys.has(record.key),
      onToggle: () => setSelectedMarketplaceKeys((current) => toggleId(current, record.key)),
      onDelete: () => setConfirmMarketplace([record]),
    };
  }

  return (
    <main className="px-4 md:px-8 py-6 md:py-8">
      <div className="ultrawide-page max-w-[1500px] mx-auto">
        <div className="mb-6 md:mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3"
              style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
              Sales
            </p>
            <h1 className="text-3xl md:text-4xl font-bold"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              {isTrash ? 'Orders Recycle Bin' : 'Orders'}
            </h1>
            {isTrash && (
              <p className="mt-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                Deleted orders stay here until restored or permanently deleted.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            {isTrash ? (
              <>
                <button
                  type="button"
                  onClick={() => void purgeSelectedOrders()}
                  disabled={trashSelection.count === 0 || purgingSelected}
                  className="w-full rounded-full border px-5 py-2.5 text-xs font-bold uppercase tracking-[0.14em] disabled:opacity-40 md:w-auto"
                  style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)', fontFamily: 'var(--font-label)', background: 'white' }}
                >
                  {purgingSelected ? 'Deleting…' : bulkDeleteLabel(trashSelection)}
                </button>
                <Link href={ordersPath} className="outline-button w-full justify-center text-sm md:w-auto">
                  Back to Orders
                </Link>
              </>
            ) : (
              <>
                {marketplaceSelection.count > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmMarketplace(filteredMarketplace.filter((record) => marketplaceSelection.ids.includes(record.key)))}
                    className="outline-button social-danger-button w-full justify-center gap-1.5 text-sm md:w-auto"
                  >
                    <AppIcon name="delete" className="text-[1.1rem]" aria-hidden="true" />
                    Delete {marketplaceSelection.count} eBay / Etsy {marketplaceSelection.count === 1 ? 'Sale' : 'Sales'}
                  </button>
                )}
                <Link href={`${ordersPath}?view=trash`} className="outline-button w-full justify-center gap-1.5 text-sm md:w-auto">
                  <AppIcon name="delete" className="text-[1.1rem]" aria-hidden="true" />
                  Recycle Bin{recycleBinSupported && trashCount > 0 ? ` (${trashCount})` : ''}
                </Link>
                <button type="button" onClick={() => void openCreateOrder()} className="gold-button w-full justify-center text-sm md:w-auto">
                  Create Manual Order
                </button>
              </>
            )}
          </div>
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

        {!recycleBinSupported && (
          <div className="mb-6 border px-4 py-3 text-sm"
            style={{
              borderColor: 'var(--color-error)',
              color: 'var(--color-error)',
              background: 'white',
            }}>
            Order Recycle Bin is pending its database migration. Run <code>supabase/orders-recycle-bin.sql</code> before using delete, restore, or delete forever.
          </div>
        )}

        <div className="mb-5 rounded-lg border bg-white p-3 shadow-sm md:flex md:flex-wrap md:items-end md:gap-2 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none">
          <input
            type="search"
            placeholder="Search order, customer, item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-field mb-3 w-full md:mb-0 md:min-w-60 md:flex-1"
          />
          <div className="grid grid-cols-2 gap-2 md:contents">
            <Filter label="Payment" value={paymentFilter} setValue={setPaymentFilter} options={['unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded']} />
            <Filter label="Fulfillment" value={fulfillmentFilter} setValue={setFulfillmentFilter} options={['pending', 'packed', 'shipped', 'picked_up', 'cancelled']} />
            <Filter label="Order" value={orderFilter} setValue={setOrderFilter} options={['open', 'completed', 'cancelled', 'refunded']} />
          </div>
          {(search || paymentFilter || fulfillmentFilter || orderFilter) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setPaymentFilter(''); setFulfillmentFilter(''); setOrderFilter(''); }}
              className="hover-underline-grow mt-3 text-xs font-bold uppercase tracking-wide md:mt-0 md:pb-2"
              style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
            >
              Clear
            </button>
          )}
        </div>

        <div className="mb-3 flex items-center justify-between text-xs md:hidden" style={{ color: 'var(--color-on-surface-variant)' }}>
          <span>{listEntries.length} {listEntries.length === 1 ? 'order' : 'orders'}</span>
          {isTrash ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label="Select all shown"
                checked={trashSelection.all}
                ref={(el) => { if (el) el.indeterminate = trashSelection.some; }}
                onChange={() => setSelectedTrashIds((current) => toggleAll(current, trashVisibleIds))}
              />
              <span>{trashSelection.count > 0 ? `${trashSelection.count} selected` : 'Select all'}</span>
            </label>
          ) : showMarketplaceSelect && filteredMarketplace.length > 0 ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label="Select all shown eBay / Etsy sales"
                checked={marketplaceSelection.all}
                ref={(el) => { if (el) el.indeterminate = marketplaceSelection.some; }}
                onChange={() => setSelectedMarketplaceKeys((current) => toggleAll(current, filteredMarketplaceKeys))}
              />
              <span>{marketplaceSelection.count > 0 ? `${marketplaceSelection.count} selected` : 'Select all eBay / Etsy'}</span>
            </label>
          ) : (
            <span>Tap View for details</span>
          )}
        </div>

        <div className="grid gap-3 md:hidden">
          {listEntries.map((entry) => {
            if (entry.kind === 'marketplace') return <MarketplaceSaleCard key={entry.record.key} record={entry.record} actions={marketplaceRowProps(entry.record)} />;
            const order = entry.order;
            return (
            <article key={order.id} className="rounded-lg border bg-white p-4 shadow-sm" style={{ borderColor: BORDER }}>
              <div className="flex items-start justify-between gap-3">
                {isTrash && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${order.order_number}`}
                    checked={selectedTrashIds.has(order.id)}
                    onChange={() => setSelectedTrashIds((current) => toggleId(current, order.id))}
                    className="mt-1 h-5 w-5 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                    Order
                  </p>
                  <h2 className="mt-1 text-lg font-bold leading-tight" style={{ color: GOLD }}>
                    {order.order_number}
                  </h2>
                  <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {formatOrderDate(order.created_at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                    Total
                  </p>
                  <strong className="mt-1 block text-base" style={{ color: GOLD }}>
                    {formatCurrency(order.total)}
                  </strong>
                </div>
              </div>

              <div className="mt-4 rounded-md border p-3" style={{ borderColor: 'rgba(115, 92, 0, 0.12)', background: 'var(--color-surface-container-low)' }}>
                <p className="font-semibold leading-snug" style={{ color: 'var(--color-on-surface)' }}>
                  {order.customer_name || 'No customer name'}
                </p>
                <p className="mt-1 break-words text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {order.customer_email || 'No email'}
                </p>
                {order.customer_phone && (
                  <p className="mt-0.5 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {order.customer_phone}
                  </p>
                )}
              </div>

              <div className="mt-4">
                <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                  Items
                </p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--color-on-surface)' }}>
                  {itemCountLabel(order)}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <StatusBlock label="Payment" value={order.payment_status} />
                <StatusBlock label="Fulfillment" value={order.fulfillment_status} />
                <StatusBlock label="Status" value={order.order_status} />
              </div>

              {isTrash ? (
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => restoreOrder(order)}
                    disabled={actingOrderId === order.id}
                    className="gold-button w-full justify-center text-sm disabled:opacity-50"
                  >
                    {actingOrderId === order.id ? 'Working...' : 'Restore Order'}
                  </button>
                  <button
                    type="button"
                    onClick={() => purgeOrder(order)}
                    disabled={actingOrderId === order.id}
                    className="w-full rounded-md border py-2 text-xs font-bold uppercase tracking-wide disabled:opacity-50"
                    style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)', fontFamily: 'var(--font-label)' }}
                  >
                    Delete Forever
                  </button>
                </div>
              ) : (
                <>
                  <Link href={`${adminBasePath}/orders/${order.id}`} className="gold-button mt-4 w-full justify-center text-sm">
                    View Order
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setReturnToInventory(true); setConfirmDelete(order); }}
                    className="mt-2 w-full rounded-md border py-2 text-xs font-bold uppercase tracking-wide"
                    style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)', fontFamily: 'var(--font-label)' }}
                  >
                    Delete Order
                  </button>
                </>
              )}
            </article>
            );
          })}
          {listEntries.length === 0 && <EmptyOrders isTrash={isTrash} />}
        </div>

        <div className="hidden overflow-x-auto border md:block" style={{ borderColor: BORDER, background: 'white' }}>
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead style={{ background: 'var(--color-surface-container-low)' }}>
              <tr>
                {isTrash && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all shown"
                      checked={trashSelection.all}
                      ref={(el) => { if (el) el.indeterminate = trashSelection.some; }}
                      onChange={() => setSelectedTrashIds((current) => toggleAll(current, trashVisibleIds))}
                    />
                  </th>
                )}
                {showMarketplaceSelect && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all shown eBay / Etsy sales"
                      title="Select all shown eBay / Etsy sales"
                      checked={marketplaceSelection.all}
                      disabled={filteredMarketplace.length === 0}
                      ref={(el) => { if (el) el.indeterminate = marketplaceSelection.some; }}
                      onChange={() => setSelectedMarketplaceKeys((current) => toggleAll(current, filteredMarketplaceKeys))}
                    />
                  </th>
                )}
                {['Order', 'Date', 'Customer', 'Email / Phone', 'Items', 'Total', 'Payment', 'Fulfillment', 'Status', 'Actions'].map((heading) => (
                  <th key={heading} className="px-4 py-3 text-[0.68rem] uppercase tracking-widest font-bold"
                    style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listEntries.map((entry) => {
                if (entry.kind === 'marketplace') return <MarketplaceSaleRow key={entry.record.key} record={entry.record} actions={marketplaceRowProps(entry.record)} />;
                const order = entry.order;
                return (
                <tr
                  key={order.id}
                  className={isTrash
                    ? 'border-t'
                    : 'border-t cursor-pointer transition-colors hover:bg-[var(--color-surface-container-low)]'}
                  style={{ borderColor: BORDER }}
                  onClick={isTrash ? undefined : (event) => {
                    // Row click opens the order like View, but the row's own
                    // controls and an in-progress text selection keep their
                    // native behavior.
                    if ((event.target as HTMLElement).closest('a, button')) return;
                    if (window.getSelection()?.toString()) return;
                    startRouteProgress(`${adminBasePath}/orders/${order.id}`);
                    router.push(`${adminBasePath}/orders/${order.id}`);
                  }}
                >
                  {isTrash && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${order.order_number}`}
                        checked={selectedTrashIds.has(order.id)}
                        onChange={() => setSelectedTrashIds((current) => toggleId(current, order.id))}
                      />
                    </td>
                  )}
                  {/* Site orders are deleted one at a time (Delete → Recycle Bin, as before). */}
                  {showMarketplaceSelect && <td className="px-4 py-3" />}
                  <td className="px-4 py-3 font-bold" style={{ color: GOLD }}>{order.order_number}</td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>{formatOrderDate(order.created_at)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-on-surface)' }}>{order.customer_name || '-'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-on-surface-variant)' }}>
                    <div>{order.customer_email || '-'}</div>
                    <div>{order.customer_phone || ''}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {itemCountLabel(order)}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: GOLD }}>{formatCurrency(order.total)}</td>
                  <td className="px-4 py-3"><Badge value={order.payment_status} /></td>
                  <td className="px-4 py-3"><Badge value={order.fulfillment_status} /></td>
                  <td className="px-4 py-3"><Badge value={order.order_status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {isTrash ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => restoreOrder(order)}
                          disabled={actingOrderId === order.id}
                          className="hover-underline-grow text-xs font-bold uppercase tracking-wide disabled:opacity-50"
                          style={{ color: GOLD, fontFamily: 'var(--font-label)' }}
                        >
                          Restore
                        </button>
                        <span className="opacity-30">|</span>
                        <button
                          type="button"
                          onClick={() => purgeOrder(order)}
                          disabled={actingOrderId === order.id}
                          className="hover-underline-grow text-xs font-bold uppercase tracking-wide disabled:opacity-50"
                          style={{ color: 'var(--color-error)', fontFamily: 'var(--font-label)' }}
                        >
                          Delete Forever
                        </button>
                      </div>
                    ) : (
                      <>
                        <Link href={`${adminBasePath}/orders/${order.id}`} className="hover-underline-grow text-xs font-bold uppercase tracking-wide" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => { setReturnToInventory(true); setConfirmDelete(order); }}
                          className="hover-underline-grow ml-4 text-xs font-bold uppercase tracking-wide"
                          style={{ color: 'var(--color-error)', fontFamily: 'var(--font-label)' }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                );
              })}
              {listEntries.length === 0 && (
                <tr>
                  <td colSpan={selectColumn ? 11 : 10} className="px-4 py-12 text-center" style={{ color: 'var(--color-on-surface-variant)' }}>
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 overflow-y-auto px-3 py-4 md:px-4 md:py-8" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-lg border md:rounded-none" style={{ background: 'var(--color-background)', borderColor: BORDER }}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-4 md:px-6" style={{ borderColor: BORDER }}>
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
                Create Manual Order
              </h2>
              <button type="button" onClick={() => setShowCreate(false)}
                className="text-sm font-bold uppercase tracking-wide"
                style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                Close
              </button>
            </div>

            <div className="grid gap-5 p-4 md:gap-6 md:p-6 lg:grid-cols-[1fr_21rem]">
              <div className="flex flex-col gap-5">
                <section>
                  <h3 className="form-label">Customer</h3>
                  <div className="grid md:grid-cols-3 gap-3">
                    <input className="form-field" placeholder="Customer name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
                    <input className="form-field" type="email" placeholder="Email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
                    <input className="form-field" type="tel" placeholder="Phone" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
                  </div>
                </section>

                <section>
                  <h3 className="form-label">Products</h3>
                  {loadingProducts && (
                    <p className="mb-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                      Loading available products...
                    </p>
                  )}
                  <div className="relative">
                    <div className="relative">
                      <input
                        className="form-field w-full pr-12"
                        type="search"
                        placeholder="Search by inventory # or product title"
                        value={productSearch}
                        disabled={loadingProducts}
                        onChange={(e) => {
                          setProductSearch(e.target.value);
                          setShowAllProductMatches(false);
                        }}
                        aria-describedby="product-search-help"
                      />
                      <button
                        type="button"
                        aria-label={showAllProductMatches ? 'Hide all products' : 'Show all products'}
                        aria-expanded={showAllProductMatches}
                        onClick={() => {
                          setProductSearch('');
                          setShowAllProductMatches((current) => !current);
                        }}
                        className="absolute bottom-0 right-0 top-0 flex w-11 items-center justify-center border-l"
                        style={{ borderColor: 'rgba(115, 92, 0, 0.16)', color: GOLD }}
                      >
                        <AppIcon name={showAllProductMatches ? 'expand_less' : 'expand_more'} className="text-[1.35rem]" aria-hidden="true" />
                      </button>
                    </div>
                    <p id="product-search-help" className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                      Type an inventory number or any part of the item title, then choose a match.
                    </p>
                  {(productSearch.trim() || showAllProductMatches) && (
                      <div className="absolute left-0 right-0 top-[5.25rem] z-20 max-h-72 overflow-y-auto rounded-md border bg-white shadow-xl" style={{ borderColor: BORDER }}>
                    {productMatches.map((product) => {
                      const price = getSnapshotPrice(product, spotData);
                      return (
                        <button key={product.id} type="button" onClick={() => addProduct(product.id)} className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b px-3 py-3 text-left hover:bg-[var(--color-surface-container-low)] md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:py-2" style={{ borderColor: BORDER }}>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold truncate" style={{ color: 'var(--color-on-surface)' }}>{product.title}</span>
                            <span className="block text-[0.68rem] uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                                {product.inventory_number || product.sku || product.id} - {productStatusLabel(product.status)}
                            </span>
                          </span>
                          <span className="text-sm font-bold" style={{ color: GOLD }}>{formatCurrency(price)}</span>
                        </button>
                      );
                    })}
                    {productMatches.length === 0 && (
                      <p className="px-3 py-4 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                        {productSearch.trim() ? 'No available products match that search.' : 'No available products to add.'}
                      </p>
                    )}
                  </div>
                  )}
                  </div>

                  <div className="mt-3 rounded-md border bg-white" style={{ borderColor: BORDER }}>
                    <div className="flex items-center justify-between gap-3 border-b px-3 py-2" style={{ borderColor: 'rgba(115, 92, 0, 0.12)' }}>
                      <span className="text-[0.62rem] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                        Selected Products
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                        {selectedProducts.length} selected
                      </span>
                    </div>
                    {selectedProducts.length > 0 ? (
                      <div className="grid gap-2 p-3">
                        {selectedProducts.map((product) => (
                          <div key={product.id} className="grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" style={{ borderColor: 'rgba(115, 92, 0, 0.12)' }}>
                            <div className="min-w-0">
                              <strong className="block truncate text-sm" style={{ color: 'var(--color-on-surface)' }}>{product.title}</strong>
                              <span className="mt-1 block text-[0.68rem] uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                                {product.inventory_number || product.sku || product.id} - {productStatusLabel(product.status)}
                              </span>
                              <span className="mt-1 block text-sm font-bold" style={{ color: GOLD }}>
                                {formatCurrency(selectedProductPrices[product.id])}
                                {qtyFor(product) > 1 && (
                                  <span style={{ color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>
                                    {' '}× {qtyFor(product)} = {formatCurrency(lineSubtotalFor(product))}
                                  </span>
                                )}
                              </span>
                              <div className="mt-3 flex flex-wrap gap-3">
                                {productStockCap(product) > 1 && (
                                  <label className="grid max-w-28 gap-1">
                                    <span className="form-label">Quantity ({productStockCap(product)} in stock)</span>
                                    <input
                                      className="form-field"
                                      type="number"
                                      min="1"
                                      max={productStockCap(product)}
                                      step="1"
                                      value={selectedProductQuantities[product.id] ?? 1}
                                      onChange={(event) => setSelectedProductQuantities((current) => ({
                                        ...current,
                                        [product.id]: Math.min(productStockCap(product), Math.max(1, Math.floor(Number(event.target.value) || 1))),
                                      }))}
                                    />
                                  </label>
                                )}
                                <label className="grid max-w-44 gap-1">
                                  <span className="form-label">Line Discount</span>
                                  <input
                                    className="form-field"
                                    type="number"
                                    min="0"
                                    max={lineSubtotalFor(product)}
                                    step="0.01"
                                    value={selectedProductDiscounts[product.id] ?? '0'}
                                    onChange={(event) => setSelectedProductDiscounts((current) => ({ ...current, [product.id]: event.target.value }))}
                                  />
                                </label>
                              </div>
                            </div>
                            <button type="button" onClick={() => removeProduct(product.id)} className="text-left text-xs font-bold uppercase tracking-wide md:text-right" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-label)' }}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="px-3 py-6 text-center text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                        No products selected yet.
                      </p>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="form-label">Shipping / Pickup</h3>
                  <div className="grid md:grid-cols-3 gap-3">
                    <label className="grid gap-1">
                      <span className="form-label">Delivery Method</span>
                      <select className="form-field" value={form.shipping_method} onChange={(e) => setForm({ ...form, shipping_method: e.target.value as ShippingMethod })}>
                        <option value="pickup">Pickup</option>
                        <option value="shipping">Shipping</option>
                        <option value="local_delivery">Local Delivery</option>
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="form-label">Shipping Fee</span>
                      <input className="form-field" type="number" step="0.01" placeholder="0.00" value={form.shipping_fee} onChange={(e) => setForm({ ...form, shipping_fee: e.target.value })} />
                    </label>
                    <label className="grid gap-1">
                      <span className="form-label">Order Discount</span>
                      <input className="form-field" type="number" step="0.01" placeholder="0.00" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
                    </label>
                  </div>
                  <div className="mt-3 grid md:grid-cols-2 gap-3">
                    <label className="grid gap-1 md:col-span-2">
                      <span className="form-label">Address Line 1</span>
                      <input className="form-field" placeholder="Street address" value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} />
                    </label>
                    <label className="grid gap-1 md:col-span-2">
                      <span className="form-label">Address Line 2</span>
                      <input className="form-field" placeholder="Apartment, suite, or unit" value={form.address_line2} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} />
                    </label>
                    <label className="grid gap-1">
                      <span className="form-label">City</span>
                      <input className="form-field" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                    </label>
                    <label className="grid gap-1">
                      <span className="form-label">State</span>
                      <input className="form-field" placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                    </label>
                    <label className="grid gap-1">
                      <span className="form-label">Postal Code</span>
                      <input className="form-field" placeholder="Postal code" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                    </label>
                    <label className="grid gap-1">
                      <span className="form-label">Country</span>
                      <input className="form-field" placeholder="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                    </label>
                  </div>
                </section>

                <section>
                  <h3 className="form-label">Notes</h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <textarea className="form-field resize-y" rows={3} placeholder="Customer notes" value={form.customer_notes} onChange={(e) => setForm({ ...form, customer_notes: e.target.value })} />
                    <textarea className="form-field resize-y" rows={3} placeholder="Internal notes" value={form.internal_notes} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })} />
                  </div>
                </section>
              </div>

              <aside className="sticky bottom-0 rounded-md border p-4 shadow-sm lg:static lg:h-fit lg:shadow-none" style={{ borderColor: BORDER, background: 'white' }}>
                <h3 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                  Order Summary
                </h3>
                <SummaryRow label="Subtotal" value={formatCurrency(subtotal)} />
                {lineDiscount > 0 && <SummaryRow label="Line Discounts" value={`-${formatCurrency(lineDiscount)}`} />}
                {discount > 0 && <SummaryRow label="Total Discount" value={`-${formatCurrency(discount)}`} />}
                <SummaryRow label="Tax" value={formatCurrency(tax)} />
                <SummaryRow label="Shipping" value={formatCurrency(shippingFee)} />
                <div className="border-t mt-3 pt-3" style={{ borderColor: BORDER }}>
                  <SummaryRow label="Total" value={formatCurrency(total)} strong />
                </div>
                <button type="button" onClick={createOrder} disabled={saving} className="gold-button w-full mt-5 text-sm disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Order'}
                </button>
              </aside>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-lg border p-6 shadow-xl" style={{ background: 'white', borderColor: BORDER }}>
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              Delete order?
            </h2>
            <p className="mt-3 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              Move <strong style={{ color: GOLD }}>{confirmDelete.order_number}</strong> and its{' '}
              {(confirmDelete.order_items ?? []).length} line item(s) to the Recycle Bin. You can restore the order later.
            </p>
            <label className="mt-4 flex items-start gap-2 text-sm" style={{ color: 'var(--color-on-surface)' }}>
              <input
                type="checkbox"
                checked={returnToInventory}
                onChange={(e) => setReturnToInventory(e.target.checked)}
                className="mt-0.5"
              />
              <span>Return its products to <strong>Available</strong> inventory</span>
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="text-sm font-bold uppercase tracking-wide disabled:opacity-50"
                style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteOrder}
                disabled={deleting}
                className="rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-50"
                style={{ background: 'var(--color-error)', fontFamily: 'var(--font-label)' }}
              >
                {deleting ? 'Deleting...' : 'Move to Recycle Bin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmMarketplace && confirmMarketplace.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="marketplace-delete-title" className="w-full max-w-md rounded-lg border p-6 shadow-xl" style={{ background: 'white', borderColor: BORDER }}>
            <h2 id="marketplace-delete-title" className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              Delete {confirmMarketplace.length === 1 ? 'this sale' : `${confirmMarketplace.length} sales`} from the site?
            </h2>
            <p className="mt-3 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              Move <strong style={{ color: GOLD }}>{marketplaceSalesLabel(confirmMarketplace)}</strong> to the Recycle Bin.
              You can restore {confirmMarketplace.length === 1 ? 'it' : 'them'} later, or delete forever from there.
            </p>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              This only removes the record from this site. Nothing changes on eBay or Etsy, and no product is touched.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmMarketplace(null)}
                disabled={marketplaceBusy}
                className="hover-underline-grow text-sm font-bold uppercase tracking-wide disabled:opacity-50"
                style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteMarketplaceSales()}
                disabled={marketplaceBusy}
                className="rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:opacity-50"
                style={{ background: 'var(--color-error)', fontFamily: 'var(--font-label)' }}
              >
                {marketplaceBusy ? 'Deleting...' : 'Move to Recycle Bin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Filter({ label, value, setValue, options }: { label: string; value: string; setValue: (value: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.58rem] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>{label}</span>
      <select className="form-field text-xs" value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{orderStatusLabel(option)}</option>)}
      </select>
    </div>
  );
}

const MARKETPLACE_CHIP: Record<MarketplaceSaleRecord['channel'], string> = { ebay: '#0654ba', etsy: '#d5641c' };

function MarketplaceChip({ record }: { record: MarketplaceSaleRecord }) {
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wide text-white"
      style={{ background: MARKETPLACE_CHIP[record.channel], fontFamily: 'var(--font-label)' }}>
      {MARKETPLACE_LABEL[record.channel]}
    </span>
  );
}

function marketplaceLabels(record: MarketplaceSaleRecord) {
  const name = MARKETPLACE_LABEL[record.channel];
  if (record.status === 'refunded') return { payment: `Refunded on ${name}`, fulfillment: `On ${name}`, status: 'Refunded' };
  if (record.status === 'cancelled') return { payment: `Cancelled on ${name}`, fulfillment: `On ${name}`, status: 'Cancelled' };
  return { payment: `Paid on ${name}`, fulfillment: `On ${name}`, status: 'Sold' };
}

function PlainBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide"
      style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' }}>
      {label}
    </span>
  );
}

function MarketplaceLink({ record, className }: { record: MarketplaceSaleRecord; className?: string }) {
  return (
    <a
      href={marketplaceOrderUrl(record.channel, record.externalOrderId)}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? 'hover-underline-grow text-xs font-bold uppercase tracking-wide'}
      style={{ color: GOLD, fontFamily: 'var(--font-label)' }}
    >
      View on {MARKETPLACE_LABEL[record.channel]} ↗
    </a>
  );
}

/**
 * What an eBay / Etsy row can do (2026-11-18): in the list, a checkbox +
 * Delete (→ Recycle Bin); in the Recycle Bin, a checkbox + Restore / Delete
 * Forever; 'none' before supabase/marketplace-sale-hide-2026-11.sql runs.
 */
type MarketplaceRowActions =
  | { mode: 'none' }
  | { mode: 'active'; selected: boolean; onToggle: () => void; onDelete: () => void }
  | { mode: 'trash'; selected: boolean; onToggle: () => void; onRestore: () => void; onPurge: () => void; busy: boolean };

function MarketplaceSelectBox({ record, actions, className }: { record: MarketplaceSaleRecord; actions: MarketplaceRowActions; className?: string }) {
  if (actions.mode === 'none') return null;
  return (
    <input
      type="checkbox"
      aria-label={`Select ${MARKETPLACE_LABEL[record.channel]} sale ${record.externalOrderId}`}
      checked={actions.selected}
      onChange={actions.onToggle}
      className={className}
    />
  );
}

/** An eBay / Etsy sale in the desktop table: what sold, when, how much — no customer. */
function MarketplaceSaleRow({ record, actions }: { record: MarketplaceSaleRecord; actions: MarketplaceRowActions }) {
  const labels = marketplaceLabels(record);
  return (
    <tr className="border-t" style={{ borderColor: BORDER, background: '#fffdf5' }}>
      {actions.mode !== 'none' && (
        <td className="px-4 py-3"><MarketplaceSelectBox record={record} actions={actions} /></td>
      )}
      <td className="px-4 py-3">
        <MarketplaceChip record={record} />
        <div className="mt-1 font-bold" style={{ color: GOLD }}>{record.externalOrderId}</div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>{formatOrderDate(record.soldAt)}</td>
      <td className="px-4 py-3" style={{ color: 'var(--color-on-surface-variant)' }}>-</td>
      <td className="px-4 py-3" style={{ color: 'var(--color-on-surface-variant)' }}>-</td>
      <td className="px-4 py-3 max-w-[18rem]" style={{ color: 'var(--color-on-surface)' }}>
        {record.items.map((item, i) => <div key={i} className="leading-snug">{item}</div>)}
      </td>
      <td className="px-4 py-3 font-semibold" style={{ color: GOLD }}>{record.total != null ? formatCurrency(record.total) : '-'}</td>
      <td className="px-4 py-3"><PlainBadge label={labels.payment} /></td>
      <td className="px-4 py-3"><PlainBadge label={labels.fulfillment} /></td>
      <td className="px-4 py-3"><PlainBadge label={labels.status} /></td>
      <td className="px-4 py-3 whitespace-nowrap">
        {actions.mode === 'trash' ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={actions.onRestore}
              disabled={actions.busy}
              className="hover-underline-grow text-xs font-bold uppercase tracking-wide disabled:opacity-50"
              style={{ color: GOLD, fontFamily: 'var(--font-label)' }}
            >
              Restore
            </button>
            <span className="opacity-30">|</span>
            <button
              type="button"
              onClick={actions.onPurge}
              disabled={actions.busy}
              className="hover-underline-grow text-xs font-bold uppercase tracking-wide disabled:opacity-50"
              style={{ color: 'var(--color-error)', fontFamily: 'var(--font-label)' }}
            >
              Delete Forever
            </button>
          </div>
        ) : (
          <>
            <MarketplaceLink record={record} />
            {actions.mode === 'active' && (
              <button
                type="button"
                onClick={actions.onDelete}
                className="hover-underline-grow ml-4 text-xs font-bold uppercase tracking-wide"
                style={{ color: 'var(--color-error)', fontFamily: 'var(--font-label)' }}
              >
                Delete
              </button>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

/** An eBay / Etsy sale on a phone. */
function MarketplaceSaleCard({ record, actions }: { record: MarketplaceSaleRecord; actions: MarketplaceRowActions }) {
  const labels = marketplaceLabels(record);
  return (
    <article className="rounded-lg border p-4 shadow-sm" style={{ borderColor: BORDER, background: '#fffdf5' }}>
      <div className="flex items-start justify-between gap-3">
        <MarketplaceSelectBox record={record} actions={actions} className="mt-1 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <MarketplaceChip record={record} />
          <h2 className="mt-1 text-lg font-bold leading-tight break-all" style={{ color: GOLD }}>
            {record.externalOrderId}
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            {formatOrderDate(record.soldAt)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
            Price
          </p>
          <strong className="mt-1 block text-base" style={{ color: GOLD }}>
            {record.total != null ? formatCurrency(record.total) : '-'}
          </strong>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
          Item
        </p>
        {record.items.map((item, i) => (
          <p key={i} className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--color-on-surface)' }}>{item}</p>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MarketplaceStatusBlock label="Payment" value={labels.payment} />
        <MarketplaceStatusBlock label="Fulfillment" value={labels.fulfillment} />
        <MarketplaceStatusBlock label="Status" value={labels.status} />
      </div>
      {actions.mode === 'trash' ? (
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={actions.onRestore}
            disabled={actions.busy}
            className="gold-button w-full justify-center text-sm disabled:opacity-50"
          >
            {actions.busy ? 'Working...' : 'Restore Sale'}
          </button>
          <button
            type="button"
            onClick={actions.onPurge}
            disabled={actions.busy}
            className="outline-button social-danger-button w-full justify-center text-sm disabled:opacity-50"
          >
            Delete Forever
          </button>
        </div>
      ) : (
        <>
          <MarketplaceLink record={record} className="outline-button mt-4 w-full justify-center text-sm" />
          {actions.mode === 'active' && (
            <button
              type="button"
              onClick={actions.onDelete}
              className="outline-button social-danger-button mt-2 w-full justify-center text-sm"
            >
              Delete Sale
            </button>
          )}
        </>
      )}
    </article>
  );
}

function MarketplaceStatusBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-white p-2" style={{ borderColor: 'rgba(115, 92, 0, 0.12)' }}>
      <span className="block text-[0.54rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
        {label}
      </span>
      <span className="mt-1 block text-[0.68rem] font-bold uppercase leading-tight" style={{ color: 'var(--color-on-surface)' }}>
        {value}
      </span>
    </div>
  );
}

function Badge({ value }: { value: string }) {
  return (
    <span className="inline-flex px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide"
      style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' }}>
      {orderStatusLabel(value)}
    </span>
  );
}

function StatusBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-white p-2" style={{ borderColor: 'rgba(115, 92, 0, 0.12)' }}>
      <span className="block text-[0.54rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
        {label}
      </span>
      <strong className="mt-1 block truncate text-[0.72rem]" style={{ color: GOLD }}>
        {orderStatusLabel(value)}
      </strong>
    </div>
  );
}

function EmptyOrders({ isTrash = false }: { isTrash?: boolean }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-10 text-center shadow-sm" style={{ borderColor: BORDER }}>
      <AppIcon name="receipt_long" className="mx-auto block text-4xl" aria-hidden="true" style={{ color: 'rgba(115, 92, 0, 0.32)' }} />
      <strong className="mt-3 block" style={{ color: 'var(--color-on-surface)' }}>
        {isTrash ? 'The recycle bin is empty.' : 'No orders found.'}
      </strong>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
        {isTrash ? 'Deleted orders will appear here.' : 'Try clearing filters or creating a manual order.'}
      </p>
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm" style={{ color: strong ? GOLD : 'var(--color-on-surface-variant)' }}>
      <span className={strong ? 'font-bold' : ''}>{label}</span>
      <span className={strong ? 'font-bold' : ''}>{value}</span>
    </div>
  );
}

function itemCountLabel(order: Order): string {
  const count = order.order_items?.length ?? 0;
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

function clampMoneyDiscount(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}
