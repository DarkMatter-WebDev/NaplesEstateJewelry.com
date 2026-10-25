'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import CartDrawer from '@/components/cart/CartDrawer';
import { isProductPurchasable, normalizeProductQuantity, productImagePaddingForImage, type Product, type ProductStatus } from '@/types/product';
import { createClient } from '@/lib/supabase/client';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import { normalizeManualPriceLabel } from '@/lib/pricing';

// A cart item whose live availability changed since it was added — surfaced to
// the shopper as a heads-up in the cart drawer and at checkout. 'sold-out' = no
// longer purchasable at all; 'reduced' = still purchasable but fewer units are
// left than they had requested.
export type StockAlert = { id: string; title: string; kind: 'sold-out' | 'reduced'; available: number };

// Live availability row read during refreshAvailability(). `quantity` is optional
// because the column may not exist yet (migration pending), in which case the
// query falls back to selecting status only.
type FreshProductRow = { id: string; status: string; quantity?: number | null };

export interface CartItem {
  id: string;
  title: string;
  title_es: string | null;
  description?: string | null;
  description_es?: string | null;
  public_notes?: string | null;
  image: string | null;
  image_padding?: Product['image_padding'];
  status: ProductStatus;
  // Units currently in stock for this product. Missing/null is treated as 1 by
  // isProductPurchasable() and normalizeProductQuantity(), so omitting it never
  // regresses a one-of-a-kind item.
  stockQuantity?: number | null;
  // How many units of this listing the buyer wants to purchase. Defaults to 1
  // and is always clamped to 1..stockQuantity. Distinct from stockQuantity
  // (what's available). Optional on input for backward-compatible callers;
  // normalizeCartItem() fills it in.
  purchaseQuantity?: number;
  priceLabel: string;
  category?: Product['category'];
  metal_type?: string | null;
  metal_variant?: string | null;
  purity?: number | null;
  weight_grams?: number | null;
  gram_weight?: number | null;
  product_type?: string | null;
  jewelry_type?: string | null;
  chain_type?: string | null;
  length?: string | null;
  brand?: string | null;
  item_year?: number | null;
  tags?: string[];
  tags_es?: string[];
  gender?: string | null;
}

interface CartContextValue {
  items: CartItem[];
  // True once the saved cart has been read from localStorage. An add() before
  // then is overwritten by that read (the Meta checkout hand-off waits on it).
  hydrated: boolean;
  count: number;
  isIn: (id: string) => boolean;
  add: (item: CartItem, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  recentlyAdded: string | null;
  notifyAdded: (title: string) => void;
  dismissAdded: () => void;
  // Live-stock checking: re-reads each cart item's current status/quantity from
  // the DB, updates the stored items, and records any that went out of stock or
  // dropped below the requested quantity.
  stockAlerts: StockAlert[];
  refreshAvailability: (itemsOverride?: CartItem[]) => Promise<void>;
  dismissStockAlerts: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const LS_KEY = 'nej-cart';

// The most units a buyer may put in the cart for one listing. A missing/unknown
// stock quantity is treated as one-of-a-kind (1).
function cartStockCap(item: Pick<CartItem, 'stockQuantity'>): number {
  return Math.max(1, normalizeProductQuantity(item.stockQuantity));
}

function clampPurchaseQuantity(quantity: number | undefined, item: Pick<CartItem, 'stockQuantity'>): number {
  const requested = Number.isFinite(quantity) ? Math.floor(Number(quantity)) : 1;
  return Math.min(cartStockCap(item), Math.max(1, requested));
}

function normalizeCartItem(item: CartItem): CartItem {
  return {
    ...item,
    image: normalizeLegacyLocalImageUrl(item.image),
    priceLabel: normalizeManualPriceLabel(item.priceLabel) ?? item.priceLabel,
    // Backfill/clamp the buyer's requested quantity (old localStorage carts have
    // no purchaseQuantity; a stale value could also exceed current stock).
    purchaseQuantity: clampPurchaseQuantity(item.purchaseQuantity, item),
  };
}

function loadFromStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]).map(normalizeCartItem) : [];
  } catch {
    return [];
  }
}

