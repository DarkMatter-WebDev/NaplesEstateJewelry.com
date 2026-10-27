'use client';

import { useMemo, type Dispatch, type SetStateAction } from 'react';
import type { Product, SpotData } from '@/types/product';
import { formatCurrency } from '@/types/sales';
import { getProductImages, getSnapshotPrice } from '@/lib/sales';
import {
  IN_STORE_METALS,
  IN_STORE_TITLE_MAX,
  SALE_ITEMS_MAX,
  parseInStorePrice,
  type InStoreMetal,
} from '@/lib/in-store-sale';
import SalePhotoField from './SalePhotoField';
import { uploadSalePhoto } from './sale-client';

/** The columns the Instant Sale pages load for the search list — enough to price and describe a row. */
export type InStoreProduct = Pick<
  Product,
  | 'id' | 'title' | 'status' | 'quantity' | 'inventory_number' | 'category' | 'metal_variant' | 'purity'
  | 'gram_weight' | 'weight_grams' | 'price_mode' | 'pricing_multiplier' | 'manual_price_label' | 'asking_price'
  | 'sold_price' | 'image_urls' | 'images'
>;

export type SaleItemDraft = {
  key: string;
  mode: 'listed' | 'unlisted';
  query: string;
  selected: InStoreProduct | null;
  title: string;
  metal: InStoreMetal;
  gramWeight: string;
  purity: string;
  price: string;
  photoUrl: string | null;
  photoUploading: boolean;
  photoError: string | null;
};

let keySeed = 0;
/** A blank item line. Starts on "Not listed" in both In-store and Remote sale (owner, 2026-10-27). */
export function newSaleItem(): SaleItemDraft {
  keySeed += 1;
  return {
    key: `item-${Date.now()}-${keySeed}`,
    mode: 'unlisted',
    query: '',
    selected: null,
    title: '',
    metal: 'Gold',
    gramWeight: '',
    purity: '',
    price: '',
    photoUrl: null,
    photoUploading: false,
    photoError: null,
  };
}

/** One line in the request body (`lib/in-store-sale.ts` → `normalizeSaleItems`). */
export function saleItemPayload(item: SaleItemDraft): Record<string, unknown> {
  return item.mode === 'listed'
    ? { kind: 'listed', productId: item.selected?.id, price: item.price, photoUrl: item.photoUrl }
    : { kind: 'unlisted', title: item.title, metal: item.metal, price: item.price, gramWeight: item.gramWeight, purity: item.purity, photoUrl: item.photoUrl };
}

/** A short name for the total card and the success screen. */
export function saleItemLabel(item: SaleItemDraft): string {
  if (item.mode === 'listed') return item.selected ? item.selected.title : 'Listed item';
  return item.title.trim() || 'Not listed';
}

/** The first thing stopping the form, in the words the form shows; null when ready. */
export function saleItemsProblem(items: SaleItemDraft[]): string | null {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const name = items.length > 1 ? `Item ${index + 1}: ` : '';
    if (item.photoUploading) return `${name}wait for the photo to finish uploading.`;
    if (item.mode === 'listed' && !item.selected) return `${name}pick the listed item first.`;
    if (item.mode === 'unlisted' && !item.title.trim()) return `${name}describe what it is.`;
    if (parseInStorePrice(item.price) == null) return `${name}enter the price, e.g. 1460.`;
  }
  return null;
}

const MAX_MATCHES = 6;
const label = 'form-label';
const labelStyle = { color: 'var(--color-primary)' } as const;
const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;

function matchesQuery(product: InStoreProduct, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const number = product.inventory_number != null ? String(product.inventory_number) : '';
  if (/^#?\d+$/.test(q)) return number === q.replace('#', '');
  return product.title.toLowerCase().includes(q) || number === q;
}

function Optional() {
  return <span style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.06em' }}> optional</span>;
}

/**
 * Admin → Instant Sale, section 1 "Items" (owner mockups v1 + v2,
 * 2026-10-21): one card per item — Listed (found by inventory # or title) or
 * Not listed (described) — each with an optional photo, and "Add another
 * item". Shared by the In-store sale and the Remote sale.
 */
export default function SaleItemsEditor({
  items,
  setItems,
  products,
  spotData,
  priceLabel,
  listedNote,
}: {
  items: SaleItemDraft[];
  setItems: Dispatch<SetStateAction<SaleItemDraft[]>>;
  products: InStoreProduct[];
  spotData: SpotData | null;
  /** "Price sold (before tax)" in the store, "Price (before tax)" on an invoice. */
  priceLabel: string;
  /** The line under a picked listed item. */
  listedNote: string;
}) {
  const chosenIds = useMemo(() => new Set(items.flatMap((item) => (item.selected ? [item.selected.id] : []))), [items]);

  function update(key: string, patch: Partial<SaleItemDraft>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function pickPhoto(key: string, photo: Blob) {
    update(key, { photoUploading: true, photoError: null });
    const result = await uploadSalePhoto(photo);
    if ('error' in result) update(key, { photoUploading: false, photoError: result.error });
    else update(key, { photoUploading: false, photoUrl: result.url, photoError: null });
  }

  return (
    <div className="grid gap-3">
      {items.map((item, index) => {
        const matches = item.selected
          ? []
          : products.filter((p) => !chosenIds.has(p.id) && matchesQuery(p, item.query)).slice(0, MAX_MATCHES);
        const listingPhoto = item.mode === 'listed' && item.selected ? getProductImages(item.selected as Product)[0] ?? null : null;
        return (
          <div key={item.key} className="sale-item grid gap-3 rounded-2xl border bg-white p-3.5" style={cardStyle}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'var(--color-primary)' }} aria-label={`Item ${index + 1}`}>
                {index + 1}
              </span>
              <div className="inline-flex rounded-full border p-[3px] gap-[3px]" role="group" aria-label={`Item ${index + 1} source`} style={{ ...cardStyle, background: 'var(--color-surface-container-low)' }}>
                {(['listed', 'unlisted'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => update(item.key, { mode: value })}
                    aria-pressed={item.mode === value}
                    className="rounded-full px-3.5 py-2 text-[0.62rem] font-bold uppercase tracking-[0.12em]"
                    style={{ fontFamily: 'var(--font-label)', background: item.mode === value ? '#fff' : 'transparent', color: item.mode === value ? 'var(--color-primary)' : 'var(--color-on-surface-variant)', boxShadow: item.mode === value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
                  >
                    {value === 'listed' ? 'Listed item' : 'Not listed'}
                  </button>
                ))}
              </div>
              {items.length > 1 && (
                <button type="button" className="ml-auto whitespace-nowrap text-xs underline" style={hintStyle} onClick={() => setItems((current) => current.filter((x) => x.key !== item.key))}>
                  Remove
                </button>
              )}
            </div>

            {item.mode === 'listed' ? (
              <>
                {!item.selected && (
                  <label className="block">
                    <span className={label} style={labelStyle}>Find by inventory # or title</span>
                    <input className="form-field" type="search" inputMode="search" value={item.query} onChange={(e) => update(item.key, { query: e.target.value })} placeholder="53 or ladle" autoComplete="off" />
                  </label>
                )}
                {matches.length > 0 && (
                  <ul className="grid gap-1" aria-label="Matches">
                    {matches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => update(item.key, { selected: p, query: '', price: String(getSnapshotPrice(p as Product, spotData) || '') })}
                          className="w-full text-left rounded-lg border px-3 py-2 text-sm hover:bg-[var(--color-surface-container-low)]"
                          style={cardStyle}
                        >
                          <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>#{p.inventory_number ?? '—'}</span> · {p.title}
                          <span className="block text-xs" style={hintStyle}>{formatCurrency(getSnapshotPrice(p as Product, spotData))} · {p.category}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {item.query.trim() && !item.selected && matches.length === 0 && (
                  <span className="text-xs" style={hintStyle}>No available item matches. Sold or hidden items — and items already on this sale — do not show here.</span>
                )}
                {item.selected && (
                  <div className="flex gap-3 items-center rounded-[14px] border p-3" style={{ borderColor: 'var(--color-primary)', background: '#fbf5dd' }}>
                    {listingPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={listingPhoto} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg flex-shrink-0" style={{ background: 'var(--color-surface-container-high)' }} />
                    )}
                    <div className="min-w-0 grid gap-0.5">
                      <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>#{item.selected.inventory_number ?? '—'} · {item.selected.category} · In stock</span>
                      <span className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-on-surface)' }}>{item.selected.title}</span>
                      <span className="text-xs" style={hintStyle}>Listed at {formatCurrency(getSnapshotPrice(item.selected as Product, spotData))} · {listedNote}</span>
                    </div>
                    <button type="button" className="ml-auto text-xs underline flex-shrink-0" style={hintStyle} onClick={() => update(item.key, { selected: null, price: '' })}>Change</button>
                  </div>
                )}
                <label className="block">
                  <span className={label} style={labelStyle}>{priceLabel}</span>
                  <input className="form-field text-xl font-semibold" inputMode="decimal" value={item.price} onChange={(e) => update(item.key, { price: e.target.value })} placeholder="1026" />
                </label>
              </>
            ) : (
              <>
                <label className="block">
                  <span className={label} style={labelStyle}>What it is</span>
                  <input className="form-field" value={item.title} maxLength={IN_STORE_TITLE_MAX} onChange={(e) => update(item.key, { title: e.target.value })} placeholder="14K rope chain · 22 in · 18.4 g" />
                </label>
                <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr]">
                  <label className="block">
                    <span className={label} style={labelStyle}>Metal</span>
                    <select className="form-field" value={item.metal} onChange={(e) => update(item.key, { metal: e.target.value as InStoreMetal })}>
                      {IN_STORE_METALS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className={label} style={labelStyle}>{priceLabel}</span>
                    <input className="form-field text-xl font-semibold" inputMode="decimal" value={item.price} onChange={(e) => update(item.key, { price: e.target.value })} placeholder="1460" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={label} style={labelStyle}>Weight g<Optional /></span>
                    <input className="form-field" inputMode="decimal" value={item.gramWeight} onChange={(e) => update(item.key, { gramWeight: e.target.value })} placeholder="18.4" />
                  </label>
                  <label className="block">
                    <span className={label} style={labelStyle}>Purity<Optional /></span>
                    <input className="form-field" value={item.purity} maxLength={20} onChange={(e) => update(item.key, { purity: e.target.value })} placeholder="14K" />
                  </label>
                </div>
                <span className="text-xs" style={hintStyle}>Recorded on the order only. No product is created, so nothing can show in the shop.</span>
              </>
            )}

            <SalePhotoField
              photoUrl={item.photoUrl}
              listingPhoto={listingPhoto}
              uploading={item.photoUploading}
              error={item.photoError}
              onPick={(photo) => void pickPhoto(item.key, photo)}
              onRemove={() => update(item.key, { photoUrl: null, photoError: null })}
            />
          </div>
        );
      })}

      {items.length < SALE_ITEMS_MAX && (
        <button
          type="button"
          onClick={() => setItems((current) => [...current, newSaleItem()])}
          className="rounded-2xl border-[1.5px] border-dashed p-3 text-center text-[0.68rem] font-bold uppercase tracking-[0.14em]"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: '#fffdf5', fontFamily: 'var(--font-label)' }}
        >
          ＋ Add another item
        </button>
      )}
    </div>
  );
}