export function CartProvider({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest items snapshot for no-argument refreshAvailability() callers (the cart
  // drawer opening, a PayPal error handler) — decoupled from an items-change
  // commit, so this effect-updated ref is fresh for them. Callers that fire during
  // the same commit as an items change (checkout's hydration effect) pass their
  // fresh items in explicitly instead of relying on this ref.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setItems(loadFromStorage());
      setHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(LS_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const missingPaddingIds = items
      .filter((item) => item.image && item.image_padding === undefined)
      .map((item) => item.id);
    if (missingPaddingIds.length === 0) return;

    let cancelled = false;

    async function loadImagePadding() {
      const supabase = createClient();
      const { data } = await supabase
        .from('products')
        .select('id, image_padding, image_padding_by_image')
        .in('id', missingPaddingIds);

      if (cancelled || !data) return;
      const productById = new Map(data.map((product) => [product.id, product]));

      setItems((current) => {
        let changed = false;
        const next = current.map((item) => {
          const product = productById.get(item.id);
          if (item.image_padding !== undefined || !product) return item;
          changed = true;
          return { ...item, image_padding: productImagePaddingForImage(product.image_padding, product.image_padding_by_image, item.image, 0) };
        });
        return changed ? next : current;
      });
    }

    loadImagePadding();

    return () => {
      cancelled = true;
    };
  }, [hydrated, items]);

  const isIn = useCallback((id: string) => items.some((i) => i.id === id), [items]);

  const add = useCallback((item: CartItem, quantity: number = 1) => {
    const normalized = normalizeCartItem({ ...item, purchaseQuantity: quantity });
    setItems((prev) => {
      const existing = prev.find((i) => i.id === normalized.id);
      if (!existing) return [...prev, normalized];
      // Already in the cart — increase the requested quantity (capped at stock),
      // refreshing the stock ceiling from the latest add() in case it changed.
      const nextStock = normalized.stockQuantity ?? existing.stockQuantity;
      const merged = { ...existing, stockQuantity: nextStock };
      const nextQty = clampPurchaseQuantity(
        (existing.purchaseQuantity ?? 1) + clampPurchaseQuantity(quantity, merged),
        merged,
      );
      return prev.map((i) => (i.id === normalized.id ? { ...merged, purchaseQuantity: nextQty } : i));
    });
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, purchaseQuantity: clampPurchaseQuantity(quantity, i) } : i)));
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const dismissAdded = useCallback(() => {
    if (addedTimer.current) clearTimeout(addedTimer.current);
    setRecentlyAdded(null);
  }, []);

  const notifyAdded = useCallback((title: string) => {
    if (addedTimer.current) clearTimeout(addedTimer.current);
    setRecentlyAdded(title);
    addedTimer.current = setTimeout(() => setRecentlyAdded(null), 3500);
  }, []);

  const dismissStockAlerts = useCallback(() => setStockAlerts([]), []);

  // Re-check live availability for every cart item. Updates each item's stored
  // status/stockQuantity (and re-clamps its requested quantity) and records a
  // StockAlert for anything that just went out of stock or dropped below what the
  // shopper wanted. Best-effort: a read failure leaves the cart untouched.
  const refreshAvailability = useCallback(async (itemsOverride?: CartItem[]) => {
    // Prefer explicitly-passed items (fresh even mid-commit); otherwise read the
    // effect-updated ref (fine for decoupled callers like the drawer/error path).
    const snapshot = itemsOverride ?? itemsRef.current;
    if (snapshot.length === 0) {
      setStockAlerts([]);
      return;
    }
    const ids = snapshot.map((item) => item.id);
    const supabase = createClient();
    let rows: FreshProductRow[];
    const res = await supabase.from('products').select('id, status, quantity').in('id', ids);
    if (res.error) {
      // `quantity` may not exist yet (migration pending) — fall back to status only.
      if (/quantity/i.test(res.error.message ?? '')) {
        const fallback = await supabase.from('products').select('id, status').in('id', ids);
        if (fallback.error || !fallback.data) return;
        rows = fallback.data as unknown as FreshProductRow[];
      } else {
        return;
      }
    } else {
      if (!res.data) return;
      rows = res.data as unknown as FreshProductRow[];
    }

    const freshById = new Map(rows.map((row) => [row.id, row]));
    const alerts: StockAlert[] = [];

    // Alert on the item's CURRENT availability (not a before/after diff): anything
    // no longer purchasable, or with fewer units left than requested, is flagged.
    // Basing this on current state keeps the alert stable across repeated refreshes
    // and page reloads — a diff against the stored status would vanish the moment
    // this same call rewrites that status to 'sold'.
    for (const item of snapshot) {
      const fresh = freshById.get(item.id);
      // A missing row means the product was deleted — treat as sold out.
      const nextStatus = (fresh?.status ?? 'sold') as ProductStatus;
      const nextQuantity = fresh && 'quantity' in fresh ? fresh.quantity ?? null : item.stockQuantity ?? null;
      const requested = Math.max(1, normalizeProductQuantity(item.purchaseQuantity));
      const availableUnits = normalizeProductQuantity(nextQuantity);
      if (!isProductPurchasable(nextStatus, nextQuantity)) {
        alerts.push({ id: item.id, title: item.title, kind: 'sold-out', available: 0 });
      } else if (availableUnits < requested) {
        alerts.push({ id: item.id, title: item.title, kind: 'reduced', available: availableUnits });
      }
    }

    setItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const fresh = freshById.get(item.id);
        if (!fresh && item.status !== 'sold') {
          changed = true;
          return { ...item, status: 'sold' as ProductStatus };
        }
        if (!fresh) return item;
        const nextStatus = fresh.status as ProductStatus;
        const nextQuantity = 'quantity' in fresh ? fresh.quantity ?? null : item.stockQuantity ?? null;
        const clampedQty = clampPurchaseQuantity(item.purchaseQuantity, { stockQuantity: nextQuantity });
        if (item.status === nextStatus && item.stockQuantity === nextQuantity && item.purchaseQuantity === clampedQty) {
          return item;
        }
        changed = true;
        return { ...item, status: nextStatus, stockQuantity: nextQuantity, purchaseQuantity: clampedQty };
      });
      return changed ? next : prev;
    });
    setStockAlerts(alerts);
  }, []);

  // Drop stale alerts for items no longer in the cart (removed / cleared) at read
  // time — avoids a set-state-in-effect while keeping alerts consistent with items.
  const visibleStockAlerts = stockAlerts.filter((alert) => items.some((item) => item.id === alert.id));

  return (
    <CartContext.Provider value={{ items, hydrated, count: items.reduce((sum, i) => sum + (i.purchaseQuantity ?? 1), 0), isIn, add, setQuantity, remove, clear, drawerOpen, openDrawer, closeDrawer, recentlyAdded, notifyAdded, dismissAdded, stockAlerts: visibleStockAlerts, refreshAvailability, dismissStockAlerts }}>
      {children}
      <CartDrawer locale={locale} />
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
