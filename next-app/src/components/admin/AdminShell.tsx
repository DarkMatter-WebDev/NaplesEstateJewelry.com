'use client';

import { adminGetProduct, adminUpdateProductStatus, adminRevalidateProduct } from '@/app/actions/admin-products';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { startRouteProgress } from '@/components/layout/RouteProgressBar';
import { createClient } from '@/lib/supabase/client';
import { copyTextToClipboard } from '@/lib/clipboard';
import { encodeCanvasForUpload } from '@/lib/image-encode';
import {
  PRODUCT_METAL_VARIANTS,
  PRODUCT_METAL_TYPES,
  PRODUCT_JEWELRY_TYPES,
  PRODUCT_LINK_TYPES,
  getDefaultMetalVariant,
  formatProductItemYear,
  inferProductJewelryType,
  normalizeProductItemYear,
  normalizeProductJewelryType,
  normalizeProductLengthSizeValue,
  normalizeProductWidthMm,
  normalizeProductMetalType,
  normalizeProductLinkType,
  normalizeProductMetalVariant,
  normalizeProductQuantity,
  normalizeSpecialPriceOverrideMode,
  normalizeProductTypeValue,
  productJewelryTypeLabel,
  hasAnyProductImagePadding,
  isProductImagePaddingCustomColor,
  normalizeProductImagePadding,
  normalizeProductImagePaddingMap,
  normalizeProductImagePaddingValue,
  productImagePaddingBackground,
  productImagePaddingForImage,
  productImagePaddingMapKey,
  productMetalTypeLabel,
  productSupportsLinkType,
  productMetalVariantLabel,
  type Product,
  type ProductImagePadding,
  type ProductImagePaddingMap,
  type ProductMetalType,
  type ProductMetalVariant,
  type ProductStatus,
  type SpotData,
} from '@/types/product';
import { calcSpotMeltValue, formatUsdPrice, getDisplayPrice, getProductPriceValue, getSpotMeltDisplayPrice, normalizeManualPriceLabel } from '@/lib/pricing';
import ComboboxInput from './ComboboxInput';
import AdminHeader from './AdminHeader';
import EtsyProductPanel from './EtsyProductPanel';
import EtsyBulkSyncModal from './EtsyBulkSyncModal';
import EtsyBulkPublishModal from './EtsyBulkPublishModal';
import EtsyBulkRepairModal from './EtsyBulkRepairModal';
import EbayProductPanel from './EbayProductPanel';
import InstagramProductPanel from './InstagramProductPanel';
import FacebookProductPanel from './FacebookProductPanel';
import EbayBulkSyncModal from './EbayBulkSyncModal';
import EbayBulkPublishModal from './EbayBulkPublishModal';
import EbayBestOfferBulkModal from './EbayBestOfferBulkModal';
import { ebayChipLabelWithOffer } from '@/lib/ebay/best-offer';
import { bulkAcceptsOffersMessage } from '@/lib/offers';
import SelectedProductsActionsModal, { type SelectedMarketplaceAction } from './SelectedProductsActionsModal';
import SelectedProductsStatusModal from './SelectedProductsStatusModal';
import type { Marketplace } from '@/lib/selected-marketplace-status';
import { applyFieldPatchToEditorState, type ProductFieldEditPatch } from '@/lib/product-field-edits';
import ProductVideoEditor, { type ProductVideoEditorHandle } from './ProductVideoEditor';
import {
  DEFAULT_QUICK_FILL_AI_FORMAT_PROMPT,
  QUICK_FILL_PROMPT_STORAGE_KEY,
  ensureQuickFillPromptHasCurrentBrandRules,
} from '@/lib/admin-settings';
import { PRODUCT_IMAGES_BUCKET, uniqueProductImageStoragePaths } from '@/lib/product-image-storage';
import {
  PRODUCT_AUTOFILL_FIELD_KEYS,
  type ProductAutofillDraft,
  type ProductAutofillFields,
} from '@/lib/ai-product-schema';
import { getSnapshotPrice } from '@/lib/sales';
import { toAdminProductSummary } from '@/lib/admin-product-summary';
import {
  buildMissingSpanishCopyRequest,
  mergeMissingSpanishCopy,
  translatedSpanishTargets,
} from '@/lib/admin-spanish-copy';
import { AppIcon } from '@/components/AppIcon';
import { resolvePriceChip, type PriceChipInput } from '@/lib/marketplace-price-chip';
import { onLayoutAffectingResize } from '@/lib/viewport-resize';

// Quick Fill is removed from the editor UI for now. The parser and panel still
// live in this file behind the flag so it can be restored without a backup copy.
const SHOW_QUICK_FILL: boolean = false;

interface Props {
  initialProducts: Product[];
  userEmail: string;
  spotData: SpotData | null;
  locale: string;
  unreadMessagesCount: number;
}

const STATUSES: { value: ProductStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'available', label: 'Available' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'sold', label: 'Sold' },
  { value: 'archived', label: 'Archived' },
];
const MAX_PRODUCT_IMAGE_COUNT = 20;
const MAX_PRODUCT_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024;
const LOCATIONS = [
  { value: 'showcase', label: 'Showcase' },
  { value: 'safe', label: 'Safe' },
  { value: 'offsite', label: 'Offsite' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'picked_up', label: 'Picked Up' },
];

function getQuickFillLinkType(value: string, allowCustom = false): string | null {
  const normalized = normalizeProductLinkType(value);
  if (normalized) return normalized;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return allowCustom && trimmed ? trimmed : null;
}

function getChainTypeFromTags(tags: string[] | null): string {
  const tag = (tags ?? []).find(t => t.startsWith('ct:'));
  return tag ? tag.slice(3) : '';
}

function getProductChainType(product: Product): string {
  return product.chain_type || getChainTypeFromTags(product.tags);
}

function getProductJewelryType(product: Product): string {
  return inferProductJewelryType(product);
}

function getProductMetalType(product: Product): ProductMetalType {
  return normalizeProductMetalType(product.metal_type, product.category);
}

function getProductLinkType(product: Product): string {
  const jewelryType = getProductJewelryType(product);
  if (!productSupportsLinkType(jewelryType)) return '';
  return getProductChainType(product);
}

const PREDEFINED_LENGTHS = [
  '16', '18', '20', '22', '24', '26', '28', '30',
  '7', '7.5', '8',
];

function getLengthFromTags(tags: string[] | null): string {
  const tag = (tags ?? []).find(t => t.startsWith('len:'));
  return tag ? tag.slice(4) : '';
}

function getProductLength(product: Product): string {
  return normalizeProductLengthSizeValue(product.length || getLengthFromTags(product.tags));
}

function formatItemYear(value: string | number | null | undefined): string {
  return formatProductItemYear(value) ?? '-';
}

// Columns added by later migrations that may not exist yet on an un-migrated
// database. If a save hits a missing one, we retry without all of them so the
// admin can keep saving before the migration is applied.
const OPTIONAL_PRODUCT_COLUMNS = [
  'item_year',
  'public_notes_es',
  'show_spot_price',
  'special_price_override_enabled',
  'special_price_override_amount',
  'special_price_override_mode',
  'special_price_override_percent',
  'sold_price',
  'quantity',
  'width_mm',
  'accepts_offers',
] as const;

function isMissingOptionalColumnError(error: { message?: string | null } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? '';
  return OPTIONAL_PRODUCT_COLUMNS.some((column) => message.includes(column));
}

function withoutOptionalColumns<T extends Record<string, unknown>>(payload: T): T {
  const rest: Record<string, unknown> = { ...payload };
  for (const column of OPTIONAL_PRODUCT_COLUMNS) delete rest[column];
  return rest as T;
}

function isMissingAcceptsOffersColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('accepts_offers'));
}

function isMissingWidthColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('width_mm'));
}

function withoutWidthColumn<T extends Record<string, unknown>>(payload: T): T {
  const rest: Record<string, unknown> = { ...payload };
  delete rest.width_mm;
  return rest as T;
}

function getLengthSizeLabel(jewelryType: string | null | undefined): string {
  const normalized = normalizeProductJewelryType(jewelryType);
  if (normalized === 'Ring') return 'Size';
  if (normalized === 'Necklace' || normalized === 'Bracelet') return 'Length';
  return 'Height';
}

function productUsesLength(productType: string | null | undefined): boolean {
  const normalized = normalizeProductJewelryType(productType);
  return normalized === 'Necklace' || normalized === 'Bracelet';
}

function productUsesSize(productType: string | null | undefined): boolean {
  return normalizeProductJewelryType(productType) === 'Ring';
}

// Anything that is not a Necklace, Bracelet, or Ring uses the size field to store the
// item's height (e.g. a 1.5 in brooch, a 0.75 in pendant).
function productUsesHeight(productType: string | null | undefined): boolean {
  const normalized = normalizeProductJewelryType(productType);
  if (!normalized) return Boolean(String(productType ?? '').trim());
  return normalized !== 'Necklace' && normalized !== 'Bracelet' && normalized !== 'Ring';
}

function productUsesGender(productType: string | null | undefined): boolean {
  const normalized = normalizeProductJewelryType(productType);
  if (!normalized) return Boolean(String(productType ?? '').trim());
  return normalized === 'Necklace' ||
    normalized === 'Bracelet' ||
    normalized === 'Ring' ||
    normalized === 'Pendant' ||
    normalized === 'Earrings' ||
    normalized === 'Brooch' ||
    normalized === 'Cufflinks' ||
    normalized === 'Watch';
}

function normalizeProductStatus(status: Product['status'] | null | undefined): ProductStatus {
  const value = String(status ?? 'available').toLowerCase().replace(/\s+/g, '_');
  if (value === 'available') return 'available';
  if (value === 'sold') return 'sold';
  if (value === 'draft') return 'draft';
  if (value === 'pending_payment') return 'pending_payment';
  if (value === 'archived') return 'archived';
  return 'available';
}

function getStatusLabel(status: Product['status'] | null | undefined): string {
  const normalized = normalizeProductStatus(status);
  return STATUSES.find((item) => item.value === normalized)?.label ?? 'Available';
}

function getStatusTone(status: Product['status'] | null | undefined) {
  const normalized = normalizeProductStatus(status);
  if (normalized === 'available') return { bg: 'var(--color-primary)', fg: 'var(--color-on-primary)' };
  if (normalized === 'draft') return { bg: '#ede9fe', fg: '#5b21b6' };
  if (normalized === 'sold') return { bg: 'var(--color-on-surface)', fg: 'var(--color-surface)' };
  if (normalized === 'pending_payment') return { bg: '#8a5a00', fg: '#fff' };
  if (normalized === 'archived') return { bg: '#6b7280', fg: '#fff' };
  return { bg: 'var(--color-surface-container-high)', fg: 'var(--color-on-surface)' };
}

function getStatusRank(status: Product['status'] | null | undefined): number {
  const normalized = normalizeProductStatus(status);
  const ranks: Record<string, number> = {
    available: 0,
    pending_payment: 1,
    draft: 2,
    sold: 3,
    archived: 4,
  };
  return ranks[normalized] ?? 0;
}

function getProductMetal(product: Product): string {
  return product.metal || product.category;
}

function getProductMetalVariant(product: Product): ProductMetalVariant {
  return normalizeProductMetalVariant(product.metal_variant, product.category);
}

function getCategoryForMetalVariant(value: ProductMetalVariant | string): 'Gold' | 'Silver' {
  return PRODUCT_METAL_VARIANTS.Silver.some((variant) => variant.value === value)
    ? 'Silver'
    : 'Gold';
}

function getLegacyCategoryForMetalType(value: string | null | undefined, fallback: 'Gold' | 'Silver' = 'Gold'): 'Gold' | 'Silver' {
  const normalized = normalizeProductMetalType(value, fallback);
  if (normalized === 'Silver' || normalized === 'Platinum' || normalized === 'Palladium') return 'Silver';
  if (normalized === 'Gold') return 'Gold';
  return fallback;
}

function getProductWeight(product: Product): number | null {
  return product.gram_weight ?? product.weight_grams ?? null;
}

function getProductImages(product: Product): string[] {
  return product.image_urls?.length ? product.image_urls : product.images ?? [];
}

function parseInventoryNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const numeric = Number(String(value).replace(/\D/g, ''));
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function formatInventoryNumberDisplay(value: string | number | null | undefined): string {
  return parseInventoryNumber(value)?.toString() ?? '-';
}

function slugifyProductText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildGeneratedProductId(product: ReturnType<typeof emptyProduct>): string {
  const titleSlug = slugifyProductText(product.title) || 'product';
  const inventoryNumber = parseInventoryNumber(product.inventory_number);
  return inventoryNumber ? `${titleSlug}-${inventoryNumber}` : titleSlug;
}

function getDisplayedInventoryNumber(product: Product, products: Product[]): number | null {
  if (product.inventory_number) return product.inventory_number;
  const masterIndex = getMasterProductOrder(products).findIndex((item) => item.id === product.id);
  return masterIndex >= 0 ? masterIndex + 1 : null;
}

function getNextInventoryNumber(products: Product[], excludeId?: string): number {
  const usedNumbers = new Set<number>();
  const masterOrderedProducts = getMasterProductOrder(products);

  masterOrderedProducts.forEach((product, index) => {
    if (excludeId && product.id === excludeId) return;
    const displayedNumber = product.inventory_number ?? index + 1;
    if (displayedNumber > 0) usedNumbers.add(displayedNumber);
  });

  let candidate = 1;
  while (usedNumbers.has(candidate)) candidate += 1;
  return candidate;
}

function getInventoryNumberOwner(
  products: Product[],
  inventoryNumber: number | null,
  excludeId?: string,
): Product | null {
  if (!inventoryNumber) return null;
  return getMasterProductOrder(products).find((product, index) => {
    if (excludeId && product.id === excludeId) return false;
    return (parseInventoryNumber(product.inventory_number) ?? index + 1) === inventoryNumber;
  }) ?? null;
}

function getDuplicateInventoryNumberMessage(owner: Product, inventoryNumber: number): string {
  return `Inventory #${inventoryNumber} is already assigned to "${owner.title}". Choose a different inventory number before saving.`;
}

function ClearableField({
  children,
  onClear,
  show = true,
  disabled = false,
  multiline = false,
}: {
  children: React.ReactNode;
  onClear: () => void;
  show?: boolean;
  disabled?: boolean;
  multiline?: boolean;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [hasSelect, setHasSelect] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);

  useEffect(() => {
    setHasSelect(Boolean(fieldRef.current?.querySelector('select')));
  }, [children]);

  return (
    <div
      ref={fieldRef}
      className={`clearable-field${show ? ' clearable-field--active' : ''}${clearArmed ? ' clearable-field--clear-armed' : ''}${multiline ? ' clearable-field--multiline' : ''}`}
    >
      {children}
      {show && (
        <button
          type="button"
          className="clearable-field__button"
          aria-label={hasSelect && !clearArmed ? 'Show options' : 'Clear field'}
          title={hasSelect && !clearArmed ? 'Show options' : 'Clear field'}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            const field = event.currentTarget.parentElement?.querySelector<HTMLElement>('input, select, textarea');
            if (hasSelect && !clearArmed) {
              setClearArmed(true);
              window.setTimeout(() => {
                field?.focus();
                if (field instanceof HTMLSelectElement) {
                  const selectField = field as HTMLSelectElement & { showPicker?: () => void };
                  if (selectField.showPicker) {
                    selectField.showPicker();
                  } else {
                    selectField.click();
                  }
                }
              }, 0);
              return;
            }
            onClear();
            setClearArmed(false);
            window.setTimeout(() => {
              field?.focus();
            }, 0);
          }}
        >
          {hasSelect && !clearArmed ? 'v' : 'x'}
        </button>
      )}
    </div>
  );
}

const CHAIN_KEYWORDS: Record<string, string[]> = {
  'cuban-link':     ['cuban'],
  'figaro-link':    ['figaro'],
  'rope-chain':     ['rope'],
  'anchor-link':    ['anchor', 'gucci'],
  'oval-link':      ['oval link'],
  'byzantine-link': ['byzantine'],
  'box-link':       ['box link'],
};

const PRICE_MODES = [
  { value: 'spot-multiplier', label: 'Spot × Multiplier' },
  { value: 'manual', label: 'Manual / Fixed' },
] as const;

const GOLD_FILTER_PURITY_OPTIONS = [['18', '18K'], ['14', '14K'], ['10', '10K']];
const SILVER_FILTER_PURITY_OPTIONS = [['925', '925 Sterling']];

type SortKey =
  | 'inventoryNumber'
  | 'image'
  | 'title'
  | 'brand'
  | 'category'
  | 'metalVariant'
  | 'gender'
  | 'jewelryType'
  | 'chainType'
  | 'length'
  | 'itemYear'
  | 'location'
  | 'featured'
  | 'offers'
  | 'purity'
  | 'weight'
  | 'melt'
  | 'mode'
  | 'currentPrice'
  | 'status'
  | 'quantity';

type SortDirection = 'asc' | 'desc';
type ImageTarget = { url: string; index: number; alt?: string };
type CropRect = { x: number; y: number; width: number; height: number };
type CropDragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type BrowserEyeDropper = { open: () => Promise<{ sRGBHex: string }> };
type WindowWithEyeDropper = Window & { EyeDropper?: new () => BrowserEyeDropper };
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};
const FULL_IMAGE_CROP: CropRect = { x: 0, y: 0, width: 100, height: 100 };
const IMAGE_PADDING_OPTIONS: { value: ProductImagePadding; label: string; description: string }[] = [
  { value: 'none', label: 'No Padding', description: 'Use the normal site image frame.' },
  { value: 'white', label: 'White Padding', description: 'Fill side padding with white.' },
  { value: 'black', label: 'Black Padding', description: 'Fill side padding with black.' },
];
type QuickFillField =
  | 'title'
  | 'titleEs'
  | 'brand'
  | 'productType'
  | 'metalType'
  | 'category'
  | 'metalVariant'
  | 'status'
  | 'jewelryType'
  | 'chainType'
  | 'length'
  | 'itemYear'
  | 'location'
  | 'priceMode'
  | 'priceLabel'
  | 'purity'
  | 'weight'
  | 'gender'
  | 'multiplier'
  | 'description'
  | 'descriptionEs'
  | 'publicNotes'
  | 'publicNotesEs';

const QUICK_FILL_FORM_ORDER: QuickFillField[] = [
  'title',
  'titleEs',
  'productType',
  'brand',
  'metalType',
  'category',
  'purity',
  'weight',
  'chainType',
  'length',
  'itemYear',
  'priceMode',
  'multiplier',
  'priceLabel',
  'location',
  'status',
  'gender',
  'description',
  'descriptionEs',
  'publicNotes',
  'publicNotesEs',
];

// The assistant's short "not filled / unsure" lines, plus the one Undo. There is
// no accept/keep review step any more — the fields go straight into the form and
// the admin clears anything wrong, then re-runs with the correction (2026-09-09).
function AiNotes({
  notes,
  canUndo,
  onUndo,
}: {
  notes: string[];
  canUndo: boolean;
  onUndo: () => void;
}) {
  if (notes.length === 0 && !canUndo) return null;

  return (
    <div
      className="grid gap-2 border p-3 text-xs leading-relaxed"
      style={{ borderColor: 'var(--color-outline-variant)', background: 'rgba(255,255,255,0.62)', color: 'var(--color-on-surface)' }}
    >
      {notes.length > 0 && (
        <ul className="grid list-disc gap-1 pl-4" aria-label="Assistant notes">
          {notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
      {canUndo && (
        <div className="flex justify-end">
          <button type="button" onClick={onUndo} className="outline-button text-xs">
            Undo AI Fill
          </button>
        </div>
      )}
    </div>
  );
}

const PRODUCT_TABLE_COLUMNS: { label: string; sortKey: SortKey | null; widthClass?: string; responsiveClass?: string }[] = [
  { label: 'Inv #', sortKey: 'inventoryNumber', widthClass: 'w-[54px] min-w-[54px] max-w-[54px]' },
  { label: 'Image', sortKey: 'image', widthClass: 'w-16 min-w-16 max-w-16' },
  { label: 'Title', sortKey: 'title', widthClass: 'w-[210px] min-w-[210px] max-w-[210px] max-md:w-[160px] max-md:min-w-[160px] max-md:max-w-[160px]' },
  { label: 'Brand', sortKey: 'brand', widthClass: 'w-[92px]' },
  { label: 'Metal Color', sortKey: 'metalVariant', widthClass: 'w-[104px]' },
  { label: 'Type', sortKey: 'jewelryType', widthClass: 'w-[78px]' },
  { label: 'Link Type', sortKey: 'chainType', widthClass: 'w-[118px]', responsiveClass: 'hidden 2xl:table-cell' },
  { label: 'Size', sortKey: 'length', widthClass: 'w-[72px]' },
  { label: 'Date', sortKey: 'itemYear', widthClass: 'w-[92px]' },
  { label: 'Featured', sortKey: 'featured', widthClass: 'w-[72px]' },
  { label: 'Purity', sortKey: 'purity', widthClass: 'w-[64px]' },
  { label: 'Weight', sortKey: 'weight', widthClass: 'w-[76px]' },
  { label: 'Melt', sortKey: 'melt', widthClass: 'w-[84px]' },
  { label: 'Mode', sortKey: 'mode', widthClass: 'w-[94px]' },
  { label: 'Price', sortKey: 'currentPrice', widthClass: 'w-[92px]' },
  // Site shop "Make an Offer" (2026-10-15): On / – plus the open offers waiting.
  { label: 'Offers', sortKey: 'offers', widthClass: 'w-[96px]' },
  { label: 'Status', sortKey: 'status', widthClass: 'w-[92px]' },
  { label: 'Qty', sortKey: 'quantity', widthClass: 'w-[56px]' },
  { label: 'Etsy', sortKey: null, widthClass: 'w-[110px]' },
  { label: 'eBay', sortKey: null, widthClass: 'w-[110px]' },
  { label: '', sortKey: null, widthClass: 'w-[44px]', responsiveClass: 'max-md:w-[28px] max-md:min-w-[28px] max-md:max-w-[28px]' },
];

const PRODUCT_TABLE_FROZEN_LEFT_CLASSES: Record<string, string> = {
  'Inv #': 'left-[52px] max-md:left-[36px]',
  Image: 'left-[106px] max-md:left-[90px]',
  Title: 'left-[170px] max-md:left-[154px]',
};

// "Out of date" read as a fault and got confused with price-push health, which
// it has nothing to do with (see lib/marketplace-price-chip.ts). "Content stale"
// says what actually drifted — title/description/policies/images — and sits next
// to the separate price chip without either being mistaken for the other.
const ETSY_CHIP_LABELS: Record<string, string> = {
  pending: 'Not listed',
  draft_created: 'Draft',
  images_synced: 'Draft',
  inventory_synced: 'Draft',
  draft_review: 'Needs review',
  active: 'Active',
  out_of_date: 'Content stale',
  delisted: 'Delisted',
  error: 'Error',
};

function etsyChipTone(state: string | undefined): { bg: string; fg: string } {
  if (state === 'error') return { bg: 'color-mix(in srgb, var(--color-error) 14%, transparent)', fg: 'var(--color-error)' };
  if (state === 'active') return { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', fg: 'var(--color-primary)' };
  if (state === 'out_of_date' || state === 'draft_review') return { bg: 'color-mix(in srgb, #b8860b 16%, transparent)', fg: '#8a6400' };
  return { bg: 'var(--color-surface-container)', fg: 'var(--color-on-surface-variant)' };
}

const EBAY_CHIP_LABELS: Record<string, string> = {
  pending: 'Not listed',
  item_synced: 'Preparing…',
  offer_created: 'Preparing…',
  review: 'Ready to publish',
  published: 'Live',
  out_of_date: 'Content stale',
  hidden_oos: 'Hidden (sold)',
  ended: 'Ended',
  error: 'Error',
};

/**
 * What the product table needs from an `etsy_listings` / `ebay_listings` row:
 * the state for the freshness chip, plus the price-push counters for the chip
 * beside it. Both providers' rows are structurally compatible.
 */
type MarketplaceChipRow = PriceChipInput & {
  sync_state: string;
  /** eBay only: the item allows Best Offer (from /api/admin/ebay/listings) → "Live + Offer". */
  best_offer?: boolean;
};

/**
 * Second, independent chip: did the money actually move?
 *
 * Renders NOTHING on the happy path — see resolvePriceChip. The marketplace
 * columns already carry a status chip per row across 131 rows, and a permanent
 * green "priced OK" would spend attention without earning it. A price chip being
 * present at all is the signal.
 */
function MarketplacePriceChip({ listing }: { listing: PriceChipInput | undefined }) {
  const chip = resolvePriceChip(listing);
  if (!chip) return null;
  return (
    <span
      className="mt-1 inline-flex text-[0.6rem] font-bold uppercase tracking-widest px-2 py-0.5"
      style={{ background: chip.bg, color: chip.fg }}
      title={chip.tooltip}
    >
      {chip.label}
    </span>
  );
}

function ebayChipTone(state: string | undefined): { bg: string; fg: string } {
  if (state === 'error') return { bg: 'color-mix(in srgb, var(--color-error) 14%, transparent)', fg: 'var(--color-error)' };
  if (state === 'published') return { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', fg: 'var(--color-primary)' };
  if (state === 'out_of_date' || state === 'review' || state === 'item_synced' || state === 'offer_created') {
    return { bg: 'color-mix(in srgb, #b8860b 16%, transparent)', fg: '#8a6400' };
  }
  return { bg: 'var(--color-surface-container)', fg: 'var(--color-on-surface-variant)' };
}

const INSTAGRAM_CHIP_LABELS: Record<string, string> = {
  pending: 'Not posted',
  review: 'Ready to post',
  publishing: 'Posting…',
  published: 'Posted',
  out_of_date: 'Out of date',
  deleted: 'Removed',
  error: 'Error',
};

function instagramChipTone(state: string | undefined): { bg: string; fg: string } {
  if (state === 'error') return { bg: 'color-mix(in srgb, var(--color-error) 14%, transparent)', fg: 'var(--color-error)' };
  if (state === 'published') return { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', fg: 'var(--color-primary)' };
  if (state === 'out_of_date' || state === 'review' || state === 'publishing') {
    return { bg: 'color-mix(in srgb, #b8860b 16%, transparent)', fg: '#8a6400' };
  }
  return { bg: 'var(--color-surface-container)', fg: 'var(--color-on-surface-variant)' };
}

// Facebook shares Instagram's state vocabulary, so its chips reuse the same
// labels and tones under channel-specific names for readability at call sites.
const FACEBOOK_CHIP_LABELS = INSTAGRAM_CHIP_LABELS;
const facebookChipTone = instagramChipTone;

// Shared styling for a single item inside the row Actions dropdown menu.
const ROW_ACTION_MENU_ITEM_CLASS = 'px-3 py-2 text-left text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors hover:bg-[var(--color-surface-container)]';
const PRODUCT_ACTION_BUTTON_CLASS = 'inline-flex items-center justify-center gap-1.5 border px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-[var(--color-surface-container)] disabled:cursor-not-allowed disabled:opacity-60';

function getMasterProductOrder(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const statusCompared = getStatusRank(a.status) - getStatusRank(b.status);
    if (statusCompared) return statusCompared;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

function emptyProduct(): Omit<Product, 'created_at' | 'updated_at'> {
  return {
    id: '',
    category: 'Gold',
    metal_type: '',
    metal_variant: '',
    title: '',
    title_es: '',
    price_label: null,
    manual_price_label: null,
    price_mode: 'spot-multiplier',
    purity: null,
    weight_grams: null,
    inventory_number: null,
    sku: null,
    slug: null,
    metal: '',
    gram_weight: null,
    stone_details: null,
    brand: null,
    product_type: '',
    jewelry_type: '',
    chain_type: null,
    length: null,
    width_mm: null,
    pricing_multiplier: null,
    sold_price: null,
    show_spot_price: true,
    special_price_override_enabled: false,
    special_price_override_amount: null,
    special_price_override_mode: 'amount',
    special_price_override_percent: null,
    quantity: 1,
    status: 'available',
    location: 'showcase',
    images: [],
    image_urls: [],
    // New listings default to white side padding; the admin can change it
    // per-photo (or product-wide) from the image padding chooser.
    image_padding: 'white',
    image_padding_by_image: {},
    description: '',
    description_es: '',
    details: [],
    details_es: [],
    tags: [],
    tags_es: [],
    private_price_label: null,
    gender: '',
    item_year: null,
    cost_basis: null,
    melt_value: null,
    asking_price: null,
    minimum_price: null,
    live_spot_snapshot: null,
    acquisition_date: null,
    acquisition_source: null,
    internal_notes: null,
    public_notes: null,
    public_notes_es: null,
    featured: false,
    accepts_offers: false,
    sort_order: 0,
  };
}

function getCurrentAiListingFields(
  product: ReturnType<typeof emptyProduct>,
  productType: string,
  chainType: string,
  length: string,
): ProductAutofillFields {
  const gender = product.gender === 'Unisex' || product.gender === 'Men' || product.gender === 'Women'
    ? product.gender
    : null;
  const metalType = product.metal_type
    ? normalizeProductMetalType(product.metal_type, product.category)
    : null;
  const metalVariant = product.metal_variant
    ? normalizeProductMetalVariant(product.metal_variant, product.category)
    : null;

  return {
    title: product.title.trim() || null,
    product_type: productType.trim() || null,
    brand: product.brand?.trim() || null,
    metal_type: metalType,
    metal_variant: metalVariant,
    gender,
    chain_type: productSupportsLinkType(productType) ? chainType.trim() || null : null,
    length: normalizeProductLengthSizeValue(length) || null,
    width_mm: productSupportsLinkType(productType) ? normalizeProductWidthMm(product.width_mm) : null,
    price_mode: product.price_mode === 'manual' ? 'manual' : 'spot-multiplier',
    purity: product.purity,
    weight_grams: product.weight_grams,
    item_year: normalizeProductItemYear(product.item_year),
    pricing_multiplier: product.pricing_multiplier,
    asking_price: product.asking_price,
    manual_price_label: product.manual_price_label?.trim() || null,
    show_spot_price: product.show_spot_price,
    quantity: normalizeProductQuantity(product.quantity),
    description: product.description?.trim() || null,
    public_notes: product.public_notes?.trim() || null,
    accepts_offers: product.accepts_offers === true,
  };
}

function parseDisplayPrice(value: string): number | null {
  const numeric = Number(value.replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatAdminTableTotal(total: number, count: number): string {
  return count > 0 ? formatUsdPrice(total) : '-';
}

function getSortValue(
  product: Product,
  key: SortKey,
  spotData: SpotData | null,
  inventoryNumbers: Map<string, number>,
): string | number | null {
  switch (key) {
    case 'inventoryNumber':
      return product.inventory_number || inventoryNumbers.get(product.id) || null;
    case 'image':
      return getProductImages(product)[0] ? 1 : 0;
    case 'title':
      return product.title;
    case 'brand':
      return product.brand ?? '';
    case 'category':
      return productMetalTypeLabel(product.metal_type, product.category);
    case 'metalVariant':
      return productMetalVariantLabel(product.metal_variant, product.category);
    case 'gender':
      return product.gender ?? 'Unisex';
    case 'jewelryType':
      return productJewelryTypeLabel(getProductJewelryType(product));
    case 'chainType':
      return getProductLinkType(product);
    case 'length':
      return getProductLength(product);
    case 'itemYear':
      return product.item_year != null ? String(product.item_year) : '';
    case 'location':
      return product.location ?? 'showcase';
    case 'featured':
      return product.featured ? 1 : 0;
    case 'offers':
      return product.accepts_offers ? 1 : 0;
    case 'purity':
      return product.purity;
    case 'weight':
      return getProductWeight(product);
    case 'melt':
      return calcSpotMeltValue(product, spotData);
    case 'mode':
      return product.price_mode === 'manual' ? 'Manual' : `Spot ${product.pricing_multiplier ?? ''}`;
    case 'currentPrice':
      return parseDisplayPrice(getDisplayPrice(product, spotData));
    case 'status':
      return getStatusLabel(product.status);
    case 'quantity':
      return normalizeProductQuantity(product.quantity);
  }
}

function compareSortValues(a: string | number | null, b: string | number | null): number {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1;
  if (b == null || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function foldExtraDetailsIntoInternalNotes(product: ReturnType<typeof emptyProduct>): string | null {
  const currentNotes = product.internal_notes?.trim() ?? '';
  const extraDetails = [...(product.details ?? []), ...(product.details_es ?? [])]
    .map((detail) => detail.trim())
    .filter(Boolean);

  if (extraDetails.length === 0) return currentNotes || null;

  const extraBlock = ['Former extra notes:', ...extraDetails.map((detail) => `- ${detail}`)].join('\n');
  if (currentNotes.includes(extraBlock)) return currentNotes;
  return [currentNotes, extraBlock].filter(Boolean).join('\n\n');
}

function splitQuickFillColumns(line: string, keepEmpty = false): string[] {
  const columns: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];
    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      const value = current.trim();
      if (keepEmpty || value) columns.push(value);
      current = '';
      continue;
    }
    current += char;
  }

  const value = current.trim();
  if (keepEmpty || value) columns.push(value);
  return columns;
}

function normalizeQuickFillFieldName(value: string): QuickFillField | null {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (['title', 'title english', 'title en', 'english title', 'title (english)'].includes(normalized)) return 'title';
  if (['title spanish', 'title es', 'spanish title', 'title (spanish)'].includes(normalized)) return 'titleEs';
  if (
    normalized === 'brand' ||
    normalized === 'brand name' ||
    normalized === 'maker' ||
    normalized === 'maker name' ||
    normalized === 'designer' ||
    normalized === 'designer name' ||
    normalized === 'manufacturer' ||
    normalized === 'manufacturer name'
  ) return 'brand';
  if (normalized === 'product type' || normalized === 'item type' || normalized === 'jewelry type') return 'productType';
  if (normalized === 'metal type' || normalized === 'material' || normalized === 'primary metal') return 'metalType';
  if (normalized === 'category' || normalized === 'metal') return 'category';
  if (normalized === 'metal color' || normalized === 'gold color' || normalized === 'silver color' || normalized === 'metal subtype' || normalized === 'metal variant' || normalized === 'gold type' || normalized === 'silver type') return 'metalVariant';
  if (normalized === 'status') return 'status';
  if (normalized === 'link type' || normalized === 'chain type' || normalized === 'chain' || normalized === 'link style' || normalized === 'type') return 'chainType';
  if (normalized === 'length' || normalized === 'size' || normalized === 'ring size') return 'length';
  if (normalized === 'year' || normalized === 'year made' || normalized === 'date made' || normalized === 'made' || normalized === 'circa' || normalized === 'date' || normalized === 'item year' || normalized === 'item date') return 'itemYear';
  if (normalized === 'location') return 'location';
  if (normalized === 'price mode' || normalized === 'pricing mode' || normalized === 'mode') return 'priceMode';
  if (
    normalized === 'asking price' ||
    normalized === 'ask price' ||
    normalized === 'price' ||
    normalized === 'manual price' ||
    normalized === 'price label' ||
    normalized === 'manual price label'
  ) return 'priceLabel';
  if (normalized === 'purity' || normalized === 'karat' || normalized === 'karats') return 'purity';
  if (normalized === 'weight' || normalized === 'weight g' || normalized === 'grams' || normalized === 'gram weight') return 'weight';
  if (normalized === 'gender') return 'gender';
  if (normalized === 'multiplier' || normalized === 'pricing multiplier') return 'multiplier';
  if (['description', 'description english', 'description en', 'description (en)', 'description (english)', 'english description'].includes(normalized)) return 'description';
  if (['description spanish', 'description es', 'description (es)', 'description (spanish)', 'spanish description'].includes(normalized)) return 'descriptionEs';
  if (normalized === 'public notes' || normalized === 'public note' || normalized === 'notes en' || normalized === 'notes english' || normalized === 'notes (en)' || normalized === 'english notes') return 'publicNotes';
  if (normalized === 'notes es' || normalized === 'notes spanish' || normalized === 'spanish notes' || normalized === 'notes (es)' || normalized === 'public notes es' || normalized === 'public notes spanish') return 'publicNotesEs';
  return null;
}

function getQuickFillTokens(input: string): string[] {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const headers = splitQuickFillColumns(lines[0]);
    const fields = headers.map(normalizeQuickFillFieldName);
    if (fields.length > 0 && fields.every(Boolean)) {
      const values = splitQuickFillColumns(lines[1], true);
      return values
        .map((value, index) => fields[index] ? `${headers[index]}:${value}` : value)
        .filter(Boolean);
    }
  }

  return splitQuickFillColumns(input.replace(/\r?\n/g, ','), false)
    .map((token) => token.trim())
    .filter((token) => token && !/^\.+$/.test(token));
}

function getQuickFillFormOrderTokens(input: string): string[] {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const row = lines.length >= 2 ? lines[1] : lines.join(' ');
  return splitQuickFillColumns(row, true).map((token) => token.trim());
}

export default function AdminShell({ initialProducts, userEmail, spotData, locale, unreadMessagesCount }: Props) {
  const router = useRouter();
  const adminBasePath = locale === 'es' ? '/es/admin' : '/admin';
  const [products, setProducts] = useState<Product[]>(initialProducts);
  // Site offers (2026-10-15): open offers per product for the table's "N open",
  // and which products have "Accept offers" on. The flags come from the offers
  // route rather than the summary query, so the table loads the same before
  // supabase/make-offer-2026-10.sql has run.
  const [openOffersByProduct, setOpenOffersByProduct] = useState<Record<string, number>>({});
  const refreshOfferCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/offers?counts=1');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return;
      setOpenOffersByProduct((data.byProduct ?? {}) as Record<string, number>);
      if (Array.isArray(data.acceptsOffers)) {
        const on = new Set((data.acceptsOffers as unknown[]).map(String));
        setProducts((current) => current.map((product) => (
          (product.accepts_offers === true) === on.has(product.id) ? product : { ...product, accepts_offers: on.has(product.id) }
        )));
      }
    } catch {
      // Best-effort - the column just shows what it last knew.
    }
  }, []);
  useEffect(() => {
    const run = async () => { await refreshOfferCounts(); };
    void run();
  }, [refreshOfferCounts]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ReturnType<typeof emptyProduct> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [productActionTarget, setProductActionTarget] = useState<Product | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [showMobileProductTable, setShowMobileProductTable] = useState(false);
  const mobileProductTableRef = useRef<HTMLDivElement>(null);
  const mobileProductTableLauncherRef = useRef<HTMLButtonElement>(null);
  const mobileProductTableCloseRef = useRef<HTMLButtonElement>(null);
  const restoreMobileProductTableFocusRef = useRef(false);
  // Fixed-viewport coordinates for the open row action menu. The menu renders as
  // position: fixed (escaping the table's overflow-x-auto clip) and flips above
  // the trigger when there isn't enough room below, so bottom rows stay usable.
  const [actionMenuPos, setActionMenuPos] = useState<
    { right: number; top?: number; bottom?: number; maxHeight: number } | null
  >(null);

  const toggleActionMenu = useCallback((id: string, trigger: HTMLElement) => {
    setActionMenuId((current) => {
      if (current === id) {
        setActionMenuPos(null);
        return null;
      }
      const rect = trigger.getBoundingClientRect();
      const gap = 4;
      const margin = 8;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, (openUp ? spaceAbove : spaceBelow) - gap);
      const right = Math.max(margin, window.innerWidth - rect.right);
      setActionMenuPos(
        openUp
          ? { right, bottom: window.innerHeight - rect.top + gap, maxHeight }
          : { right, top: rect.bottom + gap, maxHeight },
      );
      return id;
    });
  }, []);

  const closeActionMenu = useCallback(() => {
    setActionMenuId(null);
    setActionMenuPos(null);
  }, []);

  const openProductActions = useCallback((product: Product) => {
    closeActionMenu();
    setShowMobileProductTable(false);
    setProductActionTarget(product);
  }, [closeActionMenu]);

  const handleProductRowClick = (event: React.MouseEvent<HTMLTableRowElement>, product: Product) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('a, button, input, select, textarea, summary, [role="button"], [role="menuitem"], [data-product-drag-handle]')) {
      return;
    }
    openProductActions(product);
  };

  // The action menu is anchored to the trigger's viewport position, so close it
  // if the user scrolls (incl. the table's horizontal scroll) or resizes.
  useEffect(() => {
    if (!actionMenuId) return;
    const close = () => { closeActionMenu(); };
    window.addEventListener('scroll', close, true);
    // Guarded so an in-app browser's toolbar sliding away does not count as a
    // resize. Scrolling already closes the menu via the listener above; without
    // this, the height change would close it a second time on every scroll.
    const stopResize = onLayoutAffectingResize(close);
    return () => {
      window.removeEventListener('scroll', close, true);
      stopResize();
    };
  }, [actionMenuId, closeActionMenu]);

  useEffect(() => {
    if (!showMobileProductTable) return;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    const previousOverscroll = style.overscrollBehavior;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        restoreMobileProductTableFocusRef.current = true;
        setShowMobileProductTable(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(mobileProductTableRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const desktopQuery = window.matchMedia('(min-width: 768px)');
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setShowMobileProductTable(false);
    };
    const focusFrame = window.requestAnimationFrame(() => mobileProductTableCloseRef.current?.focus());

    style.overflow = 'hidden';
    style.overscrollBehavior = 'none';
    window.addEventListener('keydown', closeOnEscape);
    desktopQuery.addEventListener('change', closeAtDesktop);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      style.overflow = previousOverflow;
      style.overscrollBehavior = previousOverscroll;
      window.removeEventListener('keydown', closeOnEscape);
      desktopQuery.removeEventListener('change', closeAtDesktop);
    };
  }, [showMobileProductTable]);

  useEffect(() => {
    if (showMobileProductTable || !restoreMobileProductTableFocusRef.current) return;
    restoreMobileProductTableFocusRef.current = false;
    const focusTimer = window.setTimeout(() => {
      mobileProductTableLauncherRef.current?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(focusTimer);
  }, [showMobileProductTable]);

  // Confirmation gate for the listing editor's close/cancel/save actions.
  const [editorConfirm, setEditorConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  // Mobile-only collapse state for the editor's blocks (no effect on desktop).
  // Phone-only ⋯ sheet on the editor's action row (option B, 2026-09-02).
  const [editorMoreOpen, setEditorMoreOpen] = useState(false);

  // Option C (owner, 2026-09-02, after reviewing option B on the phone): the
  // compact action row ducks while the form scrolls down and returns on the
  // way up. It is IN FLOW and collapses (globals.css), so hiding it GROWS the
  // scroll area — which is exactly why the first attempt "never came back":
  // with every accordion collapsed the grown area fit the content, no scroll
  // event could fire again, and scroll events were the only show trigger.
  // This version therefore shows the row on ANY of: scroll up · at the top ·
  // a finger dragging downward over the form (native touch, works even when
  // nothing is scrollable) · 1.2s after a hide that left nothing to scroll ·
  // opening the ⋯ sheet. Events within 300ms of a toggle are ignored because
  // the browser re-clamps scrollTop when the area changes and emits a scroll.
  // Phones only: the handler no-ops at ≥ 768px, where the CSS never collapses.
  const [editorRowHidden, setEditorRowHidden] = useState(false);
  const editorRowHiddenRef = useRef(false);
  const editorBodyRef = useRef<HTMLDivElement>(null);
  const editorScrollLastY = useRef(0);
  const editorRowToggledAt = useRef(0);
  const editorRowIdleTimer = useRef(0);
  const setEditorRowHiddenSafe = useCallback((hidden: boolean) => {
    if (editorRowHiddenRef.current === hidden) return;
    if (hidden) {
      // Never hide when hiding would leave nothing to scroll: the dock's own
      // height joins the scroll area, and a form that then FITS has no way to
      // ask for the dock back except the idle timer below — which the owner
      // saw as "hides for a moment and then pops back up" (2026-09-02). The
      // dock only ducks when there is at least its own height of content
      // still below the fold, so ducking always reveals something.
      const body = editorBodyRef.current;
      const dockHeight = Array.from(
        body?.parentElement?.querySelectorAll<HTMLElement>('.product-editor-dock') ?? [],
      ).reduce((sum, el) => sum + el.offsetHeight, 0);
      // REMAINING room below the current position — not the total range. With
      // the total range the dock hid while the user sat at the bottom, the
      // grown area re-clamped scrollTop, and that clamp arrived as an "up"
      // scroll that showed the dock again: "starts to hide then pops right
      // back up" (owner, 2026-09-02, second report).
      const remaining = body ? body.scrollHeight - body.clientHeight - body.scrollTop : 0;
      if (!body || remaining <= dockHeight + 24) return;
    }
    editorRowHiddenRef.current = hidden;
    editorRowToggledAt.current = performance.now();
    setEditorRowHidden(hidden);
    window.clearTimeout(editorRowIdleTimer.current);
    if (hidden) {
      // If hiding left nothing to scroll, no scroll event can ever bring the
      // row back — so bring it back on its own after a moment.
      editorRowIdleTimer.current = window.setTimeout(() => {
        const body = editorBodyRef.current;
        if (body && body.scrollHeight <= body.clientHeight + 2) {
          editorRowHiddenRef.current = false;
          editorRowToggledAt.current = performance.now();
          setEditorRowHidden(false);
        }
      }, 1200);
    }
  }, []);
  const handleEditorBodyScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    const el = event.currentTarget;
    const y = el.scrollTop;
    const maxY = el.scrollHeight - el.clientHeight;
    // 450ms > the 220ms collapse transition plus the layout/scroll events it
    // emits while the area is still changing size.
    if (performance.now() - editorRowToggledAt.current < 450) {
      editorScrollLastY.current = Math.min(Math.max(y, 0), maxY);
      return;
    }
    // iOS rubber-bands past the bottom and springs back: that spring-back is
    // a NEGATIVE delta that is not the user scrolling up. Anything at or past
    // the bottom is treated as "no movement".
    if (y >= maxY - 1) {
      editorScrollLastY.current = maxY;
      return;
    }
    const delta = y - editorScrollLastY.current;
    if (y <= 0) setEditorRowHiddenSafe(false);
    else if (delta > 12) setEditorRowHiddenSafe(true);
    else if (delta < -4) setEditorRowHiddenSafe(false);
    if (Math.abs(delta) > 4) editorScrollLastY.current = y;
  }, [setEditorRowHiddenSafe]);
  const editorOpenForRow = Boolean(editing);
  useEffect(() => {
    if (!editorOpenForRow) return;
    const body = editorBodyRef.current;
    if (!body) return;
    let startY: number | null = null;
    const onTouchStart = (event: TouchEvent) => { startY = event.touches[0]?.clientY ?? null; };
    const onTouchMove = (event: TouchEvent) => {
      if (startY === null) return;
      const dy = (event.touches[0]?.clientY ?? startY) - startY;
      // Finger moving DOWN the screen = the user wants to go back up → show.
      if (dy > 24 && editorRowHiddenRef.current) { startY = null; setEditorRowHiddenSafe(false); }
      // Finger moving UP = reading onward → hide (the setter refuses when the
      // form is too short to reveal anything). This is what lets the dock duck
      // when the body is already at its bottom and no scroll event can fire.
      else if (dy < -24 && !editorRowHiddenRef.current) { startY = null; setEditorRowHiddenSafe(true); }
    };
    body.addEventListener('touchstart', onTouchStart, { passive: true });
    body.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      body.removeEventListener('touchstart', onTouchStart);
      body.removeEventListener('touchmove', onTouchMove);
      window.clearTimeout(editorRowIdleTimer.current);
      editorRowHiddenRef.current = false;
      editorScrollLastY.current = 0;
      setEditorRowHidden(false);
    };
  }, [editorOpenForRow, setEditorRowHiddenSafe]);
  const [openEditorSections, setOpenEditorSections] = useState<{ photos: boolean; video: boolean; ai: boolean; details: boolean; etsy: boolean; ebay: boolean; instagram: boolean; facebook: boolean }>({
    photos: false,
    video: false,
    ai: false,
    details: false,
    etsy: false,
    ebay: false,
    instagram: false,
    facebook: false,
  });
  const toggleEditorSection = (key: 'photos' | 'video' | 'ai' | 'details' | 'etsy' | 'ebay' | 'instagram' | 'facebook') =>
    setOpenEditorSections((current) => ({ ...current, [key]: !current[key] }));
  // Bulk map for the product table's per-row Etsy status chip — best-effort,
  // fetched once on mount; an empty map (pre-migration or not-yet-synced) just
  // renders every row as "Not listed".
  // `error_count`/`last_error` feed the separate price chip. The route already
  // returns the whole row (`select('*')`), so this only widens the local type —
  // no API change.
  const [etsyListingsByProduct, setEtsyListingsByProduct] = useState<Record<string, MarketplaceChipRow>>({});
  const [showEtsyBulkModal, setShowEtsyBulkModal] = useState(false);
  const [showEtsyPublishModal, setShowEtsyPublishModal] = useState(false);
  const [showEtsyRepairModal, setShowEtsyRepairModal] = useState(false);
  const [selectedProductIdSet, setSelectedProductIdSet] = useState<Set<string>>(() => new Set());
  const [showSelectedActionsModal, setShowSelectedActionsModal] = useState(false);
  const [selectedBulkRun, setSelectedBulkRun] = useState<SelectedMarketplaceAction | null>(null);
  const [selectedStatusCheck, setSelectedStatusCheck] = useState<Marketplace | null>(null);
  const [selectedStatusPostTarget, setSelectedStatusPostTarget] = useState<{ productId: string; marketplace: 'etsy' | 'ebay' } | null>(null);
  // A single local DB read (no Etsy API call). Fetched once on mount, then
  // re-run after any action that can change a listing's state (bulk sync, or a
  // per-item sync/status/price action in the drawer) so the row chips don't go
  // stale. No setState before the first await keeps react-hooks happy.
  const refreshEtsyChips = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/etsy/listings');
      const data = await res.json().catch(() => null);
      if (res.ok && data?.listings) setEtsyListingsByProduct(data.listings);
    } catch {
      // Best-effort — the chip simply keeps its last-known state.
    }
  }, []);
  useEffect(() => {
    const run = async () => { await refreshEtsyChips(); };
    void run();
  }, [refreshEtsyChips]);
  // eBay twin of the Etsy chip map above — same one-fetch-for-the-whole-table
  // pattern (never one call per row).
  const [ebayListingsByProduct, setEbayListingsByProduct] = useState<Record<string, MarketplaceChipRow>>({});
  const [showEbayBulkModal, setShowEbayBulkModal] = useState(false);
  const [showEbayPublishModal, setShowEbayPublishModal] = useState(false);
  // Bulk eBay Best Offer for the selected items: true = on, false = off, null = closed.
  const [ebayBestOfferBulk, setEbayBestOfferBulk] = useState<boolean | null>(null);
  const refreshEbayChips = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ebay/listings');
      const data = await res.json().catch(() => null);
      if (res.ok && data?.listings) setEbayListingsByProduct(data.listings);
    } catch {
      // Best-effort — the chip simply keeps its last-known state.
    }
  }, []);
  useEffect(() => {
    const run = async () => { await refreshEbayChips(); };
    void run();
  }, [refreshEbayChips]);
  // Instagram twin of the two chip maps above. Its route returns an array of
  // posts rather than a keyed object, so it is reduced to the same shape here.
  const [instagramPostsByProduct, setInstagramPostsByProduct] = useState<Record<string, { sync_state: string }>>({});
  const refreshInstagramChips = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/instagram/posts');
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.posts)) {
        const map: Record<string, { sync_state: string }> = {};
        for (const post of data.posts as Array<{ productId: string; syncState: string }>) {
          map[post.productId] = { sync_state: post.syncState };
        }
        setInstagramPostsByProduct(map);
      }
    } catch {
      // Best-effort — the chip simply keeps its last-known state.
    }
  }, []);
  useEffect(() => {
    const run = async () => { await refreshInstagramChips(); };
    void run();
  }, [refreshInstagramChips]);
  // Facebook twin, same array-to-map reduction as Instagram's.
  const [facebookPostsByProduct, setFacebookPostsByProduct] = useState<Record<string, { sync_state: string }>>({});
  const refreshFacebookChips = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/facebook/posts');
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.posts)) {
        const map: Record<string, { sync_state: string }> = {};
        for (const post of data.posts as Array<{ productId: string; syncState: string }>) {
          map[post.productId] = { sync_state: post.syncState };
        }
        setFacebookPostsByProduct(map);
      }
    } catch {
      // Best-effort — the chip simply keeps its last-known state.
    }
  }, []);
  useEffect(() => {
    const run = async () => { await refreshFacebookChips(); };
    void run();
  }, [refreshFacebookChips]);
  // Heads-up dialog shown before the Smart Assistant starts listening.
  const [showMicPrompt, setShowMicPrompt] = useState(false);
  const [imagePaddingTarget, setImagePaddingTarget] = useState<Product | null>(null);
  const [imagePaddingTargetIndex, setImagePaddingTargetIndex] = useState(0);
  const imagePaddingTargetIndexRef = useRef(0);
  const [imagePaddingCustomColor, setImagePaddingCustomColor] = useState('#ffffff');
  const [imagePaddingNotice, setImagePaddingNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [filterStatus, setFilterStatus] = useState('available');
  const [filterMetal, setFilterMetal] = useState('');
  const [filterMetalVariant, setFilterMetalVariant] = useState('');
  const [filterPurity, setFilterPurity] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterJewelryType, setFilterJewelryType] = useState('');
  const [filterChainType, setFilterChainType] = useState('');
  const [filterLength, setFilterLength] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterFeatured, setFilterFeatured] = useState('');
  const [showTableFilters, setShowTableFilters] = useState(false);
  // Inside the filters panel only Status shows by default; the rest sit behind
  // a "More" toggle (owner request 2026-08-04).
  const [showMoreTableFilters, setShowMoreTableFilters] = useState(false);
  const originalRef = useRef<ReturnType<typeof emptyProduct> | null>(null);
  const productVideoEditorRef = useRef<ProductVideoEditorHandle>(null);
  const [uploading, setUploading] = useState(false);
  const [sessionUploadedImageUrls, setSessionUploadedImageUrls] = useState<Set<string>>(() => new Set());
  const [dragOver, setDragOver] = useState(false);
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [previewImg, setPreviewImg] = useState<ImageTarget | null>(null);
  const [cropTarget, setCropTarget] = useState<ImageTarget | null>(null);
  const [cropRect, setCropRect] = useState<CropRect>(FULL_IMAGE_CROP);
  const [cropping, setCropping] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const [dragTargetProductId, setDragTargetProductId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [chainTypeInput, setChainTypeInput] = useState('');
  const [jewelryTypeInput, setJewelryTypeInput] = useState('Necklace');
  const [lengthInput, setLengthInput] = useState('');
  const [quickEntry, setQuickEntry] = useState('');
  const [quickFillPrompt, setQuickFillPrompt] = useState(DEFAULT_QUICK_FILL_AI_FORMAT_PROMPT);
  const [quickFillNotice, setQuickFillNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const quickFillNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickFillPromptTextRef = useRef<HTMLTextAreaElement | null>(null);
  const [showQuickFillPrompt, setShowQuickFillPrompt] = useState(false);
  const [aiTranscript, setAiTranscript] = useState('');
  const [aiInterimText, setAiInterimText] = useState('');
  // What the admin typed/spoke on earlier passes for this item (oldest first).
  const [aiPriorInputs, setAiPriorInputs] = useState<string[]>([]);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiRecording, setAiRecording] = useState(false);
  const aiRecordingRef = useRef(false);
  const aiRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [aiNotice, setAiNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [aiUndoSnapshot, setAiUndoSnapshot] = useState<{
    editing: ReturnType<typeof emptyProduct>;
    jewelryTypeInput: string;
    chainTypeInput: string;
    lengthInput: string;
  } | null>(null);
  const [showAdvancedIds, setShowAdvancedIds] = useState(false);
  const [inventoryNumberManual, setInventoryNumberManual] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [translatingSpanish, setTranslatingSpanish] = useState(false);
  const [spanishTranslationNotice, setSpanishTranslationNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const spanishTranslationRequestRef = useRef(0);

  function resetSpanishTranslation() {
    spanishTranslationRequestRef.current += 1;
    setTranslatingSpanish(false);
    setSpanishTranslationNotice(null);
  }

  // --- Editor undo history -------------------------------------------------
  // Snapshots of the editable state (editing + the derived type/link/length
  // inputs that live outside `editing`), captured as the user edits. Rapid
  // changes within a short window coalesce into a single undo step so typing
  // doesn't produce one step per keystroke.
  type EditorUndoSnapshot = {
    editing: ReturnType<typeof emptyProduct>;
    jewelryTypeInput: string;
    chainTypeInput: string;
    lengthInput: string;
  };
  const undoStackRef = useRef<EditorUndoSnapshot[]>([]);
  const lastEditorSnapshotRef = useRef<EditorUndoSnapshot | null>(null);
  const lastUndoCaptureAtRef = useRef(0);
  const skipUndoCaptureRef = useRef(false);
  const [canUndoEdit, setCanUndoEdit] = useState(false);

  useEffect(() => {
    if (!editing) {
      undoStackRef.current = [];
      lastEditorSnapshotRef.current = null;
      lastUndoCaptureAtRef.current = 0;
      // Reset the (rendered) undo-availability flag when the editor closes. This
      // effect synchronizes derived undo state with the editor inputs, so the
      // set-state-in-effect flag is a false positive.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanUndoEdit(false);
      return;
    }
    const current: EditorUndoSnapshot = { editing, jewelryTypeInput, chainTypeInput, lengthInput };
    if (lastEditorSnapshotRef.current === null) {
      lastEditorSnapshotRef.current = current; // baseline captured on open — no history yet
      return;
    }
    if (skipUndoCaptureRef.current) {
      skipUndoCaptureRef.current = false; // this change came from an undo/reset, don't record it
      lastEditorSnapshotRef.current = current;
      return;
    }
    const prev = lastEditorSnapshotRef.current;
    if (
      prev.editing === editing &&
      prev.jewelryTypeInput === jewelryTypeInput &&
      prev.chainTypeInput === chainTypeInput &&
      prev.lengthInput === lengthInput
    ) return;
    const now = Date.now();
    const coalesce = undoStackRef.current.length > 0 && now - lastUndoCaptureAtRef.current < 600;
    if (!coalesce) {
      undoStackRef.current.push(prev);
      setCanUndoEdit(true);
    }
    lastEditorSnapshotRef.current = current;
    lastUndoCaptureAtRef.current = now;
  }, [editing, jewelryTypeInput, chainTypeInput, lengthInput]);

  function resetUndoHistory() {
    undoStackRef.current = [];
    lastEditorSnapshotRef.current = null;
    lastUndoCaptureAtRef.current = 0;
    setCanUndoEdit(false);
  }

  function undoEdit() {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return;
    skipUndoCaptureRef.current = true;
    lastUndoCaptureAtRef.current = 0;
    setEditing(snapshot.editing);
    setJewelryTypeInput(snapshot.jewelryTypeInput);
    setChainTypeInput(snapshot.chainTypeInput);
    setLengthInput(snapshot.lengthInput);
    setCanUndoEdit(undoStackRef.current.length > 0);
  }
  const productTypeOptions = useMemo(() => {
    const base = PRODUCT_JEWELRY_TYPES.map((type) => type.value);
    const extras = [
      jewelryTypeInput,
      editing?.product_type,
      editing?.jewelry_type,
      ...products.flatMap((product) => [product.product_type, product.jewelry_type, getProductJewelryType(product)]),
    ]
      .map((value) => normalizeProductTypeValue(value))
      .filter((value): value is string => Boolean(value));
    const seen = new Set<string>();
    const ordered = [...base, ...extras.sort((a, b) => a.localeCompare(b))].filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return ordered;
  }, [editing?.jewelry_type, editing?.product_type, jewelryTypeInput, products]);

  const flash = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  };

  const showQuickFillNotice = (text: string, ok = true) => {
    if (quickFillNoticeTimer.current) clearTimeout(quickFillNoticeTimer.current);
    setQuickFillNotice({ text, ok });
    quickFillNoticeTimer.current = setTimeout(() => setQuickFillNotice(null), 5000);
  };

  async function loadFullProduct(product: Product): Promise<Product | null> {
    setLoadingProductId(product.id);
    const result = await adminGetProduct(product.id);
    setLoadingProductId(null);
    if (result.error || !result.product) {
      flash(result.error ?? 'Could not load the product.', false);
      return null;
    }
    return { ...product, ...result.product };
  }

  async function openFullProductEditor(product: Product) {
    const fullProduct = await loadFullProduct(product);
    if (!fullProduct) return;
    closeActionMenu();
    setShowMobileProductTable(false);
    setProductActionTarget(null);
    openEdit(fullProduct);
  }

  async function duplicateFullProduct(product: Product) {
    const fullProduct = await loadFullProduct(product);
    if (!fullProduct) return;
    closeActionMenu();
    setShowMobileProductTable(false);
    setProductActionTarget(null);
    duplicateProduct(fullProduct);
  }

  async function openFullImagePaddingChooser(product: Product) {
    const fullProduct = await loadFullProduct(product);
    if (!fullProduct) return;
    closeActionMenu();
    setShowMobileProductTable(false);
    setProductActionTarget(null);
    openImagePaddingChooser(fullProduct);
  }

  function renderProductActions(product: Product, surface: 'menu' | 'modal') {
    const closeSurfaces = () => {
      closeActionMenu();
      if (surface === 'modal') setProductActionTarget(null);
    };
    const isModal = surface === 'modal';
    const actionClass = isModal ? PRODUCT_ACTION_BUTTON_CLASS : ROW_ACTION_MENU_ITEM_CLASS;
    const actionStyle = (color: string) => ({
      color,
      fontFamily: 'var(--font-label)',
      ...(isModal ? {
        borderColor: 'var(--color-outline-variant)',
        background: 'var(--color-surface-container-lowest)',
      } : {}),
    });
    const iconStyle = {
      fontSize: '16px',
      lineHeight: 1,
    };

    return (
      <>
        <Link
          href={`${locale === 'es' ? '/es' : ''}/shop/${product.id}?returnTo=admin`}
          onClick={closeSurfaces}
          className={actionClass}
          style={actionStyle('var(--color-on-surface-variant)')}
        >
          {isModal && <AppIcon name="visibility" className="inline-flex leading-none" style={iconStyle} aria-hidden="true" />}
          View
        </Link>
        <button type="button" onClick={() => void openFullProductEditor(product)}
          disabled={loadingProductId === product.id}
          className={actionClass}
          style={actionStyle('var(--color-primary)')}>
          {isModal && <AppIcon name="edit" className="inline-flex leading-none" style={iconStyle} aria-hidden="true" />}
          {loadingProductId === product.id ? 'Loading...' : 'Edit'}
        </button>
        <button type="button" onClick={() => void duplicateFullProduct(product)}
          disabled={loadingProductId === product.id}
          className={actionClass}
          style={actionStyle('var(--color-on-surface-variant)')}>
          {isModal && <AppIcon name="description" className="inline-flex leading-none" style={iconStyle} aria-hidden="true" />}
          {loadingProductId === product.id ? 'Loading...' : 'Duplicate'}
        </button>
        <button type="button" onClick={() => void openFullImagePaddingChooser(product)}
          disabled={loadingProductId === product.id}
          className={actionClass}
          style={actionStyle(hasAnyProductImagePadding(product.image_padding, product.image_padding_by_image) ? '#0f7a4f' : '#7a4a1f')}>
          {isModal && <AppIcon name="image" className="inline-flex leading-none" style={iconStyle} aria-hidden="true" />}
          {loadingProductId === product.id ? 'Loading...' : 'Pad'}
        </button>
        {normalizeProductStatus(product.status) !== 'draft' && (
          <button type="button" onClick={() => { closeSurfaces(); void updateProductStatus(product, 'draft'); }}
            className={actionClass}
            style={actionStyle('#5b21b6')}>
            {isModal && <AppIcon name="draft" className="inline-flex leading-none" style={iconStyle} aria-hidden="true" />}
            Draft
          </button>
        )}
        {normalizeProductStatus(product.status) !== 'available' && (
          <button type="button" onClick={() => { closeSurfaces(); void updateProductStatus(product, 'available'); }}
            className={actionClass}
            style={actionStyle('var(--color-primary)')}>
            {isModal && <AppIcon name="store" className="inline-flex leading-none" style={iconStyle} aria-hidden="true" />}
            Available
          </button>
        )}
        {normalizeProductStatus(product.status) !== 'sold' && (
          <button type="button" onClick={() => { closeSurfaces(); void updateProductStatus(product, 'sold'); }}
            className={actionClass}
            style={actionStyle('var(--color-on-surface)')}>
            {isModal && <AppIcon name="sell" className="inline-flex leading-none" style={iconStyle} aria-hidden="true" />}
            Sold
          </button>
        )}
        {normalizeProductStatus(product.status) !== 'archived' && (
          <button type="button" onClick={() => { closeSurfaces(); void updateProductStatus(product, 'archived'); }}
            className={actionClass}
            style={actionStyle('var(--color-on-surface-variant)')}>
            {isModal && <AppIcon name="inventory_2" className="inline-flex leading-none" style={iconStyle} aria-hidden="true" />}
            Archive
          </button>
        )}
        <button type="button" onClick={() => { closeSurfaces(); setShowMobileProductTable(false); setDeleteTarget(product); }}
          className={actionClass}
          style={actionStyle('var(--color-error)')}>
          {isModal && <AppIcon name="delete" className="inline-flex leading-none" style={iconStyle} aria-hidden="true" />}
          Delete
        </button>
      </>
    );
  }

  function openImagePaddingChooser(product: Product) {
    const firstImage = getProductImages(product)[0] ?? null;
    const paddingValue = productImagePaddingForImage(product.image_padding, product.image_padding_by_image, firstImage, 0);
    const fallbackColor = productImagePaddingBackground(paddingValue) === '#000000' ? '#000000' : '#ffffff';
    setImagePaddingCustomColor(isProductImagePaddingCustomColor(paddingValue) ? paddingValue : fallbackColor);
    setImagePaddingNotice(null);
    imagePaddingTargetIndexRef.current = 0;
    setImagePaddingTargetIndex(0);
    setImagePaddingTarget(product);
  }

  useEffect(() => {
    const loadStoredPrompt = () => {
      const storedPrompt = window.localStorage.getItem(QUICK_FILL_PROMPT_STORAGE_KEY)?.trim();
      setQuickFillPrompt(ensureQuickFillPromptHasCurrentBrandRules(storedPrompt || DEFAULT_QUICK_FILL_AI_FORMAT_PROMPT));
    };

    loadStoredPrompt();
    window.addEventListener('storage', loadStoredPrompt);
    window.addEventListener('focus', loadStoredPrompt);
    return () => {
      window.removeEventListener('storage', loadStoredPrompt);
      window.removeEventListener('focus', loadStoredPrompt);
    };
  }, []);

  // Lock the page underneath while the add/edit listing modal is open. Without
  // this, the (much wider than the viewport) products table can still be
  // scrolled/panned behind the fixed modal on touch devices, which is exactly
  // the kind of background bleed-through that makes a fixed-position overlay
  // feel like it's the one scrolling horizontally.
  useEffect(() => {
    if (!editing) return;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    const previousOverscroll = style.overscrollBehavior;
    style.overflow = 'hidden';
    style.overscrollBehavior = 'none';
    return () => {
      style.overflow = previousOverflow;
      style.overscrollBehavior = previousOverscroll;
    };
  }, [editing]);

  useEffect(() => {
    if (!previewImg) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewImg(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [previewImg]);

  useEffect(() => {
    if (!productActionTarget) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProductActionTarget(null);
    };
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [productActionTarget]);

  const copyQuickFillPrompt = async () => {
    const copied = await copyTextToClipboard(quickFillPrompt);
    if (!copied) {
      setShowQuickFillPrompt(true);
      window.setTimeout(() => {
        quickFillPromptTextRef.current?.focus();
        quickFillPromptTextRef.current?.select();
      }, 50);
    }
    showQuickFillNotice(
      copied
        ? 'AI formatting prompt copied.'
        : 'Clipboard access was blocked. Prompt text is open and selected for manual copy.',
      copied,
    );
  };

  const supabase = createClient();

  // --- Sign out ---
  async function handleSignOut() {
    await supabase.auth.signOut();
    startRouteProgress('/');
    router.push('/');
    router.refresh();
  }

  // --- Open add/edit modal ---
  function openAdd() {
    openAddFromProducts(products);
  }

  function openAddFromProducts(sourceProducts: Product[]) {
    resetSpanishTranslation();
    originalRef.current = null;
    setSessionUploadedImageUrls(new Set());
    setFormErrors([]);
    setJewelryTypeInput('');
    setChainTypeInput('');
    setLengthInput('');
    setQuickEntry('');
    setQuickFillNotice(null);
    setQuickAddMode(false);
    setShowAdvancedIds(false);
    setOpenEditorSections({ photos: false, video: false, ai: false, details: false, etsy: false, ebay: false, instagram: false, facebook: false });
    // Reset the Smart Listing Assistant so the next item starts completely fresh
    // (transcript, generated draft, notices, undo snapshot, and any active recording).
    stopAiRecording();
    setAiTranscript('');
    setAiInterimText('');
    setAiPriorInputs([]);
    setAiNotes([]);
    setAiUndoSnapshot(null);
    setAiNotice(null);
    setAiGenerating(false);
    const autoOrder = sourceProducts.length > 0
      ? Math.max(...sourceProducts.map(p => p.sort_order ?? 0)) + 1
      : 1;
    setInventoryNumberManual(false);
    setEditing({ ...emptyProduct(), inventory_number: getNextInventoryNumber(sourceProducts), sort_order: autoOrder });
    setIsNew(true);
  }

  function validate(e: ReturnType<typeof emptyProduct>, excludeId?: string): string[] {
    const errs: string[] = [];
    if (!e.title.trim()) errs.push('Title (English) is required.');
    const inventoryNumber = parseInventoryNumber(e.inventory_number);
    if (!inventoryNumber) {
      errs.push('Inventory # is required.');
    } else {
      const duplicateOwner = getInventoryNumberOwner(products, inventoryNumber, excludeId);
      if (duplicateOwner) errs.push(getDuplicateInventoryNumberMessage(duplicateOwner, inventoryNumber));
    }
    if (e.price_mode === 'spot-multiplier') {
      if (!e.purity) errs.push('Purity is required for spot-price mode.');
      if (!e.weight_grams) errs.push('Weight is required for spot-price mode.');
      if (!e.pricing_multiplier) errs.push('Multiplier is required for spot-price mode.');
    }
    if (e.price_mode === 'manual' && !e.manual_price_label?.trim()) {
      errs.push('Price label is required for manual price mode.');
    }
    if (e.width_mm != null && normalizeProductWidthMm(e.width_mm) == null) {
      errs.push('Width must be between 0.01 and 1000 millimeters.');
    }
    if (e.special_price_override_enabled) {
      if (normalizeSpecialPriceOverrideMode(e.special_price_override_mode) === 'percent') {
        if (!(typeof e.special_price_override_percent === 'number' && e.special_price_override_percent >= 0)) {
          errs.push('Enter a percentage over spot for the customer special pricing override, or uncheck it.');
        }
      } else if (!(e.special_price_override_amount && e.special_price_override_amount > 0)) {
        errs.push('Enter a custom amount for the customer special pricing override, or uncheck it.');
      }
    }
    return errs;
  }

  function openEdit(p: Product) {
    resetSpanishTranslation();
    stopAiRecording();
    setAiTranscript('');
    setAiInterimText('');
    setAiPriorInputs([]);
    setAiNotes([]);
    setAiUndoSnapshot(null);
    setAiNotice(null);
    setAiGenerating(false);
    const nextProductType = getProductJewelryType(p);
    const nextMetalType = getProductMetalType(p);
    const copy = {
      ...p,
      product_type: p.product_type ?? nextProductType,
      jewelry_type: p.jewelry_type ?? nextProductType,
      metal_type: p.metal_type ?? nextMetalType,
      width_mm: p.width_mm ?? null,
    };
    originalRef.current = copy;
    setSessionUploadedImageUrls(new Set());
    setJewelryTypeInput(nextProductType);
    setChainTypeInput(productSupportsLinkType(nextProductType) ? getProductLinkType(p) : '');
    setLengthInput(getProductLength(p));
    setFormErrors([]);
    setQuickEntry('');
    setQuickFillNotice(null);
    setQuickAddMode(false);
    setShowAdvancedIds(false);
    setOpenEditorSections({ photos: false, video: false, ai: false, details: false, etsy: false, ebay: false, instagram: false, facebook: false });
    setInventoryNumberManual(false);
    const autoInventoryNumber =
      copy.inventory_number ??
      getDisplayedInventoryNumber(copy, products) ??
      getNextInventoryNumber(products, copy.id);
    setEditing({ ...copy, inventory_number: autoInventoryNumber });
    setIsNew(false);
  }

  function getAutoInventoryNumber() {
    if (!editing) return getNextInventoryNumber(products);
    const originalNumber = parseInventoryNumber(originalRef.current?.inventory_number);
    if (!isNew && originalNumber) return originalNumber;
    if (!isNew && originalRef.current) {
      return getDisplayedInventoryNumber(originalRef.current as Product, products) ?? getNextInventoryNumber(products, editing.id || undefined);
    }
    return getNextInventoryNumber(products, editing.id || undefined);
  }

  function setManualInventoryNumber(checked: boolean) {
    setInventoryNumberManual(checked);
    if (!checked && editing) {
      setEditing({ ...editing, inventory_number: getAutoInventoryNumber() });
    }
  }

  function applyQuickEntry() {
    if (!editing || !quickEntry.trim()) return;
    const tokens = getQuickFillTokens(quickEntry);
    const updates: Partial<ReturnType<typeof emptyProduct>> = {};
    let newJewelryType = jewelryTypeInput;
    let newChainType = chainTypeInput;
    let newLength = lengthInput;
    let categoryWasUpdated = false;
    let metalVariantWasUpdated = false;
    let purityWasUpdated = false;
    const applied: string[] = [];
    const notApplied: string[] = [];

    const clearTokenValue = (field: QuickFillField) => {
      if (field === 'title') { updates.title = ''; applied.push('Title (English)'); return true; }
      if (field === 'titleEs') { updates.title_es = ''; applied.push('Title (Spanish)'); return true; }
      if (field === 'brand') { updates.brand = null; applied.push('Brand'); return true; }
      if (field === 'description') { updates.description = ''; applied.push('Description (EN)'); return true; }
      if (field === 'descriptionEs') { updates.description_es = ''; applied.push('Description (ES)'); return true; }
      if (field === 'publicNotes') { updates.public_notes = ''; applied.push('Notes (EN)'); return true; }
      if (field === 'publicNotesEs') { updates.public_notes_es = ''; applied.push('Notes (ES)'); return true; }
      if (field === 'productType') {
        newJewelryType = 'Other';
        updates.product_type = 'Other';
        updates.jewelry_type = 'Other';
        newChainType = '';
        newLength = '';
        applied.push('Product Type');
        return true;
      }
      if (field === 'chainType') { newChainType = ''; applied.push('Link Type'); return true; }
      if (field === 'length') { newLength = ''; applied.push(getLengthSizeLabel(newJewelryType)); return true; }
      if (field === 'itemYear') { updates.item_year = null; applied.push('Date'); return true; }
      if (field === 'priceLabel') {
        updates.asking_price = null;
        updates.manual_price_label = null;
        applied.push('Price Label');
        return true;
      }
      if (field === 'purity') {
        updates.purity = null;
        purityWasUpdated = true;
        applied.push('Purity');
        return true;
      }
      if (field === 'weight') {
        updates.weight_grams = null;
        applied.push('Weight');
        return true;
      }
      if (field === 'multiplier') {
        updates.pricing_multiplier = null;
        applied.push('Multiplier');
        return true;
      }
      if (field === 'metalVariant') {
        updates.metal_variant = getDefaultMetalVariant(updates.category ?? editing.category);
        metalVariantWasUpdated = true;
        applied.push('Metal Color');
        return true;
      }
      if (field === 'metalType') {
        updates.metal_type = editing.category;
        updates.metal = editing.category;
        applied.push('Metal Type');
        return true;
      }
      return false;
    };

    const applyTokenValue = (rawValue: string, field: QuickFillField | null = null) => {
      const value = rawValue.replace(/\.{3,}$/g, '').trim();
      if (!value) return field ? clearTokenValue(field) : false;
      const lower = value.toLowerCase();

      if (field === 'title') {
        updates.title = value;
        applied.push('Title (English)');
        return true;
      }
      if (field === 'titleEs') {
        updates.title_es = value;
        applied.push('Title (Spanish)');
        return true;
      }
      if (field === 'brand') {
        updates.brand = value;
        applied.push('Brand');
        return true;
      }
      if (field === 'description') {
        updates.description = value;
        applied.push('Description (EN)');
        return true;
      }
      if (field === 'descriptionEs') {
        updates.description_es = value;
        applied.push('Description (ES)');
        return true;
      }
      if (field === 'publicNotes') {
        updates.public_notes = value;
        applied.push('Notes (EN)');
        return true;
      }
      if (field === 'publicNotesEs') {
        updates.public_notes_es = value;
        applied.push('Notes (ES)');
        return true;
      }
      if (field === 'itemYear') {
        const itemYear = normalizeProductItemYear(value);
        if (!itemYear) return false;
        updates.item_year = itemYear;
        applied.push('Date');
        return true;
      }

      if (!field || field === 'productType') {
        const matchedJewelryType = normalizeProductJewelryType(value);
        if (matchedJewelryType) {
          newJewelryType = matchedJewelryType;
          updates.product_type = matchedJewelryType;
          updates.jewelry_type = matchedJewelryType;
          if (!productSupportsLinkType(matchedJewelryType)) newChainType = '';
          if (!productUsesLength(matchedJewelryType) && !productUsesSize(matchedJewelryType) && !productUsesHeight(matchedJewelryType)) newLength = '';
          applied.push('Product Type');
          return true;
        }
        const customProductType = field === 'productType' ? normalizeProductTypeValue(value) : null;
        if (customProductType) {
          newJewelryType = customProductType;
          updates.product_type = customProductType;
          updates.jewelry_type = customProductType;
          newChainType = '';
          if (!productUsesLength(customProductType) && !productUsesSize(customProductType) && !productUsesHeight(customProductType)) newLength = '';
          applied.push('Product Type');
          return true;
        }
      }

      if ((!field || field === 'metalType') && PRODUCT_METAL_TYPES.some((type) => type.value.toLowerCase() === lower || type.label.toLowerCase() === lower || type.labelEs.toLowerCase() === lower)) {
        const nextMetalType = normalizeProductMetalType(value, editing.category);
        updates.metal_type = nextMetalType;
        updates.metal = nextMetalType;
        if (nextMetalType === 'Gold' || nextMetalType === 'Silver') {
          updates.category = nextMetalType;
          if (!metalVariantWasUpdated) updates.metal_variant = getDefaultMetalVariant(nextMetalType);
          categoryWasUpdated = true;
        }
        applied.push('Metal Type');
        return true;
      }

      if ((!field || field === 'category') && lower === 'gold') {
        updates.category = 'Gold';
        updates.metal = 'Gold';
        updates.metal_type = 'Gold';
        if (!metalVariantWasUpdated) updates.metal_variant = getDefaultMetalVariant('Gold');
        categoryWasUpdated = true;
        applied.push('Category');
        return true;
      }
      if ((!field || field === 'category') && lower === 'silver') {
        updates.category = 'Silver';
        updates.metal = 'Silver';
        updates.metal_type = 'Silver';
        if (!metalVariantWasUpdated) updates.metal_variant = getDefaultMetalVariant('Silver');
        categoryWasUpdated = true;
        applied.push('Category');
        return true;
      }

      if (!field || field === 'metalVariant') {
        const variantValue = lower.replace(/[-\s]+/g, '_');
        const variantOptions = [...PRODUCT_METAL_VARIANTS.Gold, ...PRODUCT_METAL_VARIANTS.Silver];
        const matchedVariant = variantOptions.find((variant) => (
          variant.value === variantValue ||
          variant.label.toLowerCase() === lower ||
          variant.labelEs.toLowerCase() === lower ||
          (variant.value === 'tricolor_gold' && lower === 'tri color gold') ||
          (variant.value === 'tricolor_gold' && lower === 'tri-color gold') ||
          (variant.value === 'tricolor_gold' && lower === 'tricolor') ||
          (variant.value === 'bicolor_gold' && lower === 'bi color gold') ||
          (variant.value === 'bicolor_gold' && lower === 'bi-color gold') ||
          (variant.value === 'bicolor_gold' && lower === 'bicolor') ||
          (variant.value === 'yellow_gold' && lower === 'yellow') ||
          (variant.value === 'white_gold' && lower === 'white') ||
          (variant.value === 'rose_gold' && lower === 'rose')
        ));
        if (matchedVariant) {
          const nextCategory = PRODUCT_METAL_VARIANTS.Silver.some((variant) => variant.value === matchedVariant.value)
            ? 'Silver'
            : 'Gold';
          updates.category = nextCategory;
          updates.metal = nextCategory;
          updates.metal_type = nextCategory;
          updates.metal_variant = matchedVariant.value;
          categoryWasUpdated = true;
          metalVariantWasUpdated = true;
          applied.push('Metal Color');
          return true;
        }
      }

      if (!field || field === 'gender') {
        if (lower === 'unisex') { updates.gender = 'Unisex'; applied.push('Gender'); return true; }
        if (lower === 'men' || lower === 'mens' || lower === 'male') { updates.gender = 'Men'; applied.push('Gender'); return true; }
        if (lower === 'women' || lower === 'womens' || lower === "women's" || lower === 'female') { updates.gender = 'Women'; applied.push('Gender'); return true; }
      }

      if (!field || field === 'status') {
        if (lower === 'draft') { updates.status = 'draft'; applied.push('Status'); return true; }
        if (lower === 'available') { updates.status = 'available'; applied.push('Status'); return true; }
        if (lower === 'pending payment' || lower === 'pending_payment') { updates.status = 'pending_payment'; applied.push('Status'); return true; }
        if (lower === 'sold') { updates.status = 'sold'; applied.push('Status'); return true; }
        if (lower === 'archived') { updates.status = 'archived'; applied.push('Status'); return true; }
      }

      if (!field || field === 'location') {
        const matchedLocation = LOCATIONS.find((location) => {
          const normalizedValue = lower.replace(/\s+/g, '_');
          return lower === location.label.toLowerCase() || normalizedValue === location.value;
        });
        if (matchedLocation) {
          updates.location = matchedLocation.value;
          applied.push('Location');
          return true;
        }
      }

      if (!field || field === 'priceMode') {
        if (lower === 'spot' || lower === 'spot-multiplier' || lower === 'spot multiplier') {
          updates.price_mode = 'spot-multiplier'; applied.push('Price Mode'); return true;
        }
        if (lower === 'manual' || lower === 'fixed' || lower === 'manual fixed price') {
          updates.price_mode = 'manual'; applied.push('Price Mode'); return true;
        }
      }

      if (field === 'priceLabel' || (!field && /^\$\s*\d/.test(value))) {
        updates.price_mode = 'manual';
        updates.asking_price = null;
        updates.manual_price_label = normalizeManualPriceLabel(value) ?? value;
        applied.push('Price Label');
        return true;
      }

      const purityMatch = lower.match(/^(\d+)\s*k?$/);
      if ((!field || field === 'purity') && purityMatch) {
        const val = parseInt(purityMatch[1]);
        if ((val >= 1 && val <= 24) || (val >= 100 && val <= 1000)) {
          updates.purity = val;
          purityWasUpdated = true;
          applied.push('Purity');
          return true;
        }
      }

      const weightMatch = lower.match(field === 'weight' ? /^(\d+(?:\.\d+)?)\s*(?:g(?:rams?)?)?$/ : /^(\d+(?:\.\d+)?)\s*g(rams?)?$/);
      if ((!field || field === 'weight') && weightMatch) {
        updates.weight_grams = parseFloat(weightMatch[1]);
        applied.push('Weight');
        return true;
      }

      const multA = lower.match(/^(\d+(?:\.\d+)?)\s*x$/);
      const multB = lower.match(/^x\s*(\d+(?:\.\d+)?)$/);
      const multC = field === 'multiplier' ? lower.match(/^(\d+(?:\.\d+)?)$/) : null;
      if ((!field || field === 'multiplier') && multA) { updates.pricing_multiplier = parseFloat(multA[1]); applied.push('Multiplier'); return true; }
      if ((!field || field === 'multiplier') && multB) { updates.pricing_multiplier = parseFloat(multB[1]); applied.push('Multiplier'); return true; }
      if (field === 'multiplier' && multC) { updates.pricing_multiplier = parseFloat(multC[1]); applied.push('Multiplier'); return true; }

      if (!field || field === 'chainType') {
        const matchedChain = getQuickFillLinkType(value, field === 'chainType');
        if (matchedChain) {
          newChainType = matchedChain;
          if (!productSupportsLinkType(newJewelryType)) {
            newJewelryType = 'Necklace';
            updates.product_type = 'Necklace';
            updates.jewelry_type = 'Necklace';
            applied.push('Product Type');
          }
          applied.push('Link Type');
          return true;
        }
      }

      const lenMatch = lower.match(field === 'length' ? /^(\d+(?:\.\d+)?)\s*(?:(?:in(?:ch(?:es?)?)?)|")?$/ : /^(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es?)?)?|")$/);
      if ((!field || field === 'length') && lenMatch) {
        newLength = normalizeProductLengthSizeValue(lenMatch[0]);
        applied.push(getLengthSizeLabel(newJewelryType));
        return true;
      }
      if (field === 'length') {
        newLength = normalizeProductLengthSizeValue(value);
        applied.push(getLengthSizeLabel(newJewelryType));
        return true;
      }

      return false;
    };

    for (const tok of tokens) {
      const cleanedToken = tok.replace(/\.{3,}$/g, '').trim();
      const keyedMatch = cleanedToken.match(/^([^:]+):(.*)$/);
      const field = keyedMatch ? normalizeQuickFillFieldName(keyedMatch[1]) : null;
      const value = keyedMatch ? keyedMatch[2].trim() : cleanedToken;

      if (!applyTokenValue(value, field)) {
        notApplied.push(cleanedToken);
      }
    }

    const hasExplicitFields = tokens.some((token) => {
        const keyedMatch = token.match(/^([^:]+):(.*)$/);
        return keyedMatch ? normalizeQuickFillFieldName(keyedMatch[1]) !== null : false;
      });

    if (notApplied.length > 0 && !hasExplicitFields) {
      const orderedUpdates: Partial<ReturnType<typeof emptyProduct>> = {};
      let orderedJewelryType = jewelryTypeInput;
      let orderedChainType = chainTypeInput;
      let orderedLength = lengthInput;
      let orderedCategoryWasUpdated = false;
      let orderedMetalVariantWasUpdated = false;
      let orderedPurityWasUpdated = false;
      const orderedApplied: string[] = [];
      const orderedNotApplied: string[] = [];

      const previous = {
        updates: { ...updates },
        jewelryType: newJewelryType,
        chainType: newChainType,
        length: newLength,
        categoryWasUpdated,
        metalVariantWasUpdated,
        purityWasUpdated,
        applied: [...applied],
      };

      Object.keys(updates).forEach((key) => {
        delete updates[key as keyof typeof updates];
      });
      newJewelryType = orderedJewelryType;
      newChainType = orderedChainType;
      newLength = orderedLength;
      categoryWasUpdated = false;
      metalVariantWasUpdated = false;
      purityWasUpdated = false;
      applied.length = 0;

      getQuickFillFormOrderTokens(quickEntry).forEach((token, index) => {
        const field = QUICK_FILL_FORM_ORDER[index];
        const value = token.replace(/\.{3,}$/g, '').trim();
        if (!field) {
          orderedNotApplied.push(value);
          return;
        }
        if (!applyTokenValue(value, field)) {
          orderedNotApplied.push(value);
        }
      });

      Object.assign(orderedUpdates, updates);
      orderedJewelryType = newJewelryType;
      orderedChainType = newChainType;
      orderedLength = newLength;
      orderedCategoryWasUpdated = categoryWasUpdated;
      orderedMetalVariantWasUpdated = metalVariantWasUpdated;
      orderedPurityWasUpdated = purityWasUpdated;
      orderedApplied.push(...applied);

      Object.keys(updates).forEach((key) => {
        delete updates[key as keyof typeof updates];
      });

      if (orderedApplied.length > previous.applied.length && orderedNotApplied.length < notApplied.length) {
        Object.assign(updates, orderedUpdates);
        newJewelryType = orderedJewelryType;
        newChainType = orderedChainType;
        newLength = orderedLength;
        categoryWasUpdated = orderedCategoryWasUpdated;
        metalVariantWasUpdated = orderedMetalVariantWasUpdated;
        purityWasUpdated = orderedPurityWasUpdated;
        applied.length = 0;
        applied.push(...orderedApplied);
        notApplied.length = 0;
        notApplied.push(...orderedNotApplied);
      } else {
        Object.assign(updates, previous.updates);
        newJewelryType = previous.jewelryType;
        newChainType = previous.chainType;
        newLength = previous.length;
        categoryWasUpdated = previous.categoryWasUpdated;
        metalVariantWasUpdated = previous.metalVariantWasUpdated;
        purityWasUpdated = previous.purityWasUpdated;
        applied.length = 0;
        applied.push(...previous.applied);
      }
    }

    if (categoryWasUpdated && !purityWasUpdated && updates.category !== editing.category) {
      updates.purity = null;
    }

    if (metalVariantWasUpdated && updates.metal_variant) {
      const nextCategory = getCategoryForMetalVariant(updates.metal_variant);
      updates.category = nextCategory;
      updates.metal = nextCategory;
      updates.metal_type = nextCategory;
    }

    if (!productSupportsLinkType(newJewelryType)) {
      newChainType = '';
      updates.width_mm = null;
    }
    if (!productUsesLength(newJewelryType) && !productUsesSize(newJewelryType) && !productUsesHeight(newJewelryType)) {
      newLength = '';
    }

    if (applied.length) {
      setEditing({ ...editing, ...updates });
      setJewelryTypeInput(newJewelryType);
      setChainTypeInput(newChainType);
      setLengthInput(newLength);
      setQuickEntry('');
    }

    if (applied.length && notApplied.length) {
      showQuickFillNotice(`Applied: ${applied.join(', ')}. Not applied: ${notApplied.map((item) => `"${item}"`).join(', ')}.`);
    } else if (applied.length) {
      showQuickFillNotice(`Applied: ${applied.join(', ')}`);
    } else if (notApplied.length) {
      showQuickFillNotice(`Not applied: ${notApplied.map((item) => `"${item}"`).join(', ')}. No fields were changed.`, false);
    } else {
      showQuickFillNotice('No recognized fields in that string.', false);
    }
  }

  function showAiNotice(text: string, ok = true) {
    setAiNotice({ text, ok });
    window.setTimeout(() => setAiNotice(null), 5000);
  }

  function appendAiTranscript(text: string) {
    const cleaned = text.trim();
    if (!cleaned) return;
    setAiTranscript((current) => [current.trim(), cleaned].filter(Boolean).join(' '));
  }

  function startAiRecording() {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionCtor = (window as WindowWithSpeechRecognition).SpeechRecognition
      ?? (window as WindowWithSpeechRecognition).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      showAiNotice('Voice recording is not supported in this browser. You can still type the description.', false);
      return;
    }

    aiRecognitionRef.current?.stop();
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          finalText += ` ${result[0].transcript}`;
        } else {
          interimText += ` ${result[0].transcript}`;
        }
      }
      if (finalText) appendAiTranscript(finalText);
      setAiInterimText(interimText.trim());
    };
    recognition.onerror = (event) => {
      // Fatal errors: mic permission denied — stop recording and tell the user.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        aiRecordingRef.current = false;
        setAiRecording(false);
        showAiNotice('Microphone access was denied. Check your browser permissions and try again.', false);
        return;
      }
      // Non-fatal errors (no-speech, network, aborted, etc.): onend fires next
      // and will restart automatically — no notice needed.
    };
    recognition.onend = () => {
      if (!aiRecordingRef.current) return;
      // Clear interim text during the brief gap while we restart the session.
      setAiInterimText('');
      window.setTimeout(() => {
        // User may have clicked Stop during the delay — check again.
        if (!aiRecordingRef.current) return;
        try {
          recognition.start();
        } catch {
          // start() failed (browser mid-transition). Retry once after a longer pause.
          window.setTimeout(() => {
            if (!aiRecordingRef.current) return;
            try {
              recognition.start();
            } catch {
              // Both retries failed — recording is truly dead. Surface it.
              aiRecordingRef.current = false;
              setAiRecording(false);
              showAiNotice('Recording stopped unexpectedly. Tap the mic to start again.', false);
            }
          }, 1000);
        }
      }, 300);
    };
    aiRecognitionRef.current = recognition;
    aiRecordingRef.current = true;
    setAiRecording(true);
    try {
      recognition.start();
    } catch {
      aiRecordingRef.current = false;
      setAiRecording(false);
      showAiNotice('Voice recording could not start. You can still type the description.', false);
    }
  }

  function stopAiRecording() {
    aiRecordingRef.current = false;
    setAiRecording(false);
    setAiInterimText('');
    aiRecognitionRef.current?.stop();
  }

  async function generateAiDraft() {
    if (!editing) return;
    const latestUserInput = [aiTranscript, aiInterimText].filter(Boolean).join(' ').trim();
    if ((editing.images?.length ?? 0) === 0) {
      showAiNotice('Add at least one photo to generate a listing.', false);
      return;
    }

    setAiGenerating(true);
    try {
      // The form as it stands is the baseline: filled fields are kept, empty ones
      // filled, and an explicit statement in the note wins (the three rules in
      // ITERATIVE_LISTING_CONTRACT). Only the admin's own earlier inputs travel.
      const response = await fetch('/api/admin/ai-product-fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transcript: latestUserInput,
          images: editing.images ?? [],
          mode: 'fast',
          currentFields: getCurrentAiListingFields(editing, jewelryTypeInput, chainTypeInput, lengthInput),
          priorInputs: aiPriorInputs,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? 'AI listing generation failed.');
      const draft = data.draft as ProductAutofillDraft;

      setAiUndoSnapshot({
        editing: { ...editing },
        jewelryTypeInput,
        chainTypeInput,
        lengthInput,
      });
      applyAiDraftToForm(draft.fields, [...PRODUCT_AUTOFILL_FIELD_KEYS]);
      setAiNotes(draft.notes ?? []);
      if (latestUserInput) setAiPriorInputs((current) => [...current, latestUserInput]);
      setAiTranscript('');
      setAiInterimText('');
    } catch (error) {
      showAiNotice(error instanceof Error ? error.message : 'AI listing generation failed.', false);
    } finally {
      setAiGenerating(false);
    }
  }

  function applyAiDraftToForm(
    fields: ProductAutofillFields,
    fieldsToApply: (keyof ProductAutofillFields)[],
  ) {
    if (!editing) return;
    const selectedFields = new Set(fieldsToApply);
    const nextEditing = { ...editing };
    let nextJewelryType = jewelryTypeInput;
    let nextChainType = chainTypeInput;
    let nextLength = lengthInput;
    const applied: string[] = [];

    const setField = <K extends keyof ProductAutofillFields>(
      draftKey: K,
      label: string,
      apply: (value: NonNullable<ProductAutofillFields[K]>) => void,
    ) => {
      if (!selectedFields.has(draftKey)) return;
      const value = fields[draftKey];
      if (value == null || value === '') return;
      apply(value as NonNullable<ProductAutofillFields[K]>);
      applied.push(label);
    };

    setField('title', 'Title (English)', (value) => { nextEditing.title = value; });
    setField('brand', 'Brand', (value) => { nextEditing.brand = value; });
    setField('description', 'Description (EN)', (value) => { nextEditing.description = value; });
    setField('public_notes', 'Notes (EN)', (value) => { nextEditing.public_notes = value; });
    setField('gender', 'Gender', (value) => { nextEditing.gender = value; });
    setField('price_mode', 'Price Mode', (value) => { nextEditing.price_mode = value; });
    setField('purity', 'Purity', (value) => { nextEditing.purity = value; });
    setField('weight_grams', 'Weight', (value) => { nextEditing.weight_grams = value; });
    setField('item_year', 'Date (Year Made)', (value) => { nextEditing.item_year = value; });
    setField('pricing_multiplier', 'Multiplier', (value) => { nextEditing.pricing_multiplier = value; });
    setField('asking_price', 'Price Label', (value) => {
      nextEditing.asking_price = null;
      nextEditing.price_mode = 'manual';
      nextEditing.manual_price_label = nextEditing.manual_price_label ?? normalizeManualPriceLabel(String(value));
    });
    setField('manual_price_label', 'Price Label', (value) => {
      nextEditing.asking_price = null;
      nextEditing.price_mode = 'manual';
      nextEditing.manual_price_label = normalizeManualPriceLabel(value);
    });
    setField('show_spot_price', 'Show Spot/Melt Value', (value) => { nextEditing.show_spot_price = value; });
    setField('quantity', 'Quantity', (value) => { nextEditing.quantity = value; });
    // Only ever non-null when the admin's own words were about offers - the
    // route drops it otherwise (lib/offers.ts -> mentionsOffers).
    setField('accepts_offers', 'Accept offers', (value) => { nextEditing.accepts_offers = value; });
    setField('metal_type', 'Metal Type', (value) => {
      const nextCategory = getLegacyCategoryForMetalType(value, nextEditing.category);
      nextEditing.metal_type = value;
      nextEditing.metal = value;
      nextEditing.category = nextCategory;
      nextEditing.metal_variant = nextEditing.metal_variant || getDefaultMetalVariant(nextCategory);
    });
    setField('metal_variant', 'Metal Color', (value) => {
      const nextCategory = getCategoryForMetalVariant(value);
      nextEditing.category = nextCategory;
      nextEditing.metal = nextCategory;
      nextEditing.metal_type = nextCategory;
      nextEditing.metal_variant = value;
    });
    setField('product_type', 'Product Type', (value) => {
      nextJewelryType = value;
      nextEditing.product_type = value;
      nextEditing.jewelry_type = value;
      if (!productSupportsLinkType(value)) {
        nextChainType = '';
        nextEditing.width_mm = null;
      }
      if (!productUsesLength(value) && !productUsesSize(value) && !productUsesHeight(value)) nextLength = '';
    });
    setField('chain_type', 'Link Type', (value) => {
      if (!productSupportsLinkType(nextJewelryType)) nextJewelryType = 'Necklace';
      nextChainType = value;
      nextEditing.product_type = nextJewelryType;
      nextEditing.jewelry_type = nextJewelryType;
    });
    setField('length', getLengthSizeLabel(nextJewelryType), (value) => { nextLength = normalizeProductLengthSizeValue(value); });
    setField('width_mm', 'Width (mm)', (value) => {
      if (productSupportsLinkType(nextJewelryType)) nextEditing.width_mm = normalizeProductWidthMm(value);
    });

    if (applied.length === 0) {
      showAiNotice('The assistant returned nothing new for the form.', false);
      return;
    }

    setEditing(nextEditing);
    setJewelryTypeInput(nextJewelryType);
    setChainTypeInput(productSupportsLinkType(nextJewelryType) ? nextChainType : '');
    setLengthInput(productUsesLength(nextJewelryType) || productUsesSize(nextJewelryType) || productUsesHeight(nextJewelryType) ? nextLength : '');
    showAiNotice(`Filled: ${applied.join(', ')}.`);
  }

  function undoAiFill() {
    if (!aiUndoSnapshot) return;
    skipUndoCaptureRef.current = true;
    setEditing(aiUndoSnapshot.editing);
    setJewelryTypeInput(aiUndoSnapshot.jewelryTypeInput);
    setChainTypeInput(aiUndoSnapshot.chainTypeInput);
    setLengthInput(aiUndoSnapshot.lengthInput);
    setAiUndoSnapshot(null);
    setAiNotes([]);
    setAiPriorInputs((current) => current.slice(0, -1));
    showAiNotice('Last AI fill undone.');
  }

  function closeModal() {
    setEditorMoreOpen(false);
    resetSpanishTranslation();
    setEditorConfirm(null);
    setShowMicPrompt(false);
    setEditing(null);
    setQuickAddMode(false);
    setSessionUploadedImageUrls(new Set());
    setPreviewImg(null);
    setCropTarget(null);
    setQuickFillNotice(null);
    stopAiRecording();
    setAiTranscript('');
    setAiInterimText('');
    setAiPriorInputs([]);
    setAiNotes([]);
    setAiNotice(null);
    setAiUndoSnapshot(null);
  }

  // Cancel reverts everything. Clean up only the photos uploaded during this
  // editing session that were never saved to the product; keep the product's
  // original photos and any image shared with another listing.
  async function discardEditorDraft() {
    const orphanUploads = [...sessionUploadedImageUrls];
    const keepImages = originalRef.current
      ? [...(originalRef.current.images ?? []), ...(originalRef.current.image_urls ?? [])]
      : [];
    const sourceId = originalRef.current?.id ?? null;
    try {
      await productVideoEditorRef.current?.discard();
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not remove the draft video.', false);
      return;
    }
    closeModal();
    if (orphanUploads.length > 0) {
      await deleteProductImagesIfUnused(orphanUploads, sourceId, products, keepImages);
    }
  }

  // The editor never closes from an outside click; closing or saving always
  // routes through a confirmation step.
  function requestCloseEditor() {
    setEditorConfirm({
      title: 'Close this listing?',
      message: 'Any unsaved changes will be lost.',
      confirmLabel: 'Close',
      onConfirm: () => { setEditorConfirm(null); void discardEditorDraft(); },
    });
  }
  // Duplicate the open listing into a new draft (edit mode only). Shared by
  // the desktop row and the phone ⋯ sheet.
  function cloneListing() {
                    if (!editing) return;
                    resetSpanishTranslation();
                    const clone = {
                      ...editing,
                      id: '',
                      inventory_number: getNextInventoryNumber(products),
                      sku: null,
                      slug: null,
                      title: `${editing.title} (Copy)`,
                      title_es: editing.title_es ? `${editing.title_es} (Copia)` : null,
                      status: 'draft' as ProductStatus,
                      sort_order: products.length > 0
                        ? Math.max(...products.map(p => p.sort_order ?? 0)) + 1
                        : 1,
                    };
                    originalRef.current = null;
                    setFormErrors([]);
                    setQuickEntry('');
                    setQuickAddMode(false);
                    setInventoryNumberManual(false);
                    setLengthInput(getProductLength(editing as Product));
                    setEditing(clone);
                    setIsNew(true);
                    resetUndoHistory();
  }

  function requestSaveEditor(afterSave: 'stay' | 'another' | 'close') {
    setEditorConfirm({
      title: 'Save this listing?',
      message: 'Your changes will be saved to the catalog.',
      confirmLabel: 'Save',
      onConfirm: () => { setEditorConfirm(null); void handleSave(afterSave); },
    });
  }

  const uploadImageBlob = useCallback(async (blob: Blob): Promise<string | null> => {
    // Since 2026-09-09 every photo is encoded to WebP on the SERVER (sharp, in
    // /api/admin/product-images): WebKit — every iPhone browser — cannot encode
    // WebP in a canvas, so the browser only downsizes and hands over a
    // high-quality intermediate (JPEG on iPhone, WebP on desktop Chrome). The
    // stored object is WebP as a fact, not as a request — the old client path
    // once put 46 PNGs into the bucket under `.webp` names.
    let response: Response;
    try {
      response = await fetch('/api/admin/product-images', {
        method: 'POST',
        headers: { 'content-type': blob.type || 'application/octet-stream' },
        body: blob,
      });
    } catch {
      flash('Upload failed: the connection dropped before the photo reached the server.', false);
      return null;
    }
    const data = await response.json().catch(() => null) as { url?: string; error?: string } | null;
    if (!response.ok || !data?.url) {
      flash(`Upload failed: ${data?.error ?? response.statusText ?? 'unknown error'}`, false);
      return null;
    }
    return data.url;
  }, []);

  const deleteImagePaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return true;
    const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths);
    if (error) {
      flash(`Image cleanup failed: ${error.message}`, false);
      return false;
    }
    return true;
  }, [supabase]);

  const deleteProductImagesIfUnused = useCallback(async (
    urls: Iterable<string | null | undefined>,
    sourceProductId: string | null,
    nextProducts: Product[],
    currentProductImages: string[] = [],
  ) => {
    const currentPaths = new Set(uniqueProductImageStoragePaths(currentProductImages));
    const candidatePaths = uniqueProductImageStoragePaths(urls).filter((path) => !currentPaths.has(path));
    if (candidatePaths.length === 0) return;

    const referencedPaths = new Set<string>();
    nextProducts.forEach((product) => {
      if (sourceProductId && product.id === sourceProductId) return;
      uniqueProductImageStoragePaths([...(product.images ?? []), ...(product.image_urls ?? [])])
        .forEach((path) => referencedPaths.add(path));
    });

    const deletablePaths = candidatePaths.filter((path) => !referencedPaths.has(path));
    await deleteImagePaths(deletablePaths);
  }, [deleteImagePaths]);

  // --- Image upload ---
  const handleImageUpload = useCallback(async (files: FileList) => {
    if (!editing) return;
    const availableSlots = Math.max(0, MAX_PRODUCT_IMAGE_COUNT - editing.images.length);
    if (availableSlots <= 0) {
      flash(`Maximum ${MAX_PRODUCT_IMAGE_COUNT} photos per product. Remove a photo before uploading another.`, false);
      return;
    }
    const acceptedFiles = Array.from(files).slice(0, availableSlots);
    const rejectedForCount = files.length - acceptedFiles.length;
    const oversizedFiles = acceptedFiles.filter((file) => file.size > MAX_PRODUCT_IMAGE_UPLOAD_BYTES);
    const uploadFiles = acceptedFiles.filter((file) => file.size <= MAX_PRODUCT_IMAGE_UPLOAD_BYTES);
    if (rejectedForCount > 0) {
      flash(`Only ${availableSlots} more photo(s) allowed. ${rejectedForCount} file(s) were skipped.`, false);
    }
    if (oversizedFiles.length > 0) {
      flash(`Skipped ${oversizedFiles.length} oversized file(s). Each image must be 25 MB or less.`, false);
    }
    if (uploadFiles.length === 0) return;
    setUploading(true);

    const [firstFile, ...restFiles] = uploadFiles;

    async function processAndUpload(file: File): Promise<string | null> {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const MAX = 2048;
      const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      // This is only the INTERMEDIATE the server re-encodes to WebP, so it is
      // kept high quality; the browser's format no longer matters.
      const encoded = await encodeCanvasForUpload(canvas, 0.92);
      return uploadImageBlob(encoded.blob);
    }

    let successCount = 0;

    // Add a freshly-uploaded photo to the editor, defaulting it to WHITE side
    // padding. New products already default their product-level padding to white
    // (nothing to pin). Existing products may use a different padding, so the new
    // photo gets a per-photo white entry — the new upload defaults to white without
    // changing the product's other photos. The admin can still change it after.
    const addUploadedImage = (prev: NonNullable<typeof editing>, url: string) => {
      const productLevelIsWhite = normalizeProductImagePaddingValue(prev.image_padding) === 'white';
      return {
        ...prev,
        images: [...prev.images, url],
        image_padding_by_image: productLevelIsWhite
          ? prev.image_padding_by_image
          : { ...(prev.image_padding_by_image ?? {}), [url]: 'white' as const },
      };
    };

    // Upload the first photo and add it to state immediately so the AI assistant
    // becomes available while the remaining photos continue uploading in the background.
    const firstUrl = await processAndUpload(firstFile);
    if (firstUrl) {
      successCount++;
      setSessionUploadedImageUrls((current) => new Set(current).add(firstUrl));
      setEditing((prev) => prev ? addUploadedImage(prev, firstUrl) : prev);
    }

    for (const file of restFiles) {
      const url = await processAndUpload(file);
      if (url) {
        successCount++;
        setSessionUploadedImageUrls((current) => new Set(current).add(url));
        setEditing((prev) => prev ? addUploadedImage(prev, url) : prev);
      }
    }

    setUploading(false);
    if (successCount) flash(`${successCount} image(s) uploaded`);
  }, [editing, uploadImageBlob]);

  async function saveCroppedImage() {
    if (!editing || !cropTarget) return;
    const isFullImageCrop =
      cropRect.x === FULL_IMAGE_CROP.x &&
      cropRect.y === FULL_IMAGE_CROP.y &&
      cropRect.width === FULL_IMAGE_CROP.width &&
      cropRect.height === FULL_IMAGE_CROP.height;

    if (isFullImageCrop) {
      setCropTarget(null);
      flash('No crop changes applied');
      return;
    }

    setCropping(true);

    try {
      const image = new window.Image();
      image.crossOrigin = 'anonymous';
      image.src = cropTarget.url;
      await image.decode();

      const sx = Math.round((cropRect.x / 100) * image.naturalWidth);
      const sy = Math.round((cropRect.y / 100) * image.naturalHeight);
      const sw = Math.round((cropRect.width / 100) * image.naturalWidth);
      const sh = Math.round((cropRect.height / 100) * image.naturalHeight);
      const MAX = 2048;
      const scale = Math.min(1, MAX / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Crop canvas is unavailable.');

      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const encoded = await encodeCanvasForUpload(canvas, 0.9);
      const croppedUrl = await uploadImageBlob(encoded.blob);
      if (!croppedUrl) return;

      setEditing((prev) => {
        if (!prev) return prev;
        const images = [...prev.images];
        images[cropTarget.index] = croppedUrl;
        const imageUrls = prev.image_urls?.length ? [...prev.image_urls] : [];
        if (imageUrls.length) imageUrls[cropTarget.index] = croppedUrl;
        return { ...prev, images, image_urls: imageUrls.length ? imageUrls : images };
      });
      setSessionUploadedImageUrls((current) => {
        const next = new Set(current);
        next.add(croppedUrl);
        return next;
      });
      // The replaced image is left in storage until the user saves (pruned then)
      // or cancels (cleaned up) — cropping is not a destructive write before Save.
      setPreviewImg({ url: croppedUrl, index: cropTarget.index });
      setCropTarget(null);
      flash('Cropped image saved');
    } catch {
      flash('Crop failed. Try a newly uploaded image if this photo is from an older source.', false);
    } finally {
      setCropping(false);
    }
  }

  function updateCropRect(patch: Partial<CropRect>) {
    setCropRect((current) => {
      const width = Math.min(100, Math.max(10, patch.width ?? current.width));
      const height = Math.min(100, Math.max(10, patch.height ?? current.height));
      const x = Math.min(100 - width, Math.max(0, patch.x ?? current.x));
      const y = Math.min(100 - height, Math.max(0, patch.y ?? current.y));
      return { x, y, width, height };
    });
  }

  function startCropDrag(event: React.PointerEvent<HTMLElement>, mode: CropDragMode) {
    event.preventDefault();
    event.stopPropagation();
    const cropArea = event.currentTarget.closest('[data-crop-area="true"]') as HTMLElement | null;
    if (!cropArea) return;
    const bounds = cropArea.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = cropRect;

    event.currentTarget.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - startX) / bounds.width) * 100;
      const dy = ((moveEvent.clientY - startY) / bounds.height) * 100;
      const next = { ...startRect };

      if (mode.includes('e')) next.width = startRect.width + dx;
      if (mode.includes('s')) next.height = startRect.height + dy;
      if (mode.includes('w')) {
        next.x = startRect.x + dx;
        next.width = startRect.width - dx;
      }
      if (mode.includes('n')) {
        next.y = startRect.y + dy;
        next.height = startRect.height - dy;
      }
      if (mode === 'move') {
        next.x = startRect.x + dx;
        next.y = startRect.y + dy;
      }

      updateCropRect(next);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function removeImage(idx: number) {
    // Stage the removal in the draft only. Storage cleanup is deferred until the
    // user saves (the removed image is pruned then) or cancels (session uploads
    // are cleaned up), so no photo is deleted from storage before Save is clicked.
    setEditing((prev) => prev ? {
      ...prev,
      images: prev.images.filter((_, i) => i !== idx),
      image_urls: (prev.image_urls?.length ? prev.image_urls : prev.images).filter((_, i) => i !== idx),
    } : prev);
  }

  function moveImage(idx: number, direction: -1 | 1) {
    moveImageToIndex(idx, idx + direction);
  }

  function moveImageToIndex(idx: number, nextIndex: number) {
    setEditing((prev) => {
      if (!prev) return prev;
      if (nextIndex < 0 || nextIndex >= prev.images.length || nextIndex === idx) return prev;
      const images = [...prev.images];
      const [moved] = images.splice(idx, 1);
      images.splice(nextIndex, 0, moved);
      return { ...prev, images, image_urls: images };
    });
  }

  async function updateProductStatus(product: Product, status: ProductStatus) {
    const result = await adminUpdateProductStatus(product.id, status);
    if (!result.error) {
      const hasSoldPrice = Object.prototype.hasOwnProperty.call(result.soldPrices ?? {}, product.id);
      setProducts((prev) => prev.map((p) => p.id === product.id ? {
        ...p,
        status,
        ...(hasSoldPrice ? { sold_price: result.soldPrices?.[product.id] ?? null } : {}),
      } : p));
      setProductActionTarget((current) => current?.id === product.id ? {
        ...current,
        status,
        ...(hasSoldPrice ? { sold_price: result.soldPrices?.[product.id] ?? null } : {}),
      } : current);
      flash(`${product.title} marked ${getStatusLabel(status)}`);
      return;
    }
    flash(result.error, false);
  }

  async function updateProductImagePadding(product: Product, imagePadding: ProductImagePadding | string, imageIndex = imagePaddingTargetIndex) {
    const paddingValue = normalizeProductImagePaddingValue(imagePadding);
    const images = getProductImages(product);
    const image = images[imageIndex] ?? null;
    const key = productImagePaddingMapKey(image, imageIndex);
    const nextMap = {
      ...normalizeProductImagePaddingMap(product.image_padding_by_image),
      [key]: paddingValue,
    };
    const { error } = await supabase
      .from('products')
      .update({ image_padding_by_image: nextMap })
      .eq('id', product.id);

    if (!error) {
      const nextProduct = { ...product, image_padding_by_image: nextMap };
      setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, image_padding_by_image: nextMap } : p));
      setImagePaddingTarget(nextProduct);
      const builtInLabel = IMAGE_PADDING_OPTIONS.find((option) => option.value === paddingValue)?.label;
      flash(`Photo ${imageIndex + 1} padding set to ${builtInLabel ?? paddingValue}`);
      return true;
    }

    const message = error.message.includes('image_padding_by_image')
      ? 'Per-photo padding needs the updated Supabase image-padding SQL. Run supabase/product-image-padding.sql, then try again.'
      : error.message.includes('products_image_padding_check')
      ? 'Custom padding colors need the updated Supabase image-padding SQL. Run supabase/product-image-padding.sql, then try again.'
      : error.message;
    setImagePaddingNotice({ text: message, ok: false });
    flash(message, false);
    return false;
  }

  async function applyImagePaddingToAll(product: Product, paddingValue: ProductImagePadding | string) {
    const normalized = normalizeProductImagePaddingValue(paddingValue);
    const images = getProductImages(product);
    const nextMap: ProductImagePaddingMap = {};
    images.forEach((image, index) => {
      nextMap[productImagePaddingMapKey(image, index)] = normalized;
    });
    const { error } = await supabase
      .from('products')
      .update({ image_padding_by_image: nextMap })
      .eq('id', product.id);

    if (!error) {
      const nextProduct = { ...product, image_padding_by_image: nextMap };
      setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, image_padding_by_image: nextMap } : p));
      setImagePaddingTarget(nextProduct);
      const builtInLabel = IMAGE_PADDING_OPTIONS.find((option) => option.value === normalized)?.label;
      flash(`Padding set to ${builtInLabel ?? normalized} for all ${images.length} photos`);
      return true;
    }

    const message = error.message.includes('image_padding_by_image')
      ? 'Per-photo padding needs the updated Supabase image-padding SQL. Run supabase/product-image-padding.sql, then try again.'
      : error.message.includes('products_image_padding_check')
      ? 'Custom padding colors need the updated Supabase image-padding SQL. Run supabase/product-image-padding.sql, then try again.'
      : error.message;
    setImagePaddingNotice({ text: message, ok: false });
    flash(message, false);
    return false;
  }

  async function pickImagePaddingColorFromScreen() {
    if (!imagePaddingTarget) return;
    const selectedProduct = imagePaddingTarget;
    const selectedIndex = imagePaddingTargetIndexRef.current;
    const EyeDropper = (window as WindowWithEyeDropper).EyeDropper;
    if (!EyeDropper) {
      setImagePaddingNotice({
        text: 'This browser does not support screen color picking. Use the color swatch instead.',
        ok: false,
      });
      return;
    }

    try {
      const result = await new EyeDropper().open();
      const color = result.sRGBHex.toLowerCase();
      setImagePaddingCustomColor(color);
      const saved = await updateProductImagePadding(selectedProduct, color, selectedIndex);
      if (saved) setImagePaddingNotice({ text: `Photo ${selectedIndex + 1} padding set to ${color}.`, ok: true });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setImagePaddingNotice(null);
        return;
      }
      setImagePaddingNotice({
        text: error instanceof Error ? error.message : 'Color picking was cancelled.',
        ok: false,
      });
    }
  }

  function duplicateProduct(product: Product) {
    resetSpanishTranslation();
    const copyInventoryNumber = getNextInventoryNumber(products);
    const copyId = `${product.id}-copy-${copyInventoryNumber}`;
    const copy = {
      ...product,
      id: copyId,
      inventory_number: copyInventoryNumber,
      sku: null,
      slug: copyId,
      title: `${product.title} (Copy)`,
      title_es: product.title_es ? `${product.title_es} (Copia)` : null,
      status: 'draft' as ProductStatus,
      sort_order: products.length > 0 ? Math.max(...products.map(p => p.sort_order ?? 0)) + 1 : 1,
    };
    originalRef.current = null;
    setFormErrors([]);
    setQuickEntry('');
    setQuickAddMode(false);
    setShowAdvancedIds(false);
    setOpenEditorSections({ photos: false, video: false, ai: false, details: false, etsy: false, ebay: false, instagram: false, facebook: false });
    setInventoryNumberManual(false);
    const nextProductType = getProductJewelryType(product);
    setJewelryTypeInput(nextProductType);
    setChainTypeInput(productSupportsLinkType(nextProductType) ? getProductLinkType(product) : '');
    setLengthInput(getProductLength(product));
    setEditing(copy);
    setIsNew(true);
  }

  async function regenerateMissingSpanish() {
    if (!editing || translatingSpanish) return;

    const request = buildMissingSpanishCopyRequest(editing);
    if (request.targets.length === 0) {
      setSpanishTranslationNotice({
        text: 'Clear a Spanish field with matching English copy before regenerating.',
        ok: false,
      });
      return;
    }

    const requestId = ++spanishTranslationRequestRef.current;
    setTranslatingSpanish(true);
    setSpanishTranslationNotice(null);

    try {
      const response = await fetch('/api/admin/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request.body),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Spanish translation failed.');
      }
      if (requestId !== spanishTranslationRequestRef.current) return;

      const translatedTargets = translatedSpanishTargets(request.targets, data ?? {});
      if (translatedTargets.length === 0) {
        throw new Error('No Spanish copy was returned. Please try again.');
      }

      setEditing((current) => current
        ? mergeMissingSpanishCopy(current, request, data ?? {})
        : current);

      const missingCount = request.targets.length - translatedTargets.length;
      setSpanishTranslationNotice({
        text: missingCount > 0
          ? `Generated ${translatedTargets.length} Spanish ${translatedTargets.length === 1 ? 'field' : 'fields'}; ${missingCount} could not be generated.`
          : `Generated ${translatedTargets.length} Spanish ${translatedTargets.length === 1 ? 'field' : 'fields'}. Review them before saving.`,
        ok: missingCount === 0,
      });
    } catch (error) {
      if (requestId !== spanishTranslationRequestRef.current) return;
      setSpanishTranslationNotice({
        text: error instanceof Error ? error.message : 'Spanish translation failed.',
        ok: false,
      });
    } finally {
      if (requestId === spanishTranslationRequestRef.current) setTranslatingSpanish(false);
    }
  }

  // --- Save product ---
  async function handleSave(afterSave: 'stay' | 'another' | 'close' = 'close') {
    if (!editing || translatingSpanish) return;
    setSaving(true);

    // English now / Spanish on save: the listing AI generates English only, so
    // translate at save time. A Spanish field is (re)translated when it is EMPTY,
    // or — owner's "option (b)", 2026-09-02 — when its English counterpart CHANGED
    // during this edit while the Spanish was left untouched (e.g. the assistant
    // regenerated the English of an existing listing). Spanish the admin edited
    // by hand in this session is never overwritten. This now runs for existing
    // listings too; previously only brand-new ones were translated on save.
    let nextTitleEs = editing.title_es ?? null;
    let nextDescriptionEs = editing.description_es ?? null;
    let nextPublicNotesEs = editing.public_notes_es ?? null;
    const original = isNew ? null : originalRef.current;
    const text = (value: string | null | undefined) => (value ?? '').trim();
    const needsSpanish = (en: string | null | undefined, es: string | null | undefined, originalEn: string | null | undefined, originalEs: string | null | undefined) => {
      if (!text(en)) return false;
      if (!text(es)) return true;
      if (!original) return false;
      const englishChanged = text(en) !== text(originalEn);
      const spanishUntouched = text(es) === text(originalEs);
      return englishChanged && spanishUntouched;
    };
    const needTitleEs = needsSpanish(editing.title, editing.title_es, original?.title, original?.title_es);
    const needDescriptionEs = needsSpanish(editing.description, editing.description_es, original?.description, original?.description_es);
    const needNotesEs = needsSpanish(editing.public_notes, editing.public_notes_es, original?.public_notes, original?.public_notes_es);
    if (needTitleEs || needDescriptionEs || needNotesEs) {
      try {
        const res = await fetch('/api/admin/translate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: needTitleEs ? editing.title : '',
            description: needDescriptionEs ? editing.description : '',
            notes: needNotesEs ? editing.public_notes : '',
          }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data) {
          if (needTitleEs && data.title_es) nextTitleEs = data.title_es;
          if (needDescriptionEs && data.description_es) nextDescriptionEs = data.description_es;
          if (needNotesEs && data.notes_es) nextPublicNotesEs = data.notes_es;
        }
      } catch {
        // Non-blocking: if translation fails, the save proceeds with existing ES values.
      }
    }

    // Build tags with updated jt:, ct:, and len: entries
    const normalizedJewelryType = normalizeProductTypeValue(jewelryTypeInput) ?? 'Other';
    const supportsLinkType = productSupportsLinkType(normalizedJewelryType);
    const supportsLength = productUsesLength(normalizedJewelryType);
    const supportsSize = productUsesSize(normalizedJewelryType);
    const supportsHeight = productUsesHeight(normalizedJewelryType);
    const normalizedLinkType = supportsLinkType ? chainTypeInput.trim() : '';
    const normalizedLength = supportsLength || supportsSize || supportsHeight ? normalizeProductLengthSizeValue(lengthInput) : '';
    const normalizedWidthMm = supportsLinkType ? normalizeProductWidthMm(editing.width_mm) : null;
    if (supportsLinkType && editing.width_mm != null && normalizedWidthMm == null) {
      setFormErrors(['Width must be between 0.01 and 1000 millimeters.']);
      setSaving(false);
      return;
    }
    const normalizedMetalType = normalizeProductMetalType(editing.metal_type, editing.category);
    const legacyCategory = getLegacyCategoryForMetalType(normalizedMetalType, editing.category);
    const baseTags = (editing.tags ?? []).filter(t => !t.startsWith('jt:') && !t.startsWith('ct:') && !t.startsWith('len:'));
    const withJewelryType = normalizedJewelryType ? [...baseTags, `jt:${normalizedJewelryType}`] : baseTags;
    const withChain = normalizedLinkType ? [...withJewelryType, `ct:${normalizedLinkType}`] : withJewelryType;
    const finalTags = normalizedLength ? [...withChain, `len:${normalizedLength}`] : withChain;
    const normalizedManualPriceLabel = normalizeManualPriceLabel(editing.manual_price_label);
    const effectivePriceMode: Product['price_mode'] =
      quickAddMode || editing.price_mode === 'manual' || normalizedManualPriceLabel
        ? 'manual'
        : 'spot-multiplier';
    const normalizedQuantity = normalizeProductQuantity(editing.quantity);
    // One-directional auto-sync: saving a listing down to 0 units flips it to
    // Sold so the storefront and admin table reflect reality immediately. We
    // never auto-flip the other way (restocking a Sold item back to
    // Available) — an admin who marks something Sold on purpose (e.g. a
    // mistaken listing) shouldn't have that silently reversed by re-entering
    // a positive quantity; they can flip Status back explicitly.
    const baseStatus = normalizeProductStatus(editing.status);
    const resolvedStatus: ProductStatus =
      baseStatus === 'available' && normalizedQuantity <= 0 ? 'sold' : baseStatus;
    if (
      resolvedStatus === 'sold'
      && effectivePriceMode === 'spot-multiplier'
      && editing.sold_price == null
      && (!spotData || spotData.source === 'fallback')
    ) {
      setFormErrors(['Live metal pricing is unavailable, so this item cannot be saved as Sold with a reliable locked price.']);
      setSaving(false);
      return;
    }
    const priceDraft = {
      ...editing,
      price_mode: effectivePriceMode,
      manual_price_label: effectivePriceMode === 'manual' ? normalizedManualPriceLabel : null,
      pricing_multiplier: effectivePriceMode === 'manual' ? null : editing.pricing_multiplier ?? null,
      status: resolvedStatus,
    } as Product;
    const capturedSoldPrice = resolvedStatus === 'sold' && editing.sold_price == null
      ? getSnapshotPrice(priceDraft, spotData)
      : null;
    const resolvedSoldPrice = resolvedStatus === 'available'
      ? null
      : editing.sold_price ?? (capturedSoldPrice && capturedSoldPrice > 0
        ? Math.round((capturedSoldPrice + Number.EPSILON) * 100) / 100
        : null);

    const payload = {
      ...editing,
      id: editing.id || buildGeneratedProductId(editing),
      slug: editing.slug || editing.id || slugifyProductText(editing.title),
      inventory_number: parseInventoryNumber(editing.inventory_number),
      sku: editing.sku?.trim() || (editing.inventory_number ? String(editing.inventory_number) : null),
      category: legacyCategory,
      metal: normalizedMetalType,
      metal_type: normalizedMetalType,
      metal_variant: normalizeProductMetalVariant(editing.metal_variant, legacyCategory),
      purity: editing.purity ?? null,
      weight_grams: editing.weight_grams ?? null,
      gram_weight: editing.gram_weight ?? editing.weight_grams ?? null,
      brand: editing.brand?.trim() || null,
      product_type: normalizedJewelryType,
      jewelry_type: normalizedJewelryType,
      chain_type: normalizedLinkType || null,
      length: normalizedLength || null,
      width_mm: normalizedWidthMm,
      price_mode: effectivePriceMode,
      pricing_multiplier: effectivePriceMode === 'manual' ? null : editing.pricing_multiplier ?? null,
      sold_price: resolvedSoldPrice,
      manual_price_label: effectivePriceMode === 'manual' ? normalizedManualPriceLabel : null,
      asking_price: null,
      quantity: normalizedQuantity,
      // Keep only the field relevant to the chosen override mode; clear both
      // when the override is off so stale amounts/percents never resurface.
      special_price_override_mode: editing.special_price_override_enabled
        ? normalizeSpecialPriceOverrideMode(editing.special_price_override_mode)
        : 'amount',
      special_price_override_amount:
        editing.special_price_override_enabled &&
        normalizeSpecialPriceOverrideMode(editing.special_price_override_mode) === 'amount'
          ? editing.special_price_override_amount ?? null
          : null,
      special_price_override_percent:
        editing.special_price_override_enabled &&
        normalizeSpecialPriceOverrideMode(editing.special_price_override_mode) === 'percent'
          ? editing.special_price_override_percent ?? null
          : null,
      status: resolvedStatus,
      location: editing.location || 'showcase',
      item_year: normalizeProductItemYear(editing.item_year),
      image_urls: editing.images,
      image_padding: normalizeProductImagePaddingValue(editing.image_padding),
      image_padding_by_image: normalizeProductImagePaddingMap(editing.image_padding_by_image),
      tags: finalTags,
      details: [],
      details_es: [],
      title_es: nextTitleEs,
      description_es: nextDescriptionEs,
      public_notes_es: nextPublicNotesEs,
      internal_notes: foldExtraDetailsIntoInternalNotes(editing),
    };
    const originalProductId = originalRef.current?.id ?? payload.id;
    const originalImageUrls = originalRef.current
      ? [...(originalRef.current.images ?? []), ...(originalRef.current.image_urls ?? [])]
      : [];
    const errs = validate(payload, isNew ? undefined : originalProductId);
    if (errs.length) { setFormErrors(errs); setSaving(false); return; }
    setFormErrors([]);

    let nextProducts = products;
    let savedId: string | undefined;
    const productChanged = isNew || JSON.stringify(payload) !== JSON.stringify(originalRef.current);
    const videoChanged = productVideoEditorRef.current?.hasPendingChanges() ?? false;

    if (isNew) {
      // Don't use .select() on insert — `authenticated` no longer has SELECT on
      // internal product columns (cost_basis, minimum_price, internal_notes, …),
      // so returning the row would fail. `payload` already holds everything the
      // form entered, including the generated id, so use it optimistically (the
      // full row reloads via the service role on the next page load). (CODE-D04)
      let { error } = await supabase.from('products').insert(payload);
      if (isMissingOptionalColumnError(error)) {
        if (isMissingAcceptsOffersColumnError(error) && payload.accepts_offers === true) {
          flash('Run supabase/make-offer-2026-10.sql in Supabase before turning on offers.', false);
          setSaving(false);
          return;
        }
        if (isMissingWidthColumnError(error) && payload.width_mm != null) {
          flash('Run supabase/product-width-mm-2026-07.sql before saving a product width.', false);
          setSaving(false);
          return;
        }
        const retryPayload = isMissingWidthColumnError(error)
          ? withoutWidthColumn(payload)
          : withoutOptionalColumns(payload);
        const retry = await supabase.from('products').insert(retryPayload);
        error = retry.error;
      }
      if (error) { flash(error.message, false); setSaving(false); return; }
      const savedProduct = toAdminProductSummary(payload as unknown as Product);
      savedId = savedProduct.id;
      nextProducts = [savedProduct, ...products];
      setProducts(nextProducts);
    } else {
      // Skip the network call entirely if nothing changed.
      // Don't use .select().single() on update — RLS may allow UPDATE but not SELECT,
      // causing PGRST116 and blocking the modal from closing.
      savedId = originalProductId;
      if (productChanged) {
        let { error } = await supabase.from('products').update(payload).eq('id', originalProductId);
        if (isMissingOptionalColumnError(error)) {
          if (isMissingAcceptsOffersColumnError(error) && payload.accepts_offers === true) {
            flash('Run supabase/make-offer-2026-10.sql in Supabase before turning on offers.', false);
            setSaving(false);
            return;
          }
          if (isMissingWidthColumnError(error) && payload.width_mm != null) {
            flash('Run supabase/product-width-mm-2026-07.sql before saving a product width.', false);
            setSaving(false);
            return;
          }
          const retryPayload = isMissingWidthColumnError(error)
            ? withoutWidthColumn(payload)
            : withoutOptionalColumns(payload);
          const retry = await supabase.from('products').update(retryPayload).eq('id', originalProductId);
          error = retry.error;
        }
        if (error) { flash(error.message, false); setSaving(false); return; }
        const productSummary = toAdminProductSummary(payload as unknown as Product);
        nextProducts = products.map((p) => p.id === originalProductId ? productSummary : p);
        setProducts(nextProducts);
      }
    }

    // Revalidate + fire the marketplace hooks HERE, not after the video commit.
    //
    // The product row (status included) is already written by this point, so
    // every `return` below this line used to strand it: the shop cache kept
    // serving a sold item as available, and the Etsy/eBay auto-delist never
    // ran. The video-commit failure path immediately below is exactly that
    // hole — a video error would silently leave a sold piece live on both
    // marketplaces. Saving the product and announcing the save are separate
    // concerns; the announcement must not hinge on unrelated work succeeding.
    if (savedId) void adminRevalidateProduct(savedId);

    const videoResult = await productVideoEditorRef.current?.commit(payload.id, payload.images?.[0] ?? null);
    if (videoResult && !videoResult.ok) {
      if (isNew) {
        setIsNew(false);
        setEditing(payload as ReturnType<typeof emptyProduct>);
        originalRef.current = payload as ReturnType<typeof emptyProduct>;
      }
      setFormErrors([videoResult.error ?? 'Could not save the product video.']);
      setSaving(false);
      return;
    }

    // Reconcile storage on commit: delete every image this listing no longer
    // references — photos removed from the draft (originalImageUrls) and any
    // session uploads that didn't make it into the saved set — while keeping the
    // saved images and anything shared with other listings.
    const cleanupCandidates = [...originalImageUrls, ...sessionUploadedImageUrls];
    if (cleanupCandidates.length > 0) {
      await deleteProductImagesIfUnused(
        cleanupCandidates,
        originalProductId,
        nextProducts,
        [...(payload.images ?? []), ...(payload.image_urls ?? [])],
      );
    }
    setSessionUploadedImageUrls(new Set());

    flash(isNew ? 'Product added' : productChanged ? 'Product saved' : videoChanged ? 'Product video saved' : 'No changes to save');
    setSaving(false);

    if (afterSave === 'close') {
      closeModal();
    } else if (afterSave === 'another') {
      openAddFromProducts(nextProducts);
    } else {
      // 'stay' — update originalRef so no-op check is correct on next save
      originalRef.current = payload as ReturnType<typeof emptyProduct>;
      if (isNew) {
        setIsNew(false);
        setEditing(payload as ReturnType<typeof emptyProduct>);
      }
    }
  }

  // --- Delete product ---
  async function handleDelete() {
    if (!deleteTarget) return;

    const { count, error: orderLookupError } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', deleteTarget.id);

    if (orderLookupError && orderLookupError.code !== '42P01') {
      flash(orderLookupError.message, false);
      return;
    }

    if ((count ?? 0) > 0 && normalizeProductStatus(deleteTarget.status) !== 'archived') {
      const { error } = await supabase.from('products').update({ status: 'archived' }).eq('id', deleteTarget.id);
      if (error) { flash(error.message, false); return; }
      void adminRevalidateProduct(deleteTarget.id);
      setProducts((prev) => prev.map((p) => p.id === deleteTarget.id ? { ...p, status: 'archived' } : p));
      flash('Product has order history, so it was archived instead of deleted.');
      setDeleteTarget(null);
      return;
    }

    const fullDeleteTarget = await loadFullProduct(deleteTarget);
    if (!fullDeleteTarget) return;
    const deleteImageUrls = [...(fullDeleteTarget.images ?? []), ...(fullDeleteTarget.image_urls ?? [])];
    const videoDeleteResponse = await fetch(`/api/admin/product-video/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
    if (!videoDeleteResponse.ok) {
      const videoDeleteData = await videoDeleteResponse.json().catch(() => null);
      flash(videoDeleteData?.error ?? 'The product was not deleted because its Stream video could not be removed.', false);
      return;
    }
    const { error } = await supabase.from('products').delete().eq('id', deleteTarget.id);
    if (error) { flash(error.message, false); return; }
    void adminRevalidateProduct(deleteTarget.id);
    const nextProducts = products.filter((p) => p.id !== deleteTarget.id);
    setProducts(nextProducts);
    await deleteProductImagesIfUnused(deleteImageUrls, deleteTarget.id, nextProducts);
    flash('Product permanently deleted');
    setDeleteTarget(null);
  }

  const masterOrderedProducts = useMemo(() => getMasterProductOrder(products), [products]);

  // --- Filtered list ---
  const filtered = masterOrderedProducts.filter((p) => {
    const searchText = [
      p.title,
      p.brand,
      p.id,
      p.inventory_number,
      p.sku,
      getProductMetal(p),
      p.category,
      productMetalTypeLabel(p.metal_type, p.category),
      productMetalVariantLabel(p.metal_variant, p.category),
      productJewelryTypeLabel(getProductJewelryType(p)),
      p.purity ? `${p.purity}` : '',
      getProductLinkType(p),
      getProductLength(p),
    ].filter(Boolean).join(' ').toLowerCase();
    if (search && !searchText.includes(search.toLowerCase())) return false;
    const productStatus = normalizeProductStatus(p.status);
    if (!filterStatus && productStatus === 'archived') return false;
    if (filterStatus && filterStatus !== 'all' && productStatus !== filterStatus) return false;
    if (filterMetal === 'gold' && getProductMetalType(p) !== 'Gold') return false;
    if (filterMetal === 'silver' && getProductMetalType(p) !== 'Silver') return false;
    if (filterMetalVariant && getProductMetalVariant(p) !== filterMetalVariant) return false;
    if (filterCategory && getProductMetalType(p) !== filterCategory) return false;
    if (filterBrand && p.brand !== filterBrand) return false;
    if (filterGender && String(p.gender ?? '').toLowerCase() !== filterGender) return false;
    if (filterPurity && p.purity !== parseInt(filterPurity)) return false;
    if (filterLocation && (p.location ?? 'showcase') !== filterLocation) return false;
    if (filterFeatured === 'featured' && !p.featured) return false;
    if (filterFeatured === 'not-featured' && p.featured) return false;
    if (filterFeatured === 'offers-on' && p.accepts_offers !== true) return false;
    if (filterFeatured === 'offers-off' && p.accepts_offers === true) return false;
    if (filterJewelryType && getProductJewelryType(p) !== filterJewelryType) return false;
    if (filterChainType) {
      const kws = CHAIN_KEYWORDS[filterChainType];
      if (kws) {
        const txt = [getProductLinkType(p), ...(p.tags ?? [])].join(' ').toLowerCase();
        if (!kws.some(k => txt.includes(k))) return false;
      } else if (getProductLinkType(p) !== filterChainType) {
        return false;
      }
    }
    if (filterLength) {
      if (getProductLength(p) !== filterLength) return false;
    }
    return true;
  });

  const inventoryNumbers = useMemo(() => {
    return new Map(masterOrderedProducts.map((product, index) => [product.id, index + 1]));
  }, [masterOrderedProducts]);

  const sortedProducts = useMemo(() => {
    if (!sortConfig) return filtered;
    return filtered
      .map((product, index) => ({ product, index }))
      .sort((a, b) => {
        const compared = compareSortValues(
          getSortValue(a.product, sortConfig.key, spotData, inventoryNumbers),
          getSortValue(b.product, sortConfig.key, spotData, inventoryNumbers),
        );
        const stableCompared = compared || a.index - b.index;
        return sortConfig.direction === 'asc' ? stableCompared : -stableCompared;
      })
      .map(({ product }) => product);
  }, [filtered, inventoryNumbers, sortConfig, spotData]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIdSet.has(product.id)),
    [products, selectedProductIdSet],
  );
  const selectedProductIds = useMemo(() => selectedProducts.map((product) => product.id), [selectedProducts]);
  const selectedStatusProducts = useMemo(
    () => selectedProducts.map((product) => ({
      id: product.id,
      title: product.title,
      inventoryNumber: product.inventory_number,
    })),
    [selectedProducts],
  );
  const selectedVisibleCount = useMemo(
    () => sortedProducts.filter((product) => selectedProductIdSet.has(product.id)).length,
    [selectedProductIdSet, sortedProducts],
  );
  const allVisibleSelected = sortedProducts.length > 0 && selectedVisibleCount === sortedProducts.length;

  function setProductSelected(productId: string, selected: boolean) {
    setSelectedProductIdSet((current) => {
      const next = new Set(current);
      if (selected) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  function setAllVisibleSelected(selected: boolean) {
    setSelectedProductIdSet((current) => {
      const next = new Set(current);
      for (const product of sortedProducts) {
        if (selected) next.add(product.id);
        else next.delete(product.id);
      }
      return next;
    });
  }

  function chooseSelectedMarketplaceAction(action: SelectedMarketplaceAction) {
    setShowSelectedActionsModal(false);
    if (action === 'repair-etsy') {
      setShowEtsyRepairModal(true);
      return;
    }
    if (action === 'publish-etsy-ready') {
      setShowEtsyPublishModal(true);
      return;
    }
    if (action === 'publish-ready') {
      setShowEbayPublishModal(true);
      return;
    }
    if (selectedProductIds.length === 0) return;
    if (action === 'ebay-best-offer-on' || action === 'ebay-best-offer-off') {
      setEbayBestOfferBulk(action === 'ebay-best-offer-on');
      return;
    }
    if (action === 'site-offers-on' || action === 'site-offers-off') {
      void setSiteOffersForSelected(action === 'site-offers-on');
      return;
    }
    setSelectedStatusPostTarget(null);
    if (action === 'check-etsy' || action === 'check-ebay') {
      setSelectedStatusCheck(action === 'check-etsy' ? 'etsy' : 'ebay');
      return;
    }
    setSelectedBulkRun(action);
    if (action === 'ebay') setShowEbayBulkModal(true);
    else setShowEtsyBulkModal(true);
  }

  // Products -> select -> Actions -> "Set all accept offers" / "Set all no offers"
  // (owner, 2026-10-15): one write for every selected item, then the table's
  // Offers column follows at once. Open offers are left alone either way.
  async function setSiteOffersForSelected(enabled: boolean) {
    const productIds = [...selectedProductIds];
    try {
      const res = await fetch('/api/admin/offers/accepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds, enabled }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'Could not change the items.');
      const changed = new Set<string>((data.productIds as string[] | undefined) ?? productIds);
      setProducts((current) => current.map((product) => (
        changed.has(product.id) ? { ...product, accepts_offers: enabled } : product
      )));
      const openLeft = enabled ? 0 : [...changed].reduce((sum, id) => sum + (openOffersByProduct[id] ?? 0), 0);
      flash(bulkAcceptsOffersMessage(enabled, Number(data.updated ?? changed.size), openLeft));
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not change the items.', false);
    }
  }

  function postSelectedStatusProduct(productId: string, marketplace: 'etsy' | 'ebay') {
    if (!selectedProductIdSet.has(productId)) return;
    setSelectedStatusCheck(null);
    setSelectedStatusPostTarget({ productId, marketplace });
    setSelectedBulkRun(marketplace);
    if (marketplace === 'etsy') setShowEtsyBulkModal(true);
    else setShowEbayBulkModal(true);
  }

  // A field saved from the marketplace review window (length, brand, year…)
  // already hit the database; merge it into the table so the row does not
  // show the old value until the next full load. The editor drawer reloads
  // the full row on open (loadFullProduct), so a CLOSED drawer needs nothing.
  function mergeReviewEdit(productId: string, patch: ProductFieldEditPatch) {
    setProducts((current) => current.map((product) => (product.id === productId ? { ...product, ...patch } : product)));
  }

  // The same kind of save made from the Etsy/eBay panels INSIDE the open
  // drawer. The drawer's Save writes every field (and type, chain type and
  // length from their own inputs), so the saved value must land in the
  // drawer's state too — or the next Save would quietly put the old value
  // back. It also becomes the undo baseline and is applied to older undo
  // steps, so Undo cannot restore the pre-save value either. Other unsaved
  // edits in the form are left alone.
  function applyDrawerFieldEdit(productId: string, patch: ProductFieldEditPatch) {
    mergeReviewEdit(productId, patch);
    if (editing?.id !== productId) return;
    const blankInputs = { jewelryTypeInput: '', chainTypeInput: '', lengthInput: '' };
    undoStackRef.current = undoStackRef.current.map((snapshot) => applyFieldPatchToEditorState(snapshot, patch));
    if (originalRef.current) {
      originalRef.current = applyFieldPatchToEditorState({ editing: originalRef.current, ...blankInputs }, patch).editing;
    }
    skipUndoCaptureRef.current = true;
    setEditing((current) => (current && current.id === productId
      ? applyFieldPatchToEditorState({ editing: current, ...blankInputs }, patch).editing
      : current));
    if ('product_type' in patch) setJewelryTypeInput(patch.product_type ?? '');
    if ('chain_type' in patch) setChainTypeInput(patch.chain_type ?? '');
    if ('length' in patch) setLengthInput(patch.length ?? '');
  }

  function handleEtsyBulkClose(completed = false) {
    setShowEtsyBulkModal(false);
    void refreshEtsyChips();
    if (selectedStatusPostTarget?.marketplace === 'etsy') {
      setSelectedStatusPostTarget(null);
      setSelectedBulkRun(null);
      setSelectedStatusCheck('etsy');
      return;
    }
    if (selectedBulkRun === 'both' && completed) {
      setSelectedBulkRun('ebay');
      setShowEbayBulkModal(true);
      return;
    }
    if (selectedBulkRun) {
      setSelectedBulkRun(null);
      setSelectedProductIdSet(new Set());
    }
  }

  function handleEbayBulkClose(completed = false) {
    setShowEbayBulkModal(false);
    void refreshEbayChips();
    if (selectedStatusPostTarget?.marketplace === 'ebay') {
      setSelectedStatusPostTarget(null);
      setSelectedBulkRun(null);
      setSelectedStatusCheck('ebay');
      return;
    }
    if (selectedBulkRun && (completed || selectedBulkRun === 'ebay')) {
      setSelectedBulkRun(null);
      setSelectedProductIdSet(new Set());
    }
  }

  const productTableTotals = useMemo(() => {
    return sortedProducts.reduce(
      (totals, product) => {
        const meltValue = calcSpotMeltValue(product, spotData);
        if (meltValue != null && Number.isFinite(meltValue)) {
          totals.meltTotal += meltValue;
          totals.meltCount += 1;
        }

        const priceValue = getProductPriceValue(product, spotData);
        if (priceValue != null && Number.isFinite(priceValue)) {
          totals.priceTotal += priceValue;
          totals.priceCount += 1;
        }

        return totals;
      },
      { meltTotal: 0, meltCount: 0, priceTotal: 0, priceCount: 0 },
    );
  }, [sortedProducts, spotData]);

  function toggleSort(key: SortKey) {
    setSortConfig((current) => {
      if (!current || current.key !== key) return { key, direction: 'asc' };
      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  }

  const hasActiveTableFilters = !!(
    search ||
    filterStatus ||
    filterMetal ||
    filterMetalVariant ||
    filterPurity ||
    filterCategory ||
    filterBrand ||
    filterGender ||
    filterJewelryType ||
    filterChainType ||
    filterLength ||
    filterLocation ||
    filterFeatured
  );
  const activeDropdownFilterCount = [
    filterStatus,
    filterMetal,
    filterMetalVariant,
    filterPurity,
    filterCategory,
    filterBrand,
    filterGender,
    filterJewelryType,
    filterChainType,
    filterLength,
    filterLocation,
    filterFeatured,
  ].filter(Boolean).length;
  // Everything except Status lives behind the "More" toggle, so an active
  // filter could otherwise be hiding out of sight. This count is surfaced on
  // the toggle itself (owner request 2026-08-04).
  const activeHiddenFilterCount = [
    filterMetal,
    filterMetalVariant,
    filterPurity,
    filterCategory,
    filterBrand,
    filterGender,
    filterJewelryType,
    filterChainType,
    filterLength,
    filterLocation,
    filterFeatured,
  ].filter(Boolean).length;
  const activeMobileFilterCount = activeDropdownFilterCount + (search.trim() ? 1 : 0);
  const canDragReorder = !sortConfig && !hasActiveTableFilters && !reordering;
  const selectedFilterProductType = normalizeProductJewelryType(filterJewelryType);
  const adminSilverwareOnlyMetal = selectedFilterProductType === 'Silverware';
  const adminPurityOptions = filterMetal === 'silver' || filterCategory === 'Silver'
    ? SILVER_FILTER_PURITY_OPTIONS
    : filterMetal === 'gold' || filterCategory === 'Gold'
      ? GOLD_FILTER_PURITY_OPTIONS
      : [...GOLD_FILTER_PURITY_OPTIONS, ...SILVER_FILTER_PURITY_OPTIONS];
  const visibleAdminPurity = adminPurityOptions.some(([value]) => value === filterPurity) ? filterPurity : '';
  const showAdminLinkTypeFilter = productSupportsLinkType(selectedFilterProductType);
  const showAdminSizeFilter = productUsesSize(selectedFilterProductType);
  const scopedLengthSizeOptions = selectedFilterProductType === 'Necklace'
    ? [
        ['', 'All Lengths'],
        ['16', '16 in'],
        ['18', '18 in'],
        ['20', '20 in'],
        ['22', '22 in'],
        ['24', '24 in'],
        ['26', '26 in'],
        ['28', '28 in'],
        ['30', '30 in'],
      ]
    : selectedFilterProductType === 'Bracelet'
      ? [
        ['', 'All Lengths'],
        ['7', '7 in (bracelet)'],
        ['7.5', '7.5 in (bracelet)'],
        ['8', '8 in (bracelet)'],
      ]
    : showAdminSizeFilter
      ? [
          ['', 'All Sizes'],
          ['4', 'Size 4'],
          ['4.5', 'Size 4.5'],
          ['5', 'Size 5'],
          ['5.5', 'Size 5.5'],
          ['6', 'Size 6'],
          ['6.5', 'Size 6.5'],
          ['7', 'Size 7'],
          ['7.5', 'Size 7.5'],
          ['8', 'Size 8'],
          ['8.5', 'Size 8.5'],
          ['9', 'Size 9'],
          ['9.5', 'Size 9.5'],
          ['10', 'Size 10'],
          ['10.5', 'Size 10.5'],
          ['11', 'Size 11'],
          ['11.5', 'Size 11.5'],
          ['12', 'Size 12'],
          ['12.5', 'Size 12.5'],
          ['13', 'Size 13'],
        ]
      : [];

  function resetRowDrag() {
    setDraggedProductId(null);
    setDragTargetProductId(null);
  }

  // Drag auto-scroll (owner request 2026-08-04). The product table owns its own
  // scroll (page scroll is suppressed), so dragging a row toward — or past —
  // the top or bottom edge previously did nothing: the destination simply could
  // not be reached without dropping, scrolling, and dragging again. While a row
  // is being dragged, this pans the table whenever the pointer enters an edge
  // zone, accelerating to full speed once the pointer passes the edge entirely.
  //
  // The dragover listener is on the DOCUMENT, not the container: HTML5 drag
  // events fire on whatever element is under the pointer, so dragging above the
  // table (over the toolbar or off it) would never reach a container-scoped
  // listener — which is exactly the case the owner reported.
  useEffect(() => {
    if (!draggedProductId) return;
    const container = document.getElementById('admin-product-table-scroll');
    if (!container) return;

    const EDGE_ZONE_PX = 72;
    const MAX_SPEED_PX_PER_FRAME = 18;
    let pointerY: number | null = null;
    let frame = 0;

    const trackPointer = (event: DragEvent) => {
      pointerY = event.clientY;
    };

    const step = () => {
      if (pointerY != null) {
        const rect = container.getBoundingClientRect();
        // Intensity ramps 0 -> 1 across the edge zone and clamps at 1 beyond
        // the edge, so holding the pointer off the table scrolls at full speed.
        let delta = 0;
        if (pointerY < rect.top + EDGE_ZONE_PX) {
          const intensity = Math.min(1, (rect.top + EDGE_ZONE_PX - pointerY) / EDGE_ZONE_PX);
          delta = -Math.ceil(MAX_SPEED_PX_PER_FRAME * intensity);
        } else if (pointerY > rect.bottom - EDGE_ZONE_PX) {
          const intensity = Math.min(1, (pointerY - (rect.bottom - EDGE_ZONE_PX)) / EDGE_ZONE_PX);
          delta = Math.ceil(MAX_SPEED_PX_PER_FRAME * intensity);
        }
        if (delta !== 0) container.scrollTop += delta;
      }
      frame = requestAnimationFrame(step);
    };

    document.addEventListener('dragover', trackPointer);
    frame = requestAnimationFrame(step);

    return () => {
      document.removeEventListener('dragover', trackPointer);
      cancelAnimationFrame(frame);
    };
  }, [draggedProductId]);

  async function handleProductDrop(targetProduct: Product) {
    if (!draggedProductId || draggedProductId === targetProduct.id || !canDragReorder) {
      resetRowDrag();
      return;
    }

    const draggedProduct = products.find((product) => product.id === draggedProductId);
    if (!draggedProduct) {
      resetRowDrag();
      return;
    }

    if (normalizeProductStatus(draggedProduct.status) !== normalizeProductStatus(targetProduct.status)) {
      flash('Move items within the same status group. Change status first to move across groups.', false);
      resetRowDrag();
      return;
    }

    const statusGroup = masterOrderedProducts.filter((product) => normalizeProductStatus(product.status) === normalizeProductStatus(draggedProduct.status));
    const fromIndex = statusGroup.findIndex((product) => product.id === draggedProduct.id);
    const toIndex = statusGroup.findIndex((product) => product.id === targetProduct.id);
    if (fromIndex < 0 || toIndex < 0) {
      resetRowDrag();
      return;
    }

    const reorderedGroup = [...statusGroup];
    const [moved] = reorderedGroup.splice(fromIndex, 1);
    reorderedGroup.splice(toIndex, 0, moved);
    const orderById = new Map(reorderedGroup.map((product, index) => [product.id, index + 1]));

    setReordering(true);
    // UPDATE-only writes — a reorder must never be able to INSERT. The
    // previous implementation upserted {id, sort_order}: if any listed id had
    // gone stale (deleted in another tab/session since this page loaded), the
    // upsert's insert path tried to create a half-empty product row, and only
    // the NOT NULL constraint on title stopped it ("Reorder failed: null value
    // in column title", seen live 2026-08-04). With updates, a stale id is a
    // harmless no-op that we detect and report instead.
    const updates = reorderedGroup.map((product, index) => ({ id: product.id, sortOrder: index + 1 }));
    const UPDATE_CHUNK_SIZE = 15;
    let updateFailure: string | null = null;
    const updatedIds = new Set<string>();
    for (let start = 0; start < updates.length && !updateFailure; start += UPDATE_CHUNK_SIZE) {
      const chunk = updates.slice(start, start + UPDATE_CHUNK_SIZE);
      const results = await Promise.all(
        chunk.map((row) =>
          supabase.from('products').update({ sort_order: row.sortOrder }).eq('id', row.id).select('id'),
        ),
      );
      for (const [index, result] of results.entries()) {
        if (result.error) {
          updateFailure = result.error.message;
          break;
        }
        if (result.data && result.data.length > 0) updatedIds.add(chunk[index].id);
      }
    }
    if (updateFailure) {
      flash(`Reorder failed: ${updateFailure}`, false);
      setReordering(false);
      resetRowDrag();
      return;
    }

    setProducts((prev) =>
      prev.map((product) =>
        orderById.has(product.id)
          ? { ...product, sort_order: orderById.get(product.id)! }
          : product
      )
    );
    const staleCount = updates.length - updatedIds.size;
    flash(
      staleCount > 0
        ? `Inventory order saved. ${staleCount} listed item${staleCount === 1 ? ' no longer exists' : 's no longer exist'} in the database — reload the page to refresh this list.`
        : 'Inventory order saved',
    );
    setReordering(false);
    resetRowDrag();
  }

  const existingBrandOptions = Array.from(new Set(products.map((product) => product.brand?.trim()).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden" style={{ background: 'var(--color-background)' }}>

      <AdminHeader
        adminBasePath={adminBasePath}
        active="products"
        unreadMessagesCount={unreadMessagesCount}
        userEmail={userEmail}
        rightContent={(
          <>
          {spotData && (
            <span className="text-xs hidden md:flex items-center gap-2 flex-shrink-0"
              style={{ fontFamily: 'var(--font-label)' }}>
              <span className="font-bold" style={{ color: 'var(--color-primary)' }}>
                Au ${spotData.goldPerTroyOz.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              {spotData.silverPerTroyOz && (
                <span className="font-bold" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Ag ${spotData.silverPerTroyOz.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
              <span className="text-[0.58rem] font-normal" style={{ color: 'var(--color-on-surface-variant)' }}>
                /oz {spotData.source === 'fallback' ? '(ref)' : '(live)'}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="outline-button text-xs"
          >
            Sign Out
          </button>
          </>
        )}
      />

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden max-w-[1700px] 2xl:max-w-[2200px] mx-auto px-4 md:px-8 2xl:px-10 py-8">

        {/* Flash message */}
        {msg && (
          <div
            className="mb-6 px-4 py-3 text-sm font-medium"
            style={{
              background: msg.ok ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'color-mix(in srgb, var(--color-error) 12%, transparent)',
              color: msg.ok ? 'var(--color-primary)' : 'var(--color-error)',
              border: `1px solid ${msg.ok ? 'color-mix(in srgb, var(--color-primary) 30%, transparent)' : 'color-mix(in srgb, var(--color-error) 30%, transparent)'}`,
            }}
          >
            {msg.text}
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-3 flex flex-col gap-2 md:mb-5 md:gap-3">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <input
              type="search"
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-field hidden md:block md:min-w-48 md:flex-1"
            />
            <div className="flex w-full items-center gap-2 md:contents md:gap-3">
              <button type="button" onClick={openAdd} className="gold-button flex-shrink-0 text-sm">
                + Add Product
              </button>
              <button
                ref={mobileProductTableLauncherRef}
                id="open-mobile-product-table"
                type="button"
                onClick={() => {
                  closeActionMenu();
                  setShowMobileProductTable(true);
                }}
                className="gold-button min-w-0 flex-1 whitespace-nowrap md:!hidden"
                style={{ fontSize: '0.54rem', letterSpacing: '0.07em', paddingInline: '0.5rem', gap: '0.25rem' }}
                aria-haspopup="dialog"
                aria-controls="admin-product-table"
              >
                <AppIcon name="view_list" aria-hidden="true" style={{ width: '13px', height: '13px', flexShrink: 0 }} />
                Open Product Table
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowSelectedActionsModal(true)}
              className="outline-button inline-flex items-center gap-2 text-sm flex-shrink-0"
              aria-label={selectedProductIds.length > 0 ? `Actions for ${selectedProductIds.length} selected ${selectedProductIds.length === 1 ? 'product' : 'products'}` : 'Product actions'}
              title={selectedProductIds.length > 0 ? 'Actions for selected products' : 'Product actions'}
            >
              <AppIcon name="edit_note"  aria-hidden="true" style={{ fontSize: '17px', lineHeight: 1 }} />
              Actions{selectedProductIds.length > 0 ? ` (${selectedProductIds.length})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setShowTableFilters((current) => !current)}
              className="outline-button inline-flex items-center gap-2 text-sm flex-shrink-0"
              aria-expanded={showTableFilters}
              aria-controls="admin-product-table-filters"
              aria-label="Filters"
            >
              <AppIcon name="filter_list"  aria-hidden="true" style={{ fontSize: '17px', lineHeight: 1 }} />
              <span className="md:hidden">
                Filters{activeMobileFilterCount > 0 ? ` (${activeMobileFilterCount})` : ''}
              </span>
              <span className="hidden md:inline">
                Filters{activeDropdownFilterCount > 0 ? ` (${activeDropdownFilterCount})` : ''}
              </span>
            </button>
            <span className="ml-auto hidden text-xs md:inline"
              style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
              {filtered.length} / {products.length}
            </span>
          </div>

          {/* Filter dropdowns */}
          {showTableFilters && (
          <div
            id="admin-product-table-filters"
            className="flex flex-wrap gap-2 items-end border px-3 py-3"
            style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}
          >
            <input
              type="search"
              aria-label="Search products"
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-field w-full md:hidden"
            />
            {[
              {
                label: 'Gender', value: filterGender, set: setFilterGender,
                options: [['', 'All Genders'], ['unisex', 'Unisex'], ['men', 'Men'], ['women', 'Women']],
              },
              {
                label: 'Product Type', value: filterJewelryType, set: (value: string) => {
                  setFilterJewelryType(value);
                  setFilterChainType('');
                  setFilterLength('');
                  if (value === 'Silverware') {
                    setFilterMetal('silver');
                    setFilterCategory('Silver');
                    if (!SILVER_FILTER_PURITY_OPTIONS.some(([optionValue]) => optionValue === filterPurity)) {
                      setFilterPurity('');
                    }
                    if (!PRODUCT_METAL_VARIANTS.Silver.some((variant) => variant.value === filterMetalVariant)) {
                      setFilterMetalVariant('');
                    }
                  }
                },
                options: [['', 'All Product Types'], ...productTypeOptions.map((value) => [value, productJewelryTypeLabel(value)])],
              },
              {
                label: 'Brand', value: filterBrand, set: setFilterBrand,
                options: [['', 'All Brands'], ...existingBrandOptions.map((brand) => [brand, brand])],
              },
              {
                label: 'Metal', value: filterMetal, set: (value: string) => {
                  setFilterMetal(value);
                  if (value === 'silver' && !SILVER_FILTER_PURITY_OPTIONS.some(([optionValue]) => optionValue === filterPurity)) {
                    setFilterPurity('');
                  }
                  if (value === 'gold' && !GOLD_FILTER_PURITY_OPTIONS.some(([optionValue]) => optionValue === filterPurity)) {
                    setFilterPurity('');
                  }
                },
                options: adminSilverwareOnlyMetal
                  ? [['silver', 'Silver']]
                  : [['', 'All Metals'], ['gold', 'Gold'], ['silver', 'Silver']],
              },
              {
                label: 'Metal Type', value: filterCategory, set: (value: string) => {
                  setFilterCategory(value);
                  if (value === 'Silver' && !SILVER_FILTER_PURITY_OPTIONS.some(([optionValue]) => optionValue === filterPurity)) {
                    setFilterPurity('');
                  }
                  if (value === 'Gold' && !GOLD_FILTER_PURITY_OPTIONS.some(([optionValue]) => optionValue === filterPurity)) {
                    setFilterPurity('');
                  }
                },
                options: [['', 'All Metal Types'], ...PRODUCT_METAL_TYPES.map((metalType) => [metalType.value, metalType.label])],
              },
              {
                label: 'Metal Color', value: filterMetalVariant, set: setFilterMetalVariant,
                options: [
                  ['', 'All Colors'],
                  ...PRODUCT_METAL_VARIANTS.Gold.map((variant) => [variant.value, variant.label]),
                  ...PRODUCT_METAL_VARIANTS.Silver.map((variant) => [variant.value, variant.label]),
                ],
              },
              {
                label: 'Purity', value: visibleAdminPurity, set: setFilterPurity,
                options: [['', 'All Purities'], ...adminPurityOptions],
              },
              ...(showAdminLinkTypeFilter ? [
                {
                  label: 'Link Type', value: filterChainType, set: setFilterChainType,
                  options: [
                    ['', 'All Link Types'],
                    ['cuban-link', 'Cuban link'],
                    ['figaro-link', 'Figaro link'],
                    ['rope-chain', 'Rope chain'],
                    ['anchor-link', 'Anchor / Gucci'],
                    ['oval-link', 'Oval link'],
                    ['byzantine-link', 'Byzantine'],
                    ['box-link', 'Box link'],
                  ],
                },
              ] : []),
              ...(scopedLengthSizeOptions.length > 0 ? [
                {
                  label: showAdminSizeFilter ? 'Size' : 'Length',
                  value: filterLength,
                  set: (value: string) => setFilterLength(normalizeProductLengthSizeValue(value)),
                  options: scopedLengthSizeOptions,
                },
              ] : []),
              {
                label: 'Status', value: filterStatus, set: setFilterStatus,
                options: [
                  ['', 'All except Archived'],
                  ['all', 'All Statuses'],
                  ...STATUSES.map((status) => [status.value, status.label]),
                ],
              },
              {
                label: 'Location', value: filterLocation, set: setFilterLocation,
                options: [['', 'All Locations'], ...LOCATIONS.map((location) => [location.value, location.label])],
              },
              {
                label: 'Featured', value: filterFeatured, set: setFilterFeatured,
                options: [['', 'All Items'], ['featured', 'Featured'], ['not-featured', 'Not Featured'], ['offers-on', 'Offers on'], ['offers-off', 'Offers off']],
              },
            ]
              // Status is the everyday filter and stays visible; the rest are
              // revealed by the More toggle below (owner request 2026-08-04).
              .filter((control) => showMoreTableFilters || control.label === 'Status')
              .map(({ label, value, set, options }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[0.58rem] font-bold uppercase tracking-[0.14em]"
                  style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
                  {label}
                </span>
                <select
                  value={value}
                  onChange={(e) => (set as (v: string) => void)(e.target.value)}
                  className="form-field text-xs"
                  style={{ minWidth: 130 }}
                >
                  {options.map(([val, lbl]) => (
                    <option key={val} value={val}>{lbl}</option>
                  ))}
                </select>
              </div>
            ))}

            {/* More / Fewer toggle for the remaining filters. The count warns
                when a hidden filter is narrowing the table. */}
            <button
              type="button"
              onClick={() => setShowMoreTableFilters((open) => !open)}
              aria-expanded={showMoreTableFilters}
              aria-controls="admin-product-table-filters"
              className="outline-button flex items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              {showMoreTableFilters ? 'Fewer' : 'More'}
              {!showMoreTableFilters && activeHiddenFilterCount > 0 && ` (${activeHiddenFilterCount})`}
              <AppIcon
                name={showMoreTableFilters ? 'expand_less' : 'expand_more'}
                aria-hidden="true"
                style={{ fontSize: '15px' }}
              />
            </button>

            {/* Clear filters */}
            {(filterStatus || filterMetal || filterMetalVariant || filterPurity || filterCategory || filterBrand || filterGender || filterJewelryType || filterChainType || filterLength || filterLocation || filterFeatured) && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus('');
                  setFilterMetal('');
                  setFilterMetalVariant('');
                  setFilterPurity('');
                  setFilterCategory('');
                  setFilterBrand('');
                  setFilterGender('');
                  setFilterJewelryType('');
                  setFilterChainType('');
                  setFilterLength('');
                  setFilterLocation('');
                  setFilterFeatured('');
                }}
                className="hover-underline-grow text-xs font-bold uppercase tracking-wide self-end pb-1"
                style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
              >
                Clear
              </button>
            )}

          </div>
          )}
        </div>

        {/* Product table */}
        <div
          ref={mobileProductTableRef}
          id="admin-product-table"
          role={showMobileProductTable ? 'dialog' : undefined}
          aria-modal={showMobileProductTable ? true : undefined}
          aria-labelledby={showMobileProductTable ? 'mobile-product-table-title' : undefined}
          data-mobile-product-table={showMobileProductTable ? 'fullscreen' : 'inline'}
          className={showMobileProductTable
            ? 'fixed inset-0 z-[100] flex h-dvh w-screen min-h-0 flex-col overflow-hidden md:!hidden'
            : 'flex min-h-0 flex-1 flex-col border'}
          style={{
            borderColor: 'var(--color-outline-variant)',
            background: 'var(--color-surface-container-lowest)',
          }}
        >
          {showMobileProductTable && (
            <>
              <style>{`
                @media (max-width: 767px) {
                  #admin-product-table[data-mobile-product-table="fullscreen"] thead > tr > :nth-child(2),
                  #admin-product-table[data-mobile-product-table="fullscreen"] thead > tr > :nth-child(4),
                  #admin-product-table[data-mobile-product-table="fullscreen"] tfoot > tr > :nth-child(2),
                  #admin-product-table[data-mobile-product-table="fullscreen"] tfoot > tr > :nth-child(4) {
                    left: auto !important;
                  }

                  #admin-product-table[data-mobile-product-table="fullscreen"] tbody > tr > :nth-child(2),
                  #admin-product-table[data-mobile-product-table="fullscreen"] tbody > tr > :nth-child(4) {
                    position: static !important;
                  }

                  #admin-product-table[data-mobile-product-table="fullscreen"] thead > tr > :nth-child(3),
                  #admin-product-table[data-mobile-product-table="fullscreen"] tfoot > tr > :nth-child(3),
                  #admin-product-table[data-mobile-product-table="fullscreen"] tbody > tr > :nth-child(3) {
                    left: 36px !important;
                    border-right: 1px solid var(--color-outline-variant);
                    box-shadow: 5px 0 8px -7px rgba(0, 0, 0, 0.55);
                  }
                }
              `}</style>
              <div
                className="flex flex-shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
                style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}
              >
                <div className="min-w-0">
                  <h2
                    id="mobile-product-table-title"
                    className="text-sm font-bold uppercase tracking-[0.12em]"
                    style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-label)' }}
                  >
                    Product Table
                  </h2>
                  <p className="mt-0.5 text-[0.68rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                    Swipe sideways and vertically to view every field.
                  </p>
                </div>
                <button
                  ref={mobileProductTableCloseRef}
                  type="button"
                  onClick={() => {
                    closeActionMenu();
                    restoreMobileProductTableFocusRef.current = true;
                    setShowMobileProductTable(false);
                  }}
                  className="outline-button inline-flex flex-shrink-0 items-center gap-1.5 px-3 py-2 text-xs"
                  aria-label="Close product table"
                >
                  <AppIcon name="close" aria-hidden="true" style={{ fontSize: '16px', lineHeight: 1 }} />
                  Close
                </button>
              </div>
            </>
          )}
          <style>{`
            @media (min-width: 2100px) {
              #admin-product-table[data-mobile-product-table="inline"] #admin-product-table-grid {
                width: 100%;
              }

              #admin-product-table[data-mobile-product-table="inline"] .admin-product-brand-column {
                width: clamp(150px, 8vw, 220px);
                max-width: none;
              }
            }
          `}</style>
          <div
            className={`flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs max-md:px-3 max-md:py-1.5${showMobileProductTable ? ' max-h-20 overflow-y-auto' : ''}`}
            style={{
              borderColor: 'var(--color-outline-variant)',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-label)',
            }}
          >
            <span className="hidden md:inline">Drag the grip in the master list to reorder gallery inventory numbers.</span>
            {!canDragReorder && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilterStatus('');
                  setFilterMetal('');
                  setFilterMetalVariant('');
                  setFilterPurity('');
                  setFilterCategory('');
                  setFilterBrand('');
                  setFilterGender('');
                  setFilterJewelryType('');
                  setFilterChainType('');
                  setFilterLength('');
                  setFilterLocation('');
                  setFilterFeatured('');
                  setSortConfig(null);
                }}
                className="hover-underline-grow font-bold uppercase tracking-wide"
                style={{ color: 'var(--color-primary)' }}
              >
                Reset view to drag reorder
              </button>
            )}
            {reordering && (
              <span className="font-bold uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>
                Saving order...
              </span>
            )}
            <span className="ml-auto whitespace-nowrap md:hidden">
              {filtered.length} / {products.length}
            </span>
          </div>
          <div
            id="admin-product-table-scroll"
            tabIndex={0}
            aria-label="Scrollable product table"
            className="min-h-0 flex-1 overflow-auto overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}
          >
            <table id="admin-product-table-grid" className="w-max min-w-[1680px] 2xl:min-w-[1960px] text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-low)' }}>
                  <th
                    className="sticky left-0 top-0 z-40 w-[52px] min-w-[52px] max-w-[52px] px-3 py-3 text-xs font-bold uppercase tracking-wide whitespace-nowrap max-md:w-[36px] max-md:min-w-[36px] max-md:max-w-[36px] max-md:px-1"
                    style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)', background: 'var(--color-surface-container-low)' }}
                  >
                    <span className="flex flex-col items-center gap-1">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(node) => {
                          if (node) node.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
                        }}
                        onChange={(event) => setAllVisibleSelected(event.target.checked)}
                        onClick={(event) => event.stopPropagation()}
                        className="h-4 w-4 accent-[var(--color-primary)]"
                        aria-label="Select all visible products"
                        title="Select all visible products"
                      />
                      <span className="max-md:hidden">Order</span>
                    </span>
                  </th>
                  {PRODUCT_TABLE_COLUMNS.map(({ label, sortKey, widthClass, responsiveClass }) => {
                    const active = sortConfig?.key === sortKey;
                    const isActionsColumn = label === '';
                    const frozenLeftClass = PRODUCT_TABLE_FROZEN_LEFT_CLASSES[label];
                    return (
                      <th
                        key={label || 'actions'}
                        aria-sort={active ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                        className={`sticky top-0 px-2 py-3 text-xs font-bold uppercase tracking-wide whitespace-nowrap ${isActionsColumn || frozenLeftClass ? 'z-40' : 'z-30'} ${widthClass ?? ''}${responsiveClass ? ` ${responsiveClass}` : ''}${label === 'Brand' ? ' admin-product-brand-column text-center' : ''}${label === 'Title' ? ' border-r shadow-[4px_0_6px_-6px_rgba(0,0,0,0.45)]' : ''}${frozenLeftClass ? ` ${frozenLeftClass}` : ''}${isActionsColumn ? ' right-0' : ''}`}
                        style={{
                          color: 'var(--color-on-surface-variant)',
                          fontFamily: 'var(--font-label)',
                          borderColor: label === 'Title' ? 'var(--color-outline-variant)' : undefined,
                          background: 'var(--color-surface-container-low)',
                        }}
                      >
                        {sortKey ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(sortKey)}
                            className={`flex items-center gap-1 uppercase tracking-wide hover:opacity-75${label === 'Brand' ? ' mx-auto justify-center' : ''}`}
                            style={{ fontFamily: 'var(--font-label)' }}
                          >
                            <span>{label}</span>
                            <span
                              aria-hidden="true"
                              className="text-[0.65rem]"
                              style={{ color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}
                            >
                              {active ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                            </span>
                          </button>
                        ) : label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((p) => (
                  <tr key={p.id}
                    onClick={(event) => handleProductRowClick(event, p)}
                    draggable={canDragReorder}
                    onDragStart={(e) => {
                      if (!canDragReorder) return;
                      setDraggedProductId(p.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', p.id);
                    }}
                    onDragOver={(e) => {
                      if (!canDragReorder || !draggedProductId || draggedProductId === p.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragTargetProductId(p.id);
                    }}
                    onDragLeave={() => {
                      if (dragTargetProductId === p.id) setDragTargetProductId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleProductDrop(p);
                    }}
                    onDragEnd={resetRowDrag}
                    className="cursor-pointer border-b hover:bg-[color:var(--color-surface-container-low)] transition-colors"
                    style={{
                      borderColor: dragTargetProductId === p.id ? 'var(--color-primary)' : 'var(--color-outline-variant)',
                      background: dragTargetProductId === p.id
                        ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
                        : undefined,
                    }}>
                    <td
                      className="sticky left-0 z-20 w-[52px] min-w-[52px] max-w-[52px] whitespace-nowrap px-2 py-3 max-md:w-[36px] max-md:min-w-[36px] max-md:max-w-[36px] max-md:px-0.5"
                      style={{ background: dragTargetProductId === p.id ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-container-lowest))' : 'var(--color-surface-container-lowest)' }}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedProductIdSet.has(p.id)}
                          onChange={(event) => setProductSelected(p.id, event.target.checked)}
                          onClick={(event) => event.stopPropagation()}
                          className="h-4 w-4 accent-[var(--color-primary)]"
                          aria-label={`Select ${p.title}`}
                        />
                        <AppIcon name="drag_indicator"
                          data-product-drag-handle="true"
                          className="inline-flex h-6 w-8 items-center justify-center"
                          aria-hidden="true"
                          style={{
                            color: canDragReorder ? 'var(--color-primary)' : 'var(--color-outline-variant)',
                            cursor: canDragReorder ? 'grab' : 'not-allowed',
                            fontSize: '20px',
                            userSelect: 'none',
                          }}
                         />
                      </div>
                    </td>
                    <td className="sticky left-[52px] z-20 w-[54px] min-w-[54px] max-w-[54px] whitespace-nowrap px-2 py-3 text-xs font-bold max-md:left-[36px] max-md:px-1" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)', background: dragTargetProductId === p.id ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-container-lowest))' : 'var(--color-surface-container-lowest)' }}>
                      {formatInventoryNumberDisplay(p.inventory_number ?? inventoryNumbers.get(p.id))}
                    </td>
                    <td className="sticky left-[106px] z-20 w-16 min-w-16 max-w-16 p-0 max-md:left-[90px]" style={{ background: dragTargetProductId === p.id ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-container-lowest))' : 'var(--color-surface-container-lowest)' }}>
                      {getProductImages(p)[0] ? (
                        <button
                          type="button"
                          onClick={() => openProductActions(p)}
                          className="relative block h-16 w-16 cursor-pointer overflow-hidden outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-inset"
                          aria-label={`Open actions for ${p.title}`}
                          title="Open product actions"
                          style={{ background: productImagePaddingBackground(productImagePaddingForImage(p.image_padding, p.image_padding_by_image, getProductImages(p)[0], 0)) }}
                        >
                          <Image
                            src={getProductImages(p)[0]}
                            alt={p.title}
                            fill
                            sizes="64px"
                            className="object-contain object-center"
                            unoptimized={getProductImages(p)[0].startsWith('/assets/')}
                          />
                        </button>
                      ) : (
                        <div className="w-16 h-16 flex items-center justify-center text-xl"
                          style={{ background: 'var(--color-surface-container)' }}>📷</div>
                      )}
                    </td>
                    <td className="sticky left-[170px] z-20 w-[210px] min-w-[210px] max-w-[210px] border-r px-2 py-3 font-medium shadow-[4px_0_6px_-6px_rgba(0,0,0,0.45)] max-md:left-[154px] max-md:w-[160px] max-md:min-w-[160px] max-md:max-w-[160px]" style={{ color: 'var(--color-on-surface)', borderColor: 'var(--color-outline-variant)', background: dragTargetProductId === p.id ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-container-lowest))' : 'var(--color-surface-container-lowest)' }}>
                      <button
                        type="button"
                        onClick={() => openProductActions(p)}
                        className="hover-underline-grow line-clamp-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ color: 'var(--color-on-surface)' }}
                        aria-label={`Open actions for ${p.title}`}
                        title="Open product actions"
                      >
                        {p.title}
                      </button>
                    </td>
                    <td
                      className="admin-product-brand-column px-2 py-3 whitespace-nowrap w-[92px] max-w-[92px]"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      <span className="block truncate text-center">{p.brand || '-'}</span>
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {productMetalVariantLabel(p.metal_variant, p.category)}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {productJewelryTypeLabel(getProductJewelryType(p))}
                    </td>
                    <td className="hidden px-2 py-3 w-[118px] max-w-[118px] 2xl:table-cell" style={{ color: 'var(--color-on-surface-variant)' }}>
                      <span className="block truncate">{getProductLinkType(p) || '-'}</span>
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {getProductLength(p) || '-'}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {formatItemYear(p.item_year)}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-xs" style={{ color: p.featured ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}>
                      {p.featured ? 'Yes' : 'No'}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {p.purity
                        ? p.purity <= 24
                          ? `${p.purity}k`
                          : ({ 999:'99.9%', 950:'95%', 925:'92.5%', 900:'90%', 850:'85%', 800:'80%' } as Record<number,string>)[p.purity] ?? `${p.purity}`
                        : '-'}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {getProductWeight(p) ? `${getProductWeight(p)}g` : '-'}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap font-semibold" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {getSpotMeltDisplayPrice(p, spotData)}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {p.price_mode === 'manual' ? 'Manual' : `Spot ×${p.pricing_multiplier ?? '?'}`}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {getDisplayPrice(p, spotData)}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-xs">
                      {p.accepts_offers === true ? (
                        <span className="font-extrabold" style={{ color: 'var(--color-primary)' }}>On</span>
                      ) : (
                        <span style={{ color: 'var(--color-on-surface-variant)' }}>–</span>
                      )}
                      {(openOffersByProduct[p.id] ?? 0) > 0 && (
                        <a
                          href={`${adminBasePath}/offers`}
                          className="ml-1.5 inline-flex rounded-full px-1.5 py-px text-[0.6rem] font-extrabold"
                          style={{ background: '#b5890c', color: '#fff' }}
                          title="Open offers waiting for an answer"
                        >
                          {openOffersByProduct[p.id]} open
                        </a>
                      )}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <span
                        className="inline-flex text-[0.6rem] font-bold uppercase tracking-widest px-2 py-0.5"
                        style={{
                          background: getStatusTone(p.status).bg,
                          color: getStatusTone(p.status).fg,
                          border: 'none',
                        }}>
                        {getStatusLabel(p.status)}
                      </span>
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap font-semibold" style={{ color: normalizeProductQuantity(p.quantity) === 0 ? 'var(--color-error)' : 'var(--color-on-surface-variant)' }}>
                      {normalizeProductQuantity(p.quantity)}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <span
                        className="inline-flex text-[0.6rem] font-bold uppercase tracking-widest px-2 py-0.5"
                        style={{ background: etsyChipTone(etsyListingsByProduct[p.id]?.sync_state).bg, color: etsyChipTone(etsyListingsByProduct[p.id]?.sync_state).fg }}
                      >
                        {ETSY_CHIP_LABELS[etsyListingsByProduct[p.id]?.sync_state ?? 'pending'] ?? 'Not listed'}
                      </span>
                      <MarketplacePriceChip listing={etsyListingsByProduct[p.id]} />
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <span
                        className="inline-flex text-[0.6rem] font-bold uppercase tracking-widest px-2 py-0.5"
                        style={{ background: ebayChipTone(ebayListingsByProduct[p.id]?.sync_state).bg, color: ebayChipTone(ebayListingsByProduct[p.id]?.sync_state).fg }}
                      >
                        {ebayChipLabelWithOffer(
                          EBAY_CHIP_LABELS[ebayListingsByProduct[p.id]?.sync_state ?? 'pending'] ?? 'Not listed',
                          ebayListingsByProduct[p.id]?.sync_state,
                          ebayListingsByProduct[p.id]?.best_offer,
                        )}
                      </span>
                      <MarketplacePriceChip listing={ebayListingsByProduct[p.id]} />
                    </td>
                    <td className={`sticky right-0 px-1 max-md:px-0 py-3 w-[44px] min-w-[44px] max-w-[44px] max-md:w-[28px] max-md:min-w-[28px] max-md:max-w-[28px] ${actionMenuId === p.id ? 'z-30' : 'z-10'}`} style={{ background: dragTargetProductId === p.id ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-container-lowest))' : 'var(--color-surface-container-lowest)' }}>
                      <div className="relative flex justify-end">
                        <button
                          type="button"
                          onClick={(e) => toggleActionMenu(p.id, e.currentTarget)}
                          className="flex items-center justify-center rounded p-0.5 hover:bg-black/5"
                          style={{ color: 'var(--color-primary)' }}
                          aria-haspopup="menu"
                          aria-expanded={actionMenuId === p.id}
                          aria-label="Actions"
                        >
                          <AppIcon name={actionMenuId === p.id ? 'arrow_drop_up' : 'arrow_drop_down'} className="text-xl leading-none" aria-hidden="true" />
                        </button>
                        {/* Portaled to <body>: this cell is `sticky` with a z-index,
                            i.e. its own stacking context, so a `fixed` menu rendered
                            inside it sat BELOW the sticky header (z-40), the totals
                            footer and the frozen columns — "partially blocked" on the
                            owner's phone (2026-09-02). From <body> it rides above
                            everything, including the fullscreen mobile table (z-100). */}
                        {actionMenuId === p.id && actionMenuPos && typeof document !== 'undefined' && createPortal(
                          <>
                            {/* `cursor-pointer` is load-bearing on iOS: Safari does not
                                synthesize `click` for a plain div when the (React) listener
                                sits on <body>, which is where this portal lives — the
                                backdrop then swallowed taps without closing (owner,
                                2026-09-02: "can't re-close the menu"). ⛔ Close on `click`
                                ONLY: closing on pointerdown/touchend removes the backdrop
                                before the tap's click is dispatched, and that click then
                                lands on whatever sits underneath (a row title opens the
                                product actions) — the very fall-through being fixed. */}
                            <div
                              className="fixed inset-0 z-[190] cursor-pointer"
                              style={{ touchAction: 'manipulation' }}
                              // ⛔ stopPropagation is load-bearing: a portal still bubbles
                              // through the REACT tree, so this click would reach the
                              // row's onClick (handleProductRowClick → the product actions
                              // modal) — "tap the arrow again and the item options modal
                              // opens instead of closing the menu" (owner, 2026-09-02).
                              onClick={(event) => { event.stopPropagation(); closeActionMenu(); }}
                              aria-hidden="true"
                            />
                            <div
                              role="menu"
                              onClick={(event) => event.stopPropagation()}
                              className="fixed z-[200] flex min-w-[150px] flex-col overflow-hidden rounded-md border shadow-lg"
                              style={{
                                right: actionMenuPos.right,
                                ...(actionMenuPos.top != null ? { top: actionMenuPos.top } : { bottom: actionMenuPos.bottom }),
                                maxHeight: actionMenuPos.maxHeight,
                                overflowY: 'auto',
                                borderColor: 'var(--color-outline-variant)',
                                background: 'var(--color-surface-container-lowest)',
                                fontFamily: 'var(--font-label)',
                              }}
                            >
                              {renderProductActions(p, 'menu')}
                            </div>
                          </>,
                          document.body,
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedProducts.length === 0 && (
                  <tr>
                    <td colSpan={PRODUCT_TABLE_COLUMNS.length + 1} className="px-4 py-12 text-center text-sm"
                      style={{ color: 'var(--color-on-surface-variant)' }}>
                      No products found.
                    </td>
                  </tr>
                )}
              </tbody>
              {sortedProducts.length > 0 && (
                <tfoot>
                  <tr
                    className="border-t text-xs font-bold uppercase tracking-wide"
                    style={{
                      borderColor: 'var(--color-outline-variant)',
                      background: 'var(--color-surface-container)',
                      boxShadow: '0 -8px 18px -18px rgba(0,0,0,0.55)',
                    }}
                  >
                    <td
                      className="sticky bottom-0 left-0 z-30 w-[52px] min-w-[52px] max-w-[52px] px-2 py-3 max-md:w-[36px] max-md:min-w-[36px] max-md:max-w-[36px]"
                      style={{ background: 'var(--color-surface-container)' }}
                    />
                    <td
                      className="sticky bottom-0 left-[52px] z-30 w-[54px] min-w-[54px] max-w-[54px] px-2 py-3 max-md:left-[36px] max-md:px-1"
                      style={{ background: 'var(--color-surface-container)' }}
                    />
                    <td
                      className="sticky bottom-0 left-[106px] z-30 w-16 min-w-16 max-w-16 px-2 py-3 max-md:left-[90px]"
                      style={{ background: 'var(--color-surface-container)' }}
                    />
                    <td
                      className="sticky bottom-0 left-[170px] z-30 w-[210px] min-w-[210px] max-w-[210px] border-r px-2 py-3 shadow-[4px_0_6px_-6px_rgba(0,0,0,0.45)] max-md:left-[154px] max-md:w-[160px] max-md:min-w-[160px] max-md:max-w-[160px]"
                      style={{
                        color: 'var(--color-on-surface)',
                        borderColor: 'var(--color-outline-variant)',
                        background: 'var(--color-surface-container)',
                      }}
                    >
                      <span className="block truncate">Visible totals - {sortedProducts.length} rows</span>
                    </td>
                    <td className="admin-product-brand-column sticky bottom-0 px-2 py-3 w-[92px] max-w-[92px]" style={{ background: 'var(--color-surface-container)' }} />
                    <td className="sticky bottom-0 px-2 py-3" style={{ background: 'var(--color-surface-container)' }} />
                    <td className="sticky bottom-0 px-2 py-3" style={{ background: 'var(--color-surface-container)' }} />
                    <td className="sticky bottom-0 hidden px-2 py-3 w-[118px] max-w-[118px] 2xl:table-cell" style={{ background: 'var(--color-surface-container)' }} />
                    <td className="sticky bottom-0 px-2 py-3" style={{ background: 'var(--color-surface-container)' }} />
                    <td className="sticky bottom-0 px-2 py-3" style={{ background: 'var(--color-surface-container)' }} />
                    <td className="sticky bottom-0 px-2 py-3" style={{ background: 'var(--color-surface-container)' }} />
                    <td className="sticky bottom-0 px-2 py-3" style={{ background: 'var(--color-surface-container)' }} />
                    <td className="sticky bottom-0 px-2 py-3" style={{ background: 'var(--color-surface-container)' }} />
                    <td
                      className="sticky bottom-0 px-2 py-3 whitespace-nowrap font-semibold"
                      style={{ color: 'var(--color-on-surface)', background: 'var(--color-surface-container)' }}
                    >
                      {formatAdminTableTotal(productTableTotals.meltTotal, productTableTotals.meltCount)}
                    </td>
                    <td
                      className="sticky bottom-0 px-2 py-3 text-[0.65rem]"
                      style={{ color: 'var(--color-on-surface-variant)', background: 'var(--color-surface-container)' }}
                    >
                      Total
                    </td>
                    <td
                      className="sticky bottom-0 px-2 py-3 whitespace-nowrap font-semibold"
                      style={{ color: 'var(--color-primary)', background: 'var(--color-surface-container)' }}
                    >
                      {formatAdminTableTotal(productTableTotals.priceTotal, productTableTotals.priceCount)}
                    </td>
                    <td className="sticky bottom-0 px-2 py-3" style={{ background: 'var(--color-surface-container)' }} />
                    <td className="sticky bottom-0 px-2 py-3" style={{ background: 'var(--color-surface-container)' }} />
                    <td className="sticky bottom-0 px-2 py-3" style={{ background: 'var(--color-surface-container)' }} />
                    <td className="sticky bottom-0 px-2 py-3" style={{ background: 'var(--color-surface-container)' }} />
                    <td
                      className="sticky bottom-0 right-0 z-20 w-[44px] min-w-[44px] max-w-[44px] px-1 py-3 max-md:w-[28px] max-md:min-w-[28px] max-md:max-w-[28px] max-md:px-0"
                      style={{ background: 'var(--color-surface-container)' }}
                    />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Product quick-actions modal */}
      {productActionTarget && (() => {
        const images = getProductImages(productActionTarget);
        const coverImage = images[0] ?? null;
        const coverPadding = productImagePaddingForImage(
          productActionTarget.image_padding,
          productActionTarget.image_padding_by_image,
          coverImage,
          0,
        );
        const etsyState = etsyListingsByProduct[productActionTarget.id]?.sync_state ?? 'pending';
        const ebayState = ebayListingsByProduct[productActionTarget.id]?.sync_state ?? 'pending';
        const instagramState = instagramPostsByProduct[productActionTarget.id]?.sync_state ?? 'pending';
        const facebookState = facebookPostsByProduct[productActionTarget.id]?.sync_state ?? 'pending';
        const productMarketplaceBase = `${adminBasePath}/products/${encodeURIComponent(productActionTarget.id)}`;
        const marketplaceIconStyle = {
          fontSize: '18px',
          lineHeight: 1,
        };
        return (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 py-4 md:px-6 md:py-8"
            style={{ background: 'rgba(0,0,0,0.52)' }}
            onClick={() => setProductActionTarget(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-actions-title"
          >
            <div
              className="flex w-full max-w-3xl flex-col overflow-hidden border shadow-2xl"
              style={{ background: 'var(--color-background)', borderColor: 'var(--color-outline-variant)' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className="flex items-start justify-between gap-4 border-b px-4 py-3 md:px-5"
                style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}
              >
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
                    Item {formatInventoryNumberDisplay(productActionTarget.inventory_number ?? inventoryNumbers.get(productActionTarget.id))}
                  </p>
                  <h2 id="product-actions-title" className="mt-1 text-xl font-bold md:text-2xl" style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-headline)' }}>
                    {productActionTarget.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setProductActionTarget(null)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                  aria-label="Close product actions"
                  title="Close"
                >
                  <AppIcon name="close"  aria-hidden="true" />
                </button>
              </div>

              <div className="grid gap-4 p-4 md:grid-cols-[240px_1fr] md:p-5">
                <aside className="flex flex-col gap-4">
                  <button
                    type="button"
                    onClick={() => coverImage && setPreviewImg({ url: coverImage, index: 0, alt: productActionTarget.title })}
                    disabled={!coverImage}
                    className="relative aspect-square w-full overflow-hidden border text-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                    style={{
                      borderColor: 'var(--color-outline-variant)',
                      background: coverImage ? productImagePaddingBackground(coverPadding) : 'var(--color-surface-container)',
                    }}
                    aria-label={coverImage ? `View full-size image of ${productActionTarget.title}` : 'No product image'}
                    title={coverImage ? 'View full-size image' : 'No product image'}
                  >
                    {coverImage ? (
                      <Image
                        src={coverImage}
                        alt={productActionTarget.title}
                        fill
                        sizes="(max-width: 768px) 92vw, 240px"
                        className="object-contain object-center"
                        unoptimized={coverImage.startsWith('/assets/')}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                        No photo
                      </span>
                    )}
                  </button>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="border px-3 py-2" style={{ borderColor: 'var(--color-outline-variant)' }}>
                      <span className="block font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>Status</span>
                      <span style={{ color: 'var(--color-on-surface)' }}>{getStatusLabel(productActionTarget.status)}</span>
                    </div>
                    <div className="border px-3 py-2" style={{ borderColor: 'var(--color-outline-variant)' }}>
                      <span className="block font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>Qty</span>
                      <span style={{ color: 'var(--color-on-surface)' }}>{normalizeProductQuantity(productActionTarget.quantity)}</span>
                    </div>
                    <div className="border px-3 py-2" style={{ borderColor: 'var(--color-outline-variant)' }}>
                      <span className="block font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>Price</span>
                      <span style={{ color: 'var(--color-primary)' }}>{getDisplayPrice(productActionTarget, spotData)}</span>
                    </div>
                    <div className="border px-3 py-2" style={{ borderColor: 'var(--color-outline-variant)' }}>
                      <span className="block font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>Melt</span>
                      <span style={{ color: 'var(--color-on-surface)' }}>{getSpotMeltDisplayPrice(productActionTarget, spotData)}</span>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {renderProductActions(productActionTarget, 'modal')}
                  </div>
                </aside>

                <div className="flex min-w-0 flex-col gap-4">
                  <div className="grid gap-3">
                    <a
                      href={`${productMarketplaceBase}/etsy`}
                      className="flex items-center justify-between gap-4 border px-4 py-3 transition-colors hover:bg-[var(--color-surface-container)]"
                      style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)', color: 'var(--color-on-surface)' }}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <AppIcon name="shopping_bag" className="shrink-0" style={marketplaceIconStyle} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold uppercase tracking-wide" style={{ fontFamily: 'var(--font-label)' }}>Manage Etsy</span>
                          <span className="block truncate text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Preview, sync, tags, category, price, status</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className="inline-flex text-[0.6rem] font-bold uppercase tracking-widest px-2 py-0.5"
                          style={{ background: etsyChipTone(etsyState).bg, color: etsyChipTone(etsyState).fg }}
                        >
                          {ETSY_CHIP_LABELS[etsyState] ?? 'Not listed'}
                        </span>
                        <AppIcon name="chevron_right"  style={marketplaceIconStyle} aria-hidden="true" />
                      </span>
                    </a>

                    <a
                      href={`${productMarketplaceBase}/ebay`}
                      className="flex items-center justify-between gap-4 border px-4 py-3 transition-colors hover:bg-[var(--color-surface-container)]"
                      style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)', color: 'var(--color-on-surface)' }}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <AppIcon name="store" className="shrink-0" style={marketplaceIconStyle} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold uppercase tracking-wide" style={{ fontFamily: 'var(--font-label)' }}>Manage eBay</span>
                          <span className="block truncate text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Preview, sync, publish, price, status, delist</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className="inline-flex text-[0.6rem] font-bold uppercase tracking-widest px-2 py-0.5"
                          style={{ background: ebayChipTone(ebayState).bg, color: ebayChipTone(ebayState).fg }}
                        >
                          {ebayChipLabelWithOffer(
                            EBAY_CHIP_LABELS[ebayState] ?? 'Not listed',
                            ebayState,
                            ebayListingsByProduct[productActionTarget.id]?.best_offer,
                          )}
                        </span>
                        <AppIcon name="chevron_right"  style={marketplaceIconStyle} aria-hidden="true" />
                      </span>
                    </a>

                    <a
                      href={`${productMarketplaceBase}/instagram`}
                      className="flex items-center justify-between gap-4 border px-4 py-3 transition-colors hover:bg-[var(--color-surface-container)]"
                      style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)', color: 'var(--color-on-surface)' }}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <AppIcon name="photo_camera" className="shrink-0" style={marketplaceIconStyle} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold uppercase tracking-wide" style={{ fontFamily: 'var(--font-label)' }}>Manage Instagram</span>
                          <span className="block truncate text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Preview caption, prepare images, queue, publish</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className="inline-flex text-[0.6rem] font-bold uppercase tracking-widest px-2 py-0.5"
                          style={{ background: instagramChipTone(instagramState).bg, color: instagramChipTone(instagramState).fg }}
                        >
                          {INSTAGRAM_CHIP_LABELS[instagramState] ?? 'Not posted'}
                        </span>
                        <AppIcon name="chevron_right"  style={marketplaceIconStyle} aria-hidden="true" />
                      </span>
                    </a>

                    <a
                      href={`${productMarketplaceBase}/facebook`}
                      className="flex items-center justify-between gap-4 border px-4 py-3 transition-colors hover:bg-[var(--color-surface-container)]"
                      style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)', color: 'var(--color-on-surface)' }}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <AppIcon name="favorite" className="shrink-0" style={marketplaceIconStyle} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold uppercase tracking-wide" style={{ fontFamily: 'var(--font-label)' }}>Manage Facebook</span>
                          <span className="block truncate text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Preview post, prepare images, queue, publish</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className="inline-flex text-[0.6rem] font-bold uppercase tracking-widest px-2 py-0.5"
                          style={{ background: facebookChipTone(facebookState).bg, color: facebookChipTone(facebookState).fg }}
                        >
                          {FACEBOOK_CHIP_LABELS[facebookState] ?? 'Not posted'}
                        </span>
                        <AppIcon name="chevron_right"  style={marketplaceIconStyle} aria-hidden="true" />
                      </span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit / Add Modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex overflow-x-hidden md:items-start md:justify-center md:overflow-y-auto md:py-8 md:px-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div
            // Mobile: pinned edge-to-edge with zero horizontal wiggle room, and sized
            // to the "small" viewport height (the guaranteed-visible area with the
            // browser's address bar / bottom toolbar fully expanded) rather than the
            // dynamic one — dvh grows as soon as the toolbar auto-hides, so a modal
            // sized to it can end up taller than the space that's actually visible
            // the instant the toolbar reappears, letting it cover the footer's Save
            // buttons for a moment. Sizing to svh instead means the footer is always
            // inside the guaranteed-safe area, at the cost of a little unused space
            // on the rare frame where the toolbar happens to be hidden.
            className="w-full max-w-[100vw] h-svh md:h-auto md:max-w-5xl border flex flex-col overflow-hidden product-editor-modal md:rounded-[8px]"
            style={{ background: '#f7f8fc', borderColor: '#d9deef' }}
          >
            {/* Modal header. Phones: one slim line — title + ✕ Close, no eyebrow —
                so it stops eating the top of a small screen (owner, 2026-09-02).
                Desktop keeps the eyebrow and the large title. */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b md:items-start md:px-7 md:py-5"
              style={{ borderColor: '#dfe3f0', background: '#fbfbff' }}>
              <div>
                <p className="max-md:hidden text-[0.66rem] font-bold uppercase tracking-[0.24em]" style={{ color: '#7a7391', fontFamily: 'var(--font-label)' }}>
                  Dashboard
                </p>
                <h2 className="text-lg font-bold md:mt-2 md:text-3xl" style={{ fontFamily: 'var(--font-headline)', color: '#111827', letterSpacing: 0 }}>
                  {isNew ? 'New listing' : 'Edit listing'}
                </h2>
              </div>
              <button type="button" onClick={requestCloseEditor}
                className="text-sm font-bold uppercase tracking-wide"
                style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                ✕ Close
              </button>
            </div>

            <div
              ref={editorBodyRef}
              onScroll={handleEditorBodyScroll}
              className="product-editor-body p-4 md:p-7 flex flex-col gap-4 md:gap-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0"
            >

              {/* Photos */}
              <div
                className="product-editor-panel product-editor-photos-panel"
                style={{ background: '#edf6ff', borderColor: '#cddff5' }}
                data-collapsed={openEditorSections.photos ? 'false' : 'true'}
              >
                <div className="editor-collapse-header flex items-start gap-3" role="button" tabIndex={0}
                  aria-expanded={openEditorSections.photos}
                  onClick={() => toggleEditorSection('photos')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEditorSection('photos'); } }}>
                  <div>
                    <h3 className="product-editor-section-title">Photos</h3>
                    <p className={`product-editor-section-copy${openEditorSections.photos ? '' : ' hidden'}`}>Add clear photos. The first image is the cover image and gives the AI assistant visual context.</p>
                  </div>
                  <span className="ml-auto self-center" aria-hidden="true">
                    <AppIcon name={openEditorSections.photos ? 'expand_less' : 'expand_more'}  style={{ color: '#db2777' }} />
                  </span>
                </div>
                <label
                  className="product-photo-dropzone"
                  style={{
                    borderColor: dragOver ? '#d8b13f' : '#c8d0ec',
                    color: dragOver ? '#8a6d00' : '#1f2937',
                    background: dragOver ? 'rgba(216,177,63,0.08)' : 'rgba(255,255,255,0.72)',
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files);
                  }}
                >
                  <input type="file" accept="image/*" multiple className="sr-only"
                    onChange={(e) => e.target.files && handleImageUpload(e.target.files)} />
                  <AppIcon name="add_photo_alternate" className="product-photo-dropzone-icon" aria-hidden="true" />
                  <strong>{uploading ? 'Uploading...' : 'Drag and drop, or click to choose from library'}</strong>
                  <span>{editing.images.length}/20 photos · JPG, PNG, WebP · compressed automatically</span>
                </label>
                <label className="product-photo-take-button">
                  <input type="file" accept="image/*" capture="environment" className="sr-only"
                    onChange={(e) => e.target.files && handleImageUpload(e.target.files)} />
                  <AppIcon name="photo_camera"  aria-hidden="true" />
                  Take photos
                </label>

                {/* Uploaded photo gallery — click to preview & crop, drag to reorder */}
                {editing.images.length > 0 && (
                  <div>
                    <p className="text-[0.62rem] mb-2" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                      {editing.images.length} {editing.images.length === 1 ? 'photo' : 'photos'} · Click to preview &amp; crop · Drag to reorder · First is the cover
                    </p>
                    <div className="product-photo-gallery">
                      {editing.images.map((img, i) => (
                        <div
                          key={img + i}
                          draggable
                          onDragStart={() => setDragSrcIdx(i)}
                          onDragEnter={(e) => { e.preventDefault(); setDragOverIdx(i); }}
                          onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
                          onDragLeave={() => setDragOverIdx(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (dragSrcIdx === null || dragSrcIdx === i) { setDragSrcIdx(null); setDragOverIdx(null); return; }
                            moveImageToIndex(dragSrcIdx, i);
                            setDragSrcIdx(null);
                            setDragOverIdx(null);
                          }}
                          onDragEnd={() => { setDragSrcIdx(null); setDragOverIdx(null); }}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button')) return;
                            setPreviewImg({ url: img, index: i });
                          }}
                          className="product-photo-thumb group"
                          style={{
                            opacity: dragSrcIdx === i ? 0.4 : 1,
                            outline: dragOverIdx === i && dragSrcIdx !== i ? '2px solid var(--color-primary)' : undefined,
                            outlineOffset: '2px',
                          }}
                        >
                          {i === 0 && <div className="product-photo-cover-badge">Cover</div>}
                          <Image src={img} alt="" fill sizes="120px" className="object-cover"
                            unoptimized={img.startsWith('/assets/')} />
                          {editing.images.length > 1 && (
                            <div className="product-photo-reorder-controls" aria-label={`Reorder photo ${i + 1}`}>
                              <button
                                type="button"
                                onClick={() => moveImage(i, -1)}
                                className="product-photo-reorder-button"
                                disabled={i === 0}
                                title="Move earlier"
                                aria-label={`Move photo ${i + 1} earlier`}
                              >
                                <AppIcon name="chevron_left"  aria-hidden="true" />
                              </button>
                              <span className="product-photo-order-count">{i + 1}</span>
                              <button
                                type="button"
                                onClick={() => moveImage(i, 1)}
                                className="product-photo-reorder-button"
                                disabled={i === editing.images.length - 1}
                                title="Move later"
                                aria-label={`Move photo ${i + 1} later`}
                              >
                                <AppIcon name="chevron_right"  aria-hidden="true" />
                              </button>
                            </div>
                          )}
                          <div className="product-photo-thumb-overlay">
                            <button
                              type="button"
                              onClick={() => setPreviewImg({ url: img, index: i })}
                              className="product-photo-thumb-action"
                              title="Preview & crop"
                              aria-label="Preview and crop"
                            >
                              <AppIcon name="crop"  aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeImage(i)}
                              className="product-photo-thumb-action is-danger"
                              title="Remove"
                              aria-label="Remove photo"
                            >
                              <AppIcon name="delete"  aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <ProductVideoEditor
                ref={productVideoEditorRef}
                productId={editing.id || 'new-product'}
                loadExisting={!isNew}
                collapsed={!openEditorSections.video}
                onToggle={() => toggleEditorSection('video')}
              />

              {/* AI Listing Assistant */}
              <div
                className="product-editor-panel relative overflow-hidden"
                style={{ background: '#fff1f7', borderColor: '#f5c5d6' }}
                data-collapsed={openEditorSections.ai ? 'false' : 'true'}
              >
                {aiRecording && (
                  <div className="ai-recording-pop" role="status">
                    <span className="ai-recording-orb">
                      <AppIcon name="mic"  aria-hidden="true" />
                    </span>
                    <span className="ai-recording-bars" aria-hidden="true">
                      <span></span><span></span><span></span><span></span>
                    </span>
                    Recording
                  </div>
                )}
                <div className="editor-collapse-header flex flex-wrap items-start justify-between gap-3" role="button" tabIndex={0}
                  aria-expanded={openEditorSections.ai}
                  onClick={() => toggleEditorSection('ai')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEditorSection('ai'); } }}>
                  <div className="flex items-start gap-3">
                    <div>
                      <h3 className="product-editor-section-title">Smart listing assistant</h3>
                      <p className={`product-editor-section-copy${openEditorSections.ai ? '' : ' hidden'}`}>
                        Fills the form from the photos and your notes. Clear anything wrong, add the correction below, and run it again.
                      </p>
                    </div>
                  </div>
                  <span className="self-center" aria-hidden="true">
                    <AppIcon name={openEditorSections.ai ? 'expand_less' : 'expand_more'}  style={{ color: '#8b7cf6' }} />
                  </span>
                </div>

                {editing.images.length === 0 ? (
                  <div
                    className="px-4 py-3 text-sm"
                    style={{
                      border: '1px solid #f4b7aa',
                      background: '#fff8f5',
                      color: '#b42318',
                      borderRadius: '8px',
                    }}
                  >
                    Add at least one photo above to generate a listing.
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => { if (aiRecording) { stopAiRecording(); } else { setShowMicPrompt(true); } }}
                  className={aiRecording ? 'ai-talk-button ai-talk-button-recording' : 'ai-talk-button'}
                >
                  <AppIcon name={aiRecording ? 'stop_circle' : 'mic'}  aria-hidden="true" />
                  {aiRecording ? 'Listening... tap to stop' : aiUndoSnapshot ? 'Tap to speak a correction' : "Let's begin - tap here to talk"}
                </button>

                <textarea
                  className="form-field w-full text-sm min-h-[96px]"
                  placeholder={aiUndoSnapshot
                    ? 'Corrections or new details: the weight is 4.2 grams, it is 18K not 14K, shorten the title...'
                    : 'Describe the item: marked 14K, 25.3 grams, Omega watch, light wear, box clasp, 7.5 inch bracelet...'}
                  value={[aiTranscript, aiInterimText].filter(Boolean).join(' ')}
                  onChange={(event) => { setAiTranscript(event.target.value); setAiInterimText(''); }}
                />

                <button
                  type="button"
                  onClick={generateAiDraft}
                  disabled={aiGenerating || editing.images.length === 0}
                  className="gold-button text-xs disabled:opacity-50 w-full justify-center"
                >
                  {aiGenerating ? 'Filling the form...' : aiUndoSnapshot ? 'Update Listing' : 'Generate Listing'}
                </button>

                {aiNotice && (
                  <div
                    className="px-3 py-2 text-xs font-medium"
                    role="status"
                    style={{
                      background: aiNotice.ok ? 'color-mix(in srgb, #166534 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                      border: `1px solid ${aiNotice.ok ? 'color-mix(in srgb, #166534 30%, transparent)' : 'color-mix(in srgb, var(--color-error) 28%, transparent)'}`,
                      color: aiNotice.ok ? '#166534' : 'var(--color-error)',
                      fontFamily: 'var(--font-label)',
                    }}
                  >
                    {aiNotice.text}
                  </div>
                )}

                <AiNotes notes={aiNotes} canUndo={Boolean(aiUndoSnapshot)} onUndo={undoAiFill} />
              </div>

              {/* Quick Fill — removed from UI. Flip SHOW_QUICK_FILL to restore. */}
              {SHOW_QUICK_FILL && (
              <div
                className="product-editor-panel product-editor-quick-panel"
                style={{
                  background: '#fffaf0',
                  borderColor: '#ead9af',
                }}
              >
                <div className="flex items-start gap-3">
                  <div>
                    <h3 className="product-editor-section-title">Quick Fill</h3>
                    <p className="product-editor-section-copy">Paste structured field text from the formatting prompt, then apply it to the form.</p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <textarea
                    className="form-field flex-1 text-sm min-h-[44px]"
                    placeholder="Title English:..., Brand:Omega, Jewelry Type:Watch, Metal Color:Bicolor Gold, Status:Available, Purity:14k, Weight:25.3g"
                    rows={2}
                    value={quickEntry}
                    onChange={(e) => setQuickEntry(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); applyQuickEntry(); } }}
                  />
                  <button
                    type="button"
                    onClick={applyQuickEntry}
                    className="gold-button text-xs flex-shrink-0"
                  >
                    Apply
                  </button>
                </div>
                {quickFillNotice && (
                  <div
                    className="px-3 py-2 text-xs font-medium"
                    role="status"
                    style={{
                      background: quickFillNotice.ok ? 'color-mix(in srgb, #166534 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                      border: `1px solid ${quickFillNotice.ok ? 'color-mix(in srgb, #166534 30%, transparent)' : 'color-mix(in srgb, var(--color-error) 28%, transparent)'}`,
                      color: quickFillNotice.ok ? '#166534' : 'var(--color-error)',
                      fontFamily: 'var(--font-label)',
                    }}
                  >
                    {quickFillNotice.text}
                  </div>
                )}
                <div
                  className="text-[0.62rem] leading-relaxed p-3"
                  style={{
                    color: 'var(--color-on-surface-variant)',
                    fontFamily: 'var(--font-label)',
                    background: 'color-mix(in srgb, var(--color-surface) 70%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-outline-variant) 75%, transparent)',
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-bold uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>
                      Prompt for AI formatting
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={copyQuickFillPrompt}
                        className="outline-button text-[0.58rem] px-2 py-1"
                      >
                        Copy Prompt
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowQuickFillPrompt(true)}
                        className="outline-button text-[0.58rem] px-2 py-1"
                      >
                        View AI Prompt
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[0.6rem] leading-relaxed hidden" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                  Paste comma values, Field:Value pairs, or a two-line CSV header/value list. Labeled fields can be in any order; unlabeled CSV rows use the form order. Only include what differs from the defaults.
                  Recognized tokens: <strong>Category</strong> (Gold / Silver) · <strong>Status</strong> (Draft / Available / Pending Payment / Sold / Archived) ·&nbsp;
                  <strong>Jewelry Type</strong> (Necklace / Bracelet / Ring / Pendant / Earrings / Watch) ·&nbsp;
                  <strong>Link Type</strong> (Cuban link / Figaro link / Rope chain / etc.) ·&nbsp;
                  <strong>Length/Size</strong> (22in / 7.5in / ring size 7) ·&nbsp;
                  <strong>Price Mode</strong> (Spot / Manual) ·&nbsp;
                  <strong>Purity</strong> (18k / 14k / 10k / 925) ·&nbsp;
                  <strong>Weight</strong> (25.3g) ·&nbsp;
                  <strong>Multiplier</strong> (1.25x). Field labels can also target Title English, Title Spanish, Location, Price Label, Description English, Description Spanish, Notes (EN), and Notes (ES).
                </p>
              </div>
              )}

              {/* Listing details — modern card matching the panels above */}
              <div className="product-editor-panel product-editor-fields-panel" data-collapsed={openEditorSections.details ? 'false' : 'true'}>
                <div className="editor-collapse-header flex items-start gap-3" role="button" tabIndex={0}
                  aria-expanded={openEditorSections.details}
                  onClick={() => toggleEditorSection('details')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEditorSection('details'); } }}>
                  <div>
                    <h3 className="product-editor-section-title">Listing details</h3>
                    <p className={`product-editor-section-copy${openEditorSections.details ? '' : ' hidden'}`}>Review and fine-tune everything before saving.</p>
                  </div>
                  <span className="ml-auto self-center" aria-hidden="true">
                    <AppIcon name={openEditorSections.details ? 'expand_less' : 'expand_more'}  style={{ color: '#a9760a' }} />
                  </span>
                </div>

              <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,120px)_auto] gap-4 items-start">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className="form-label mb-0">Inventory #</label>
                    <label className="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                      <input
                        type="checkbox"
                        checked={inventoryNumberManual}
                        onChange={(e) => setManualInventoryNumber(e.target.checked)}
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                      Manual
                    </label>
                  </div>
                  <ClearableField
                    onClear={() => setEditing({ ...editing, inventory_number: null })}
                    show={inventoryNumberManual && !!editing.inventory_number}
                    disabled={!inventoryNumberManual}
                  >
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      className="form-field w-full"
                      disabled={!inventoryNumberManual}
                      value={editing.inventory_number ?? ''}
                      onChange={(e) => setEditing({ ...editing, inventory_number: parseInventoryNumber(e.target.value) })}
                      style={!inventoryNumberManual ? { background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' } : undefined}
                    />
                  </ClearableField>
                  {!inventoryNumberManual && (
                    <p className="mt-1 text-[0.68rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                      Auto-filled with the next available inventory number.
                    </p>
                  )}
                  {(() => {
                    const inventoryNumber = parseInventoryNumber(editing.inventory_number);
                    const duplicateOwner = getInventoryNumberOwner(products, inventoryNumber, isNew ? undefined : editing.id);
                    if (!inventoryNumber || !duplicateOwner) return null;
                    return (
                      <p className="mt-1 text-[0.68rem] font-semibold" style={{ color: 'var(--color-error)' }}>
                        {getDuplicateInventoryNumberMessage(duplicateOwner, inventoryNumber)}
                      </p>
                    );
                  })()}
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className="form-label mb-0">Quantity</label>
                  </div>
                  <ClearableField
                    onClear={() => setEditing({ ...editing, quantity: 1 })}
                    show={normalizeProductQuantity(editing.quantity) !== 1}
                  >
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      className="form-field w-full"
                      value={editing.quantity ?? ''}
                      onChange={(e) => setEditing({
                        ...editing,
                        quantity: e.target.value === '' ? null : normalizeProductQuantity(e.target.value),
                      })}
                      onBlur={() => {
                        if (editing.quantity === null) setEditing({ ...editing, quantity: 1 });
                      }}
                    />
                  </ClearableField>
                  <p className="mt-1 text-[0.68rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                    Units in stock. Defaults to 1 (one-of-a-kind).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedIds((current) => !current)}
                  className="outline-button text-xs h-10 md:mt-[1.55rem]"
                >
                  {showAdvancedIds ? 'Hide' : (isNew ? 'SKU / Slug' : 'SKU / Slug / ID')}
                </button>
              </div>

              {showAdvancedIds && (
                <div
                  className="grid md:grid-cols-2 gap-4 p-4 border"
                  style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}
                >
                  {!isNew && (
                    <div className="md:col-span-2">
                      <label className="form-label">ID (slug, auto-generated if blank)</label>
                      <ClearableField onClear={() => setEditing({ ...editing, id: '' })} show={!!editing.id}>
                        <input className="form-field w-full" placeholder="my-product-slug"
                          value={editing.id}
                          onChange={(e) => setEditing({ ...editing, id: e.target.value })} />
                      </ClearableField>
                    </div>
                  )}
                  <div>
                    <label className="form-label">SKU</label>
                    <ClearableField onClear={() => setEditing({ ...editing, sku: '' })} show={!!editing.sku}>
                      <input className="form-field w-full" value={editing.sku ?? ''}
                        onChange={(e) => setEditing({ ...editing, sku: e.target.value })} />
                    </ClearableField>
                  </div>
                  <div>
                    <label className="form-label">Public Slug</label>
                    <ClearableField onClear={() => setEditing({ ...editing, slug: '' })} show={!!editing.slug}>
                      <input className="form-field w-full" value={editing.slug ?? ''}
                        onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
                    </ClearableField>
                  </div>
                </div>
              )}

              {/* Title */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Title (English)</label>
                  <ClearableField onClear={() => setEditing({ ...editing, title: '' })} show={!!editing.title} multiline>
                    <textarea rows={2} className="form-field w-full resize-y" value={editing.title}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                  </ClearableField>
                </div>
                <div>
                  <label className="form-label">Title (Spanish)</label>
                  <ClearableField onClear={() => setEditing({ ...editing, title_es: '' })} show={!!editing.title_es}>
                    <input className="form-field w-full" value={editing.title_es ?? ''}
                      onChange={(e) => setEditing({ ...editing, title_es: e.target.value })} />
                  </ClearableField>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Product Type</label>
                  {/* No ClearableField wrapper here on purpose: its clear button is
                      absolutely positioned over the right edge of whatever it wraps,
                      which lands directly on top of ComboboxInput's own built-in
                      clear/toggle button and physically intercepts every click meant
                      for it. ComboboxInput is already fully self-contained (its own
                      input, its own always-visible clear button), so it doesn't need
                      — and must not have — this wrapper. */}
                  <ComboboxInput
                    value={jewelryTypeInput}
                    onChange={(value) => {
                      // Keep an actually-empty value empty while the admin is mid-edit
                      // (clearing the field via the x button or backspacing it out) so
                      // they can type a brand-new custom type into a truly blank box
                      // instead of it snapping straight back to "Other". Blank is only
                      // resolved to "Other" on save (see normalizedJewelryType above).
                      const nextProductType = normalizeProductTypeValue(value) ?? '';
                      setJewelryTypeInput(nextProductType);
                      setEditing({
                        ...editing,
                        product_type: nextProductType,
                        jewelry_type: nextProductType,
                        width_mm: productSupportsLinkType(nextProductType) ? editing.width_mm ?? null : null,
                      });
                      if (!productSupportsLinkType(nextProductType)) setChainTypeInput('');
                      if (!productUsesLength(nextProductType) && !productUsesSize(nextProductType) && !productUsesHeight(nextProductType)) setLengthInput('');
                    }}
                    options={productTypeOptions}
                    placeholder="e.g. Necklace, Cufflinks, Tie Clip..."
                  />
                </div>
                <div>
                  <label className="form-label">Date (Year Made)</label>
                  <ClearableField onClear={() => setEditing({ ...editing, item_year: null })} show={editing.item_year != null}>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={2200}
                      step={1}
                      placeholder="e.g. 1930"
                      className="form-field w-full"
                      value={editing.item_year ?? ''}
                      onChange={(e) => setEditing({ ...editing, item_year: normalizeProductItemYear(e.target.value) })}
                    />
                  </ClearableField>
                </div>
                <div>
                  <label className="form-label">Brand</label>
                  <ClearableField onClear={() => setEditing({ ...editing, brand: '' })} show={!!editing.brand}>
                    <input
                      type="text"
                      className="form-field w-full"
                      value={editing.brand ?? ''}
                      onChange={(e) => setEditing({ ...editing, brand: e.target.value })}
                      placeholder="e.g. David Yurman, Tiffany & Co., Cartier..."
                    />
                  </ClearableField>
                </div>
              </div>

              {/* Metal hierarchy */}
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Metal Type</label>
                  <ClearableField
                    onClear={() => setEditing({
                      ...editing,
                      metal_type: '',
                      metal: '',
                      metal_variant: '',
                      purity: null,
                    })}
                    show={!!editing.metal_type}
                  >
                    <select className="form-field w-full" value={editing.metal_type ? normalizeProductMetalType(editing.metal_type, editing.category) : ''}
                      onChange={(e) => {
                        if (!e.target.value) {
                          setEditing({ ...editing, metal_type: '', metal: '', metal_variant: '', purity: null });
                          return;
                        }
                        const nextMetalType = normalizeProductMetalType(e.target.value, editing.category);
                        const nextCategory = getLegacyCategoryForMetalType(nextMetalType, editing.category);
                        setEditing({
                          ...editing,
                          metal_type: nextMetalType,
                          metal: nextMetalType,
                          category: nextCategory,
                          metal_variant: getDefaultMetalVariant(nextCategory),
                          purity: null,
                        });
                      }}>
                      <option value="">— Select —</option>
                      {PRODUCT_METAL_TYPES.map((metalType) => (
                        <option key={metalType.value} value={metalType.value}>{metalType.label}</option>
                      ))}
                    </select>
                  </ClearableField>
                </div>
                <div>
                  <label className="form-label">Metal Color</label>
                  <ClearableField
                    onClear={() => setEditing({ ...editing, metal_variant: '' })}
                    show={!!editing.metal_variant}
                  >
                    <select
                      className="form-field w-full"
                      value={editing.metal_variant ? normalizeProductMetalVariant(editing.metal_variant, getLegacyCategoryForMetalType(editing.metal_type, editing.category)) : ''}
                      onChange={(e) => setEditing({ ...editing, metal_variant: e.target.value })}
                    >
                      <option value="">— Select —</option>
                      {PRODUCT_METAL_VARIANTS[getLegacyCategoryForMetalType(editing.metal_type, editing.category)].map((variant) => (
                        <option key={variant.value} value={variant.value}>{variant.label}</option>
                      ))}
                    </select>
                  </ClearableField>
                </div>
              </div>

              {/* Conditional product detail fields */}
              <div className="grid md:grid-cols-3 gap-4">
                {(() => {
                  const canUseLinkType = productSupportsLinkType(jewelryTypeInput);
                  return canUseLinkType ? (
                    <div>
                      <label className="form-label">Link Type</label>
                      <ComboboxInput
                        value={chainTypeInput}
                        onChange={setChainTypeInput}
                        options={[...PRODUCT_LINK_TYPES]}
                        placeholder="e.g. Cuban link, Rope chain..."
                      />
                    </div>
                  ) : null;
                })()}
                {(() => {
                  const lengthSizeLabel = getLengthSizeLabel(jewelryTypeInput);
                  const usesHeight = productUsesHeight(jewelryTypeInput);
                  const canUseLengthOrSize = productUsesLength(jewelryTypeInput) || productUsesSize(jewelryTypeInput) || usesHeight;
                  if (!canUseLengthOrSize) return null;
                  // Inches unless a unit is typed — "470 mm" / "47 cm" convert on
                  // the way in (normalizeProductLengthSizeValue), because the owner
                  // measures in millimetres and a bare 470 used to read as 470 in.
                  const placeholder = usesHeight
                    ? 'inches, or add mm: 1.5, 40 mm...'
                    : lengthSizeLabel === 'Size'
                      ? 'e.g. 6.5, 7, 8...'
                      : 'inches, or add mm: 22, 7.5, 470 mm...';
                  const unitLabel = lengthSizeLabel === 'Size' ? lengthSizeLabel : `${lengthSizeLabel} (in)`;
                  return (
                    <div>
                      <label className="form-label">{unitLabel}</label>
                      <ComboboxInput
                        value={lengthInput}
                        onChange={(value) => setLengthInput(normalizeProductLengthSizeValue(value))}
                        options={usesHeight ? [] : PREDEFINED_LENGTHS}
                        placeholder={placeholder}
                      />
                    </div>
                  );
                })()}
                {productSupportsLinkType(jewelryTypeInput) && (
                  <div>
                    <label className="form-label">Width (mm)</label>
                    <ClearableField onClear={() => setEditing({ ...editing, width_mm: null })} show={editing.width_mm != null}>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        max={1000}
                        step={0.01}
                        placeholder="e.g. 8.5"
                        className="form-field w-full"
                        value={editing.width_mm ?? ''}
                        onChange={(event) => setEditing({
                          ...editing,
                          width_mm: event.target.value === '' ? null : Number(event.target.value),
                        })}
                      />
                    </ClearableField>
                  </div>
                )}
              </div>

              {isNew && (
                <label className="inline-flex w-fit items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                  <input
                    type="checkbox"
                    checked={quickAddMode}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setQuickAddMode(checked);
                      if (checked) {
                        setEditing({
                          ...editing,
                          price_mode: 'manual',
                          pricing_multiplier: null,
                          asking_price: null,
                        });
                      }
                    }}
                  />
                  Quick add
                </label>
              )}

              {/* Pricing — Mode · Purity · Weight · Multiplier/Price Label (2-up on mobile, 4-up on desktop) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="form-label">Price Mode</label>
                  <ClearableField
                    onClear={() => setEditing({ ...editing, price_mode: 'spot-multiplier', manual_price_label: null, asking_price: null })}
                    show={editing.price_mode !== 'spot-multiplier'}
                  >
                    <select className="form-field w-full" value={editing.price_mode}
                      onChange={(e) => {
                        const nextMode = e.target.value as 'spot-multiplier' | 'manual';
                        setQuickAddMode(false);
                        setEditing({
                          ...editing,
                          price_mode: nextMode,
                          ...(nextMode === 'spot-multiplier' ? { manual_price_label: null, asking_price: null } : {}),
                        });
                      }}>
                      {PRICE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </ClearableField>
                </div>
                <div>
                  <label className="form-label">{getLegacyCategoryForMetalType(editing.metal_type, editing.category) === 'Silver' ? 'Purity (/1000)' : 'Purity (k)'}</label>
                  {getLegacyCategoryForMetalType(editing.metal_type, editing.category) === 'Silver' ? (
                    <ClearableField onClear={() => setEditing({ ...editing, purity: null })} show={!!editing.purity}>
                    <input
                      type="number"
                      list="silver-purity-presets"
                      min={100}
                      max={1000}
                      step={1}
                      className="form-field w-full"
                      placeholder="925 sterling · 900 · 800 (parts per 1000)"
                      value={editing.purity ?? ''}
                      onChange={(e) => setEditing({ ...editing, purity: e.target.value ? Number(e.target.value) : null })}
                    />
                    <datalist id="silver-purity-presets">
                      <option value="999">99.9% fine</option>
                      <option value="958">95.8% Britannia</option>
                      <option value="950">95%</option>
                      <option value="925">92.5% Sterling</option>
                      <option value="900">90% Coin</option>
                      <option value="850">85%</option>
                      <option value="835">83.5%</option>
                      <option value="830">83%</option>
                      <option value="800">80%</option>
                    </datalist>
                    </ClearableField>
                  ) : (
                    <ClearableField onClear={() => setEditing({ ...editing, purity: null })} show={!!editing.purity}>
                    <input type="number" className="form-field w-full" placeholder="18"
                      value={editing.purity ?? ''}
                      onChange={(e) => setEditing({ ...editing, purity: e.target.value ? Number(e.target.value) : null })} />
                    </ClearableField>
                  )}
                </div>
                <div>
                  <label className="form-label">Weight (g)</label>
                  <ClearableField onClear={() => setEditing({ ...editing, weight_grams: null })} show={!!editing.weight_grams}>
                  <input type="number" step="0.01" className="form-field w-full"
                    value={editing.weight_grams ?? ''}
                    onChange={(e) => setEditing({ ...editing, weight_grams: e.target.value ? Number(e.target.value) : null })} />
                  </ClearableField>
                </div>
                <div>
                  {editing.price_mode === 'spot-multiplier' ? (
                    <>
                      <label className="form-label">Multiplier</label>
                      <ClearableField onClear={() => setEditing({ ...editing, pricing_multiplier: null })} show={!!editing.pricing_multiplier}>
                      <input type="number" step="0.01" className="form-field w-full" placeholder="e.g. 1.25"
                        value={editing.pricing_multiplier ?? ''}
                        onChange={(e) => setEditing({ ...editing, pricing_multiplier: e.target.value ? Number(e.target.value) : null })} />
                      </ClearableField>
                    </>
                  ) : (
                    <>
                      <label className="form-label">Price Label</label>
                      <ClearableField onClear={() => setEditing({ ...editing, asking_price: null, manual_price_label: '' })} show={!!editing.manual_price_label}>
                      <input className="form-field w-full" placeholder="$1,200"
                        value={editing.manual_price_label ?? ''}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setEditing((current) => current ? ({
                            ...current,
                            asking_price: null,
                            price_mode: 'manual',
                            manual_price_label: normalizeManualPriceLabel(nextValue),
                          }) : current);
                        }}
                        onBlur={(e) => {
                          const normalized = normalizeManualPriceLabel(e.currentTarget.value);
                          setEditing((current) => current ? ({
                            ...current,
                            asking_price: null,
                            price_mode: 'manual',
                            manual_price_label: normalized,
                          }) : current);
                        }} />
                      </ClearableField>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="inline-flex w-fit items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                  <input
                    type="checkbox"
                    checked={editing.show_spot_price !== false}
                    onChange={(e) => setEditing({ ...editing, show_spot_price: e.target.checked })}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  Show spot / melt value on storefront
                </label>
                <p className="mt-1 text-xs normal-case" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Uncheck for items that aren&apos;t 100% gold/silver (mixed metal, gemstones, plating…) — the
                  product page will show a short note instead of a scrap-value / spot-per-oz estimate.
                </p>
              </div>

              <div>
                <label className="inline-flex w-fit items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                  <input
                    type="checkbox"
                    checked={!!editing.special_price_override_enabled}
                    onChange={(e) => setEditing({
                      ...editing,
                      special_price_override_enabled: e.target.checked,
                      special_price_override_amount: e.target.checked ? editing.special_price_override_amount : null,
                    })}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  Override customer special pricing
                </label>
                <p className="mt-1 text-xs normal-case" style={{ color: 'var(--color-on-surface-variant)' }}>
                  The &quot;Own gold or silver? Put it toward this piece…&quot; line on the product page defaults to
                  the computed scrap value above. Check this to show a custom price on that line instead — either a
                  flat amount or a percentage over the item&apos;s spot/melt value (the scrap-value box itself is
                  unaffected).
                </p>
                {editing.special_price_override_enabled && (() => {
                  const overrideMode = normalizeSpecialPriceOverrideMode(editing.special_price_override_mode);
                  const meltPreview = calcSpotMeltValue(editing as Product, spotData);
                  const percentValue = editing.special_price_override_percent;
                  const percentPreview =
                    overrideMode === 'percent' &&
                    meltPreview != null &&
                    typeof percentValue === 'number' &&
                    Number.isFinite(percentValue) &&
                    percentValue >= 0
                      ? meltPreview * (1 + percentValue / 100)
                      : null;
                  return (
                    <div className="mt-2 space-y-2">
                      <div className="max-w-[260px]">
                        <label className="form-label">Override Type</label>
                        <select
                          className="form-field w-full"
                          value={overrideMode}
                          onChange={(e) => setEditing({
                            ...editing,
                            special_price_override_mode: e.target.value === 'percent' ? 'percent' : 'amount',
                          })}
                        >
                          <option value="amount">Fixed amount ($)</option>
                          <option value="percent">Percentage over spot</option>
                        </select>
                      </div>
                      {overrideMode === 'percent' ? (
                        <div className="max-w-[200px]">
                          <label className="form-label">Percent Over Spot</label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              className="form-field w-full pr-8"
                              placeholder="e.g. 10"
                              value={editing.special_price_override_percent ?? ''}
                              onChange={(e) => setEditing({
                                ...editing,
                                special_price_override_percent: e.target.value ? Number(e.target.value) : null,
                              })}
                            />
                            <span
                              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm"
                              style={{ color: 'var(--color-on-surface-variant)' }}
                            >
                              %
                            </span>
                          </div>
                          <p className="mt-1 text-xs normal-case" style={{ color: 'var(--color-on-surface-variant)' }}>
                            {percentPreview != null
                              ? `Trade-in line shows ${formatUsdPrice(percentPreview)} at the current spot price, and auto-updates as spot moves.`
                              : 'Trade-in line shows the item\u2019s melt value plus this percentage, updating live with spot.'}
                          </p>
                        </div>
                      ) : (
                        <div className="max-w-[200px]">
                          <label className="form-label">Custom Special Price</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="form-field w-full"
                            placeholder="e.g. 350"
                            value={editing.special_price_override_amount ?? ''}
                            onChange={(e) => setEditing({
                              ...editing,
                              special_price_override_amount: e.target.value ? Number(e.target.value) : null,
                            })}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <label className="form-label">Location</label>
                  <ClearableField onClear={() => setEditing({ ...editing, location: 'showcase' })} show={(editing.location ?? 'showcase') !== 'showcase'}>
                  <select className="form-field w-full" value={editing.location ?? 'showcase'}
                    onChange={(e) => setEditing({ ...editing, location: e.target.value })}>
                    {LOCATIONS.map((location) => <option key={location.value} value={location.value}>{location.label}</option>)}
                  </select>
                  </ClearableField>
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <ClearableField onClear={() => setEditing({ ...editing, status: 'available' })} show={normalizeProductStatus(editing.status) !== 'available'}>
                  <select className="form-field w-full" value={editing.status}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value as ProductStatus })}>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  </ClearableField>
                </div>
                {productUsesGender(jewelryTypeInput) && (
                  <div>
                    <label className="form-label">Gender</label>
                    <ClearableField onClear={() => setEditing({ ...editing, gender: '' })} show={!!editing.gender}>
                    <select className="form-field w-full" value={editing.gender ?? ''}
                      onChange={(e) => setEditing({ ...editing, gender: e.target.value })}>
                      <option value="">— Select —</option>
                      <option value="Unisex">Unisex</option>
                      <option value="Men">Men</option>
                      <option value="Women">Women</option>
                    </select>
                    </ClearableField>
                  </div>
                )}
                <label className="flex items-end gap-2 text-sm pb-2" style={{ color: 'var(--color-on-surface-variant)' }}>
                  <input
                    type="checkbox"
                    checked={editing.featured === true}
                    onChange={(e) => setEditing({ ...editing, featured: e.target.checked })}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  Featured in shop
                </label>
                {/* Site shop "Make an Offer" (owner, 2026-10-15): off unless
                    ticked. The AI assistant ticks it only when told to. */}
                <div className="md:col-start-4 flex flex-col gap-1">
                  <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                    <input
                      type="checkbox"
                      checked={editing.accepts_offers === true}
                      onChange={(e) => setEditing({ ...editing, accepts_offers: e.target.checked })}
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    Accept offers
                  </label>
                  {editing.accepts_offers === true && (
                    <p className="text-[0.7rem] leading-snug" style={{ color: 'var(--color-on-surface-variant)' }}>
                      Shows Make an Offer on this item&apos;s page.
                      {editing.id && (openOffersByProduct[editing.id] ?? 0) > 0 && (
                        <>
                          {' '}{openOffersByProduct[editing.id]} open {openOffersByProduct[editing.id] === 1 ? 'offer' : 'offers'} —{' '}
                          <a href={`${adminBasePath}/offers`} className="underline" style={{ color: 'var(--color-primary)' }}>see Offers</a>.
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Description (EN)</label>
                  <ClearableField onClear={() => setEditing({ ...editing, description: '' })} show={!!editing.description} multiline>
                  <textarea rows={4} className="form-field w-full resize-y"
                    value={editing.description ?? ''}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                  </ClearableField>
                </div>
                <div>
                  <label className="form-label">Description (ES)</label>
                  <ClearableField onClear={() => setEditing({ ...editing, description_es: '' })} show={!!editing.description_es} multiline>
                  <textarea rows={4} className="form-field w-full resize-y"
                    value={editing.description_es ?? ''}
                    onChange={(e) => setEditing({ ...editing, description_es: e.target.value })} />
                  </ClearableField>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Notes (EN)</label>
                  <ClearableField onClear={() => setEditing({ ...editing, public_notes: '' })} show={!!editing.public_notes} multiline>
                  <textarea rows={3} className="form-field w-full resize-y"
                    value={editing.public_notes ?? ''}
                    onChange={(e) => setEditing({ ...editing, public_notes: e.target.value })} />
                  </ClearableField>
                </div>
                <div>
                  <label className="form-label">Notes (ES)</label>
                  <ClearableField onClear={() => setEditing({ ...editing, public_notes_es: '' })} show={!!editing.public_notes_es} multiline>
                  <textarea rows={3} className="form-field w-full resize-y"
                    value={editing.public_notes_es ?? ''}
                    onChange={(e) => setEditing({ ...editing, public_notes_es: e.target.value })} />
                  </ClearableField>
                </div>
              </div>
              </div>

              <div className="product-editor-panel" data-collapsed={openEditorSections.etsy ? 'false' : 'true'}>
                <div className="editor-collapse-header flex items-start gap-3" role="button" tabIndex={0}
                  aria-expanded={openEditorSections.etsy}
                  onClick={() => toggleEditorSection('etsy')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEditorSection('etsy'); } }}>
                  <div>
                    <h3 className="product-editor-section-title">Etsy</h3>
                    <p className={`product-editor-section-copy${openEditorSections.etsy ? '' : ' hidden'}`}>Dry-run preview, sync, and delist/reactivate.</p>
                  </div>
                  <span className="ml-auto self-center" aria-hidden="true">
                    <AppIcon name={openEditorSections.etsy ? 'expand_less' : 'expand_more'}  style={{ color: '#a9760a' }} />
                  </span>
                </div>

                {isNew || !editing.id ? (
                  <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Save this listing first, then sync it to Etsy.</p>
                ) : (
                  <EtsyProductPanel productId={editing.id} onSynced={refreshEtsyChips} onProductEdited={applyDrawerFieldEdit} />
                )}
              </div>

              <div className="product-editor-panel" data-collapsed={openEditorSections.ebay ? 'false' : 'true'}>
                <div className="editor-collapse-header flex items-start gap-3" role="button" tabIndex={0}
                  aria-expanded={openEditorSections.ebay}
                  onClick={() => toggleEditorSection('ebay')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEditorSection('ebay'); } }}>
                  <div>
                    <h3 className="product-editor-section-title">eBay</h3>
                    <p className={`product-editor-section-copy${openEditorSections.ebay ? '' : ' hidden'}`}>Dry-run preview, sync, publish, and delist/restore.</p>
                  </div>
                  <span className="ml-auto self-center" aria-hidden="true">
                    <AppIcon name={openEditorSections.ebay ? 'expand_less' : 'expand_more'}  style={{ color: '#a9760a' }} />
                  </span>
                </div>

                {isNew || !editing.id ? (
                  <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Save this listing first, then sync it to eBay.</p>
                ) : (
                  <EbayProductPanel productId={editing.id} onSynced={refreshEbayChips} onProductEdited={applyDrawerFieldEdit} />
                )}
              </div>

              <div className="product-editor-panel" data-collapsed={openEditorSections.instagram ? 'false' : 'true'}>
                <div className="editor-collapse-header flex items-start gap-3" role="button" tabIndex={0}
                  aria-expanded={openEditorSections.instagram}
                  onClick={() => toggleEditorSection('instagram')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEditorSection('instagram'); } }}>
                  <div>
                    <h3 className="product-editor-section-title">Instagram</h3>
                    <p className={`product-editor-section-copy${openEditorSections.instagram ? '' : ' hidden'}`}>Preview the caption, prepare images, queue, and publish.</p>
                  </div>
                  <span className="ml-auto self-center" aria-hidden="true">
                    <AppIcon name={openEditorSections.instagram ? 'expand_less' : 'expand_more'}  style={{ color: '#a9760a' }} />
                  </span>
                </div>

                {isNew || !editing.id ? (
                  <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Save this listing first, then post it to Instagram.</p>
                ) : (
                  <InstagramProductPanel productId={editing.id} />
                )}
              </div>

              <div className="product-editor-panel" data-collapsed={openEditorSections.facebook ? 'false' : 'true'}>
                <div className="editor-collapse-header flex items-start gap-3" role="button" tabIndex={0}
                  aria-expanded={openEditorSections.facebook}
                  onClick={() => toggleEditorSection('facebook')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEditorSection('facebook'); } }}>
                  <div>
                    <h3 className="product-editor-section-title">Facebook</h3>
                    <p className={`product-editor-section-copy${openEditorSections.facebook ? '' : ' hidden'}`}>Preview the post, prepare images, queue, and publish to the Page.</p>
                  </div>
                  <span className="ml-auto self-center" aria-hidden="true">
                    <AppIcon name={openEditorSections.facebook ? 'expand_less' : 'expand_more'}  style={{ color: '#a9760a' }} />
                  </span>
                </div>

                {isNew || !editing.id ? (
                  <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Save this listing first, then post it to Facebook.</p>
                ) : (
                  <FacebookProductPanel productId={editing.id} />
                )}
              </div>

            </div>

            {/* Validation errors */}
            {formErrors.length > 0 && (
              <div
                className="px-6 py-3 border-t text-xs flex flex-col gap-1"
                style={{
                  borderColor: 'var(--color-outline-variant)',
                  background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
                  color: 'var(--color-error)',
                  fontFamily: 'var(--font-label)',
                }}
              >
                {formErrors.map((e, i) => <span key={i}>· {e}</span>)}
              </div>
            )}

            {/* Spanish bar. Part of the phone "dock" with the action row below it:
                both collapse together on scroll-down (option C, owner 2026-09-02
                — "the regenerate missing spanish button should hide along with the
                rest of the lower save menu"). */}
            <div
              data-hidden={editorRowHidden && !editorMoreOpen ? 'true' : 'false'}
              // Phones: the button lives in the ⋯ sheet (owner, 2026-09-02), so
              // this bar exists there ONLY while a result notice is showing.
              {...(spanishTranslationNotice ? {} : { 'data-desktop-only': '' })}
              className="product-editor-dock px-3 py-3 border-t flex flex-col gap-2 sm:flex-row sm:items-center"
              style={{ borderColor: 'var(--color-outline-variant)' }}
            >
              <button
                type="button"
                data-desktop-only=""
                onClick={regenerateMissingSpanish}
                disabled={translatingSpanish || saving || buildMissingSpanishCopyRequest(editing).targets.length === 0}
                className="outline-button text-sm inline-flex w-full items-center justify-center gap-1.5 disabled:opacity-40 sm:w-auto"
                title="Fill blank Spanish title, description, and notes from their English versions"
              >
                {translatingSpanish ? 'Generating Spanish...' : 'Regenerate Missing Spanish'}
              </button>
              {spanishTranslationNotice && (
                <div
                  className="px-3 py-2 text-xs font-medium sm:flex-1"
                  role="status"
                  style={{
                    background: spanishTranslationNotice.ok ? 'color-mix(in srgb, #166534 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                    border: `1px solid ${spanishTranslationNotice.ok ? 'color-mix(in srgb, #166534 30%, transparent)' : 'color-mix(in srgb, var(--color-error) 28%, transparent)'}`,
                    color: spanishTranslationNotice.ok ? '#166534' : 'var(--color-error)',
                    fontFamily: 'var(--font-label)',
                  }}
                >
                  {spanishTranslationNotice.text}
                </div>
              )}
            </div>

            {/* Action row. Desktop: every action in one line, as it has always
                been. Phones (< 768px): ONE compact row — Cancel · Save · Save &
                Close · ⋯ — with Clone / Undo / Save + Add Another behind the ⋯
                sheet. This is "option B" from features/admin-listing-editor-mobile.md
                (owner, 2026-09-02): the 2×3 grid took 160–190px of a phone
                screen; a single row takes ~60px, reclaiming the space the
                hide-on-scroll attempts were after, with no scroll coupling at
                all. The row stays IN FLOW — never an overlay (see DECISIONS,
                "Admin on a phone"). */}
            <div
              data-hidden={editorRowHidden && !editorMoreOpen ? 'true' : 'false'}
              className="product-editor-dock product-editor-actions relative flex items-center gap-2 px-3 py-3 border-t md:gap-1.5 md:py-4 md:flex-wrap"
              style={{ borderColor: 'var(--color-outline-variant)', paddingBottom: 'max(0.75rem, calc(0.75rem + env(safe-area-inset-bottom, 0px)))' }}>
              {editorMoreOpen && (
                <div
                  className="product-editor-more-sheet absolute bottom-full left-0 right-0 z-10 flex flex-col gap-2 border-t border-b px-3 py-3"
                  style={{ background: '#fbfbff', borderColor: 'var(--color-outline-variant)', boxShadow: '0 -8px 24px rgba(17, 24, 39, 0.12)' }}
                  role="menu"
                  aria-label="More actions"
                >
                  {!isNew && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setEditorMoreOpen(false); cloneListing(); }}
                      disabled={translatingSpanish || saving}
                      className="outline-button text-sm disabled:opacity-40 w-full"
                    >
                      Clone
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setEditorMoreOpen(false); undoEdit(); }}
                    disabled={!canUndoEdit || saving || translatingSpanish}
                    className="outline-button text-sm disabled:opacity-40 w-full flex items-center justify-center gap-1.5"
                  >
                    <AppIcon name="undo" className="text-base leading-none" aria-hidden="true" />
                    Undo
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setEditorMoreOpen(false); requestSaveEditor('another'); }}
                    disabled={saving || translatingSpanish}
                    className="outline-button text-sm disabled:opacity-50 w-full"
                  >
                    Save + Add Another
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setEditorMoreOpen(false); regenerateMissingSpanish(); }}
                    disabled={translatingSpanish || saving || buildMissingSpanishCopyRequest(editing).targets.length === 0}
                    className="outline-button text-sm disabled:opacity-40 w-full"
                  >
                    {translatingSpanish ? 'Generating Spanish...' : 'Regenerate Missing Spanish'}
                  </button>
                </div>
              )}
              {/* Clone — edit mode only, pushed to the left */}
              {!isNew && (
                <button
                  type="button"
                  onClick={cloneListing}
                  disabled={translatingSpanish || saving}
                  className="outline-button text-sm disabled:opacity-40"
                  data-desktop-only=""
                >
                  Clone
                </button>
              )}
              <button
                type="button"
                onClick={undoEdit}
                disabled={!canUndoEdit || saving || translatingSpanish}
                className="outline-button text-sm disabled:opacity-40 flex items-center justify-center gap-1.5"
                data-desktop-only=""
                title="Undo the last change"
              >
                <AppIcon name="undo" className="text-base leading-none" aria-hidden="true" />
                Undo
              </button>
              <button type="button" onClick={requestCloseEditor} className="outline-button text-sm">
                Cancel
              </button>
              <button type="button" onClick={() => requestSaveEditor('stay')} disabled={saving || translatingSpanish} className="outline-button text-sm disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => requestSaveEditor('another')} disabled={saving || translatingSpanish} className="outline-button text-sm disabled:opacity-50" data-desktop-only="">
                Save + Add Another
              </button>
              <button type="button" onClick={() => requestSaveEditor('close')} disabled={saving || translatingSpanish} className="gold-button gold-button-gradient text-sm disabled:opacity-50 max-md:flex-1">
                {saving ? 'Saving…' : (<><span data-phone-only="">Save &amp; Close</span><span data-desktop-only="">Save and Close</span></>)}
              </button>
              <button
                type="button"
                onClick={() => { setEditorRowHiddenSafe(false); setEditorMoreOpen((open) => !open); }}
                className="product-editor-more-button"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={editorMoreOpen}
                style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 50%, transparent)', color: 'var(--color-primary)' }}
              >
                <AppIcon name="more_horiz" className="text-2xl leading-none" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Fill AI prompt viewer — archived with the Quick Fill section. */}
      {SHOW_QUICK_FILL && showQuickFillPrompt && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.58)' }}
          onClick={() => setShowQuickFillPrompt(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[82vh] border p-5 flex flex-col gap-4"
            style={{ background: 'var(--color-background)', borderColor: 'var(--color-outline-variant)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
                AI Formatting Prompt
              </h2>
              <button
                type="button"
                onClick={() => setShowQuickFillPrompt(false)}
                className="text-sm font-bold uppercase tracking-wide"
                style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
              >
                Close
              </button>
            </div>
            <textarea
              ref={quickFillPromptTextRef}
              readOnly
              value={quickFillPrompt}
              className="form-field w-full min-h-[52vh] whitespace-pre-wrap overflow-auto p-4 text-xs leading-relaxed"
              style={{
                color: 'var(--color-on-surface-variant)',
                fontFamily: 'var(--font-body)',
                background: 'var(--color-surface-container-lowest)',
                border: '1px solid var(--color-outline-variant)',
              }}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={copyQuickFillPrompt} className="outline-button text-sm">
                Copy Prompt
              </button>
              <button type="button" onClick={() => setShowQuickFillPrompt(false)} className="gold-button text-sm">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image preview lightbox */}
      {previewImg && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setPreviewImg(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Full-size product image"
        >
          <button
            type="button"
            onClick={() => setPreviewImg(null)}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            aria-label="Close image preview"
            title="Close"
          >
            <AppIcon name="close"  aria-hidden="true" />
          </button>
          <div className="relative max-w-3xl w-full max-h-[85vh] flex flex-col items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="relative h-[78vh] max-h-[78vh] w-full">
              <Image
                src={previewImg.url}
                alt={previewImg.alt ?? 'Product image preview'}
                fill
                sizes="(max-width: 768px) 92vw, 768px"
                className="object-contain"
                style={{ filter: 'drop-shadow(0 8px 40px rgba(0,0,0,0.6))' }}
                unoptimized
              />
            </div>
            <div className="flex items-center gap-2">
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setCropRect(FULL_IMAGE_CROP);
                    setCropTarget(previewImg);
                  }}
                  className="gold-button text-xs"
                >
                  Crop
                </button>
              )}
              <button type="button" onClick={() => setPreviewImg(null)} className="outline-button text-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image crop editor */}
      {cropTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.88)' }}
          onClick={() => setCropTarget(null)}
        >
          <div
            className="w-full max-w-4xl border p-4 flex flex-col gap-4"
            style={{ background: 'var(--color-background)', borderColor: 'var(--color-outline-variant)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
                Crop Photo
              </h2>
              <button
                type="button"
                onClick={() => setCropTarget(null)}
                className="text-sm font-bold uppercase tracking-wide"
                style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
              >
                × Close
              </button>
            </div>

            <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              Drag inside the crop box to move it. Drag an edge or corner to resize it.
            </p>

            <div className="flex justify-center overflow-auto max-h-[62vh]">
              <div className="relative inline-block select-none touch-none" data-crop-area="true">
                <Image
                  src={cropTarget.url}
                  alt="Crop preview"
                  width={1200}
                  height={900}
                  className="block max-h-[60vh] w-auto max-w-full object-contain"
                  draggable={false}
                  unoptimized
                />
                <div
                  className="absolute touch-none"
                  data-crop-box="true"
                  style={{
                    left: `${cropRect.x}%`,
                    top: `${cropRect.y}%`,
                    width: `${cropRect.width}%`,
                    height: `${cropRect.height}%`,
                    border: '2px solid var(--color-primary)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.7)',
                    cursor: 'move',
                  }}
                  onPointerDown={(e) => startCropDrag(e, 'move')}
                >
                  {([
                    ['n', 'top-0 left-3 right-3 h-3 -translate-y-1/2 cursor-ns-resize'],
                    ['s', 'bottom-0 left-3 right-3 h-3 translate-y-1/2 cursor-ns-resize'],
                    ['w', 'left-0 top-3 bottom-3 w-3 -translate-x-1/2 cursor-ew-resize'],
                    ['e', 'right-0 top-3 bottom-3 w-3 translate-x-1/2 cursor-ew-resize'],
                    ['nw', 'left-0 top-0 w-4 h-4 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize'],
                    ['ne', 'right-0 top-0 w-4 h-4 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize'],
                    ['sw', 'left-0 bottom-0 w-4 h-4 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize'],
                    ['se', 'right-0 bottom-0 w-4 h-4 translate-x-1/2 translate-y-1/2 cursor-nwse-resize'],
                  ] as [CropDragMode, string][]).map(([mode, className]) => (
                    <div
                      key={mode}
                      className={`absolute ${className}`}
                      onPointerDown={(e) => startCropDrag(e, mode)}
                    />
                  ))}
                </div>
             </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCropTarget(null)} className="outline-button text-sm">
                Cancel
              </button>
              <button type="button" onClick={saveCroppedImage} disabled={cropping} className="gold-button text-sm disabled:opacity-50">
                {cropping ? 'Saving Crop…' : 'Save Crop'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image padding chooser */}
      {imagePaddingTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setImagePaddingTarget(null)}
        >
          <div
            className="w-full max-w-2xl border p-5 flex flex-col gap-4"
            style={{ background: 'var(--color-background)', borderColor: 'var(--color-outline-variant)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
                Image Padding
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                Choose the frame color behind each contained product photo.
              </p>
            </div>
            {(() => {
              const images = getProductImages(imagePaddingTarget);
              const selectedImage = images[imagePaddingTargetIndex] ?? null;
              const currentPaddingValue = productImagePaddingForImage(
                imagePaddingTarget.image_padding,
                imagePaddingTarget.image_padding_by_image,
                selectedImage,
                imagePaddingTargetIndex,
              );
              const customActive = isProductImagePaddingCustomColor(currentPaddingValue);
              const validCustomColor = isProductImagePaddingCustomColor(imagePaddingCustomColor) ? imagePaddingCustomColor : '#ffffff';
              return (
                <>
                  {images.length > 1 && (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                      {images.map((image, index) => {
                        const imagePadding = productImagePaddingForImage(
                          imagePaddingTarget.image_padding,
                          imagePaddingTarget.image_padding_by_image,
                          image,
                          index,
                        );
                        const active = index === imagePaddingTargetIndex;

                        return (
                          <button
                            key={`${image}-${index}`}
                            type="button"
                            onClick={() => {
                              imagePaddingTargetIndexRef.current = index;
                              setImagePaddingTargetIndex(index);
                              const nextColor = productImagePaddingBackground(imagePadding) === '#000000' ? '#000000' : '#ffffff';
                              setImagePaddingCustomColor(isProductImagePaddingCustomColor(imagePadding) ? imagePadding : nextColor);
                              setImagePaddingNotice(null);
                            }}
                            className="border p-1 text-left transition-colors"
                            style={{
                              borderColor: active ? 'var(--color-primary)' : 'var(--color-outline-variant)',
                              background: active ? 'rgba(194, 155, 45, 0.1)' : 'var(--color-surface-container-lowest)',
                            }}
                            aria-pressed={active}
                          >
                            <div
                              className="relative aspect-square overflow-hidden"
                              style={{ background: productImagePaddingBackground(imagePadding) }}
                            >
                              <Image
                                src={image}
                                alt={`${imagePaddingTarget.title} photo ${index + 1}`}
                                fill
                                sizes="104px"
                                className="object-contain object-center"
                                unoptimized={image.startsWith('/assets/')}
                              />
                            </div>
                            <span className="mt-1 block text-[0.62rem] font-bold uppercase tracking-wide" style={{ color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                              Photo {index + 1}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div
                    className="grid grid-cols-[136px_1fr] gap-4 border p-3"
                    style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}
                  >
                    <div
                      className="relative h-32 w-32 overflow-hidden border"
                      style={{
                        borderColor: 'var(--color-outline-variant)',
                        background: customActive ? validCustomColor : productImagePaddingBackground(currentPaddingValue),
                      }}
                    >
                      {selectedImage ? (
                        <Image
                          src={selectedImage}
                          alt={`${imagePaddingTarget.title} photo ${imagePaddingTargetIndex + 1} preview`}
                          fill
                          sizes="128px"
                          className="object-contain object-center"
                          unoptimized={selectedImage.startsWith('/assets/')}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-widest opacity-50">No Photo</div>
                      )}
                    </div>
                    <div className="flex flex-col justify-center gap-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                      <span className="font-bold" style={{ color: 'var(--color-on-surface)' }}>
                        Photo {imagePaddingTargetIndex + 1} preview
                      </span>
                      <span>
                        Select a photo above, then use the eyedropper to sample a color or choose a standard padding option.
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}
            <div className="grid gap-2">
              {IMAGE_PADDING_OPTIONS.map((option) => {
                const currentImage = getProductImages(imagePaddingTarget)[imagePaddingTargetIndex] ?? null;
                const currentPaddingValue = productImagePaddingForImage(
                  imagePaddingTarget.image_padding,
                  imagePaddingTarget.image_padding_by_image,
                  currentImage,
                  imagePaddingTargetIndex,
                );
                const active = normalizeProductImagePadding(currentPaddingValue) === option.value && !isProductImagePaddingCustomColor(currentPaddingValue);
                const isBlackOption = option.value === 'black';
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateProductImagePadding(imagePaddingTarget, option.value, imagePaddingTargetIndex)}
                    className="border px-4 py-3 text-left transition-colors"
                    style={{
                      borderColor: active ? 'var(--color-primary)' : isBlackOption ? '#111111' : 'var(--color-outline-variant)',
                      background: isBlackOption ? '#050505' : active ? 'rgba(194, 155, 45, 0.1)' : 'var(--color-surface-container-lowest)',
                    }}
                  >
                    <span
                      className="block text-sm font-bold uppercase tracking-wide"
                      style={{
                        color: isBlackOption ? '#ffffff' : active ? 'var(--color-primary)' : 'var(--color-on-surface)',
                        fontFamily: 'var(--font-label)',
                      }}
                    >
                      {option.label}
                    </span>
                    <span
                      className="mt-1 block text-xs"
                      style={{ color: isBlackOption ? 'rgba(255,255,255,0.78)' : 'var(--color-on-surface-variant)' }}
                    >
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="border p-4" style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}>
              <button
                type="button"
                onClick={pickImagePaddingColorFromScreen}
                className="outline-button inline-flex w-full items-center justify-center gap-2 text-xs"
              >
                <AppIcon name="colorize"  aria-hidden="true" style={{ fontSize: '16px', lineHeight: 1 }} />
                Pick From Selected Photo
              </button>
              {imagePaddingNotice && (
                <p className="mt-3 text-xs" style={{ color: imagePaddingNotice.ok ? 'var(--color-primary)' : 'var(--color-error)' }}>
                  {imagePaddingNotice.text}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              {(() => {
                const allImages = getProductImages(imagePaddingTarget);
                if (allImages.length <= 1) return <span />;
                const selImage = allImages[imagePaddingTargetIndex] ?? null;
                const curPad = productImagePaddingForImage(
                  imagePaddingTarget.image_padding,
                  imagePaddingTarget.image_padding_by_image,
                  selImage,
                  imagePaddingTargetIndex,
                );
                return (
                  <button
                    type="button"
                    onClick={() => applyImagePaddingToAll(imagePaddingTarget, curPad)}
                    className="outline-button text-sm"
                  >
                    Apply to All Photos
                  </button>
                );
              })()}
              <button type="button" onClick={() => setImagePaddingTarget(null)} className="gold-button text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showSelectedActionsModal && (
        <SelectedProductsActionsModal
          count={selectedProductIds.length}
          onClose={() => setShowSelectedActionsModal(false)}
          onChoose={chooseSelectedMarketplaceAction}
        />
      )}

      {selectedStatusCheck && (
        <SelectedProductsStatusModal
          products={selectedStatusProducts}
          marketplace={selectedStatusCheck}
          onPost={postSelectedStatusProduct}
          onClose={() => {
            void refreshEtsyChips();
            void refreshEbayChips();
            setSelectedStatusCheck(null);
            setShowSelectedActionsModal(true);
          }}
        />
      )}

      {/* Etsy bulk sync (Phase 2) */}
      {showEtsyBulkModal && (
        <EtsyBulkSyncModal
          productIds={selectedStatusPostTarget ? [selectedStatusPostTarget.productId] : selectedBulkRun ? selectedProductIds : undefined}
          onClose={handleEtsyBulkClose}
          onProductEdited={mergeReviewEdit}
        />
      )}

      {showEtsyPublishModal && (
        <EtsyBulkPublishModal
          onClose={() => {
            setShowEtsyPublishModal(false);
            void refreshEtsyChips();
          }}
        />
      )}

      {showEtsyRepairModal && (
        <EtsyBulkRepairModal
          onClose={() => {
            setShowEtsyRepairModal(false);
            void refreshEtsyChips();
          }}
        />
      )}

      {/* eBay bulk sync */}
      {showEbayBulkModal && (
        <EbayBulkSyncModal
          productIds={selectedStatusPostTarget ? [selectedStatusPostTarget.productId] : selectedBulkRun ? selectedProductIds : undefined}
          onClose={handleEbayBulkClose}
          onProductEdited={mergeReviewEdit}
        />
      )}

      {/* eBay Best Offer on / off for the selected items (2026-10-14) */}
      {ebayBestOfferBulk !== null && (
        <EbayBestOfferBulkModal
          items={selectedProducts.map((product) => ({ id: product.id, title: product.title }))}
          enabled={ebayBestOfferBulk}
          onClose={() => {
            setEbayBestOfferBulk(null);
            void refreshEbayChips(); // live items were updated on eBay
          }}
        />
      )}

      {/* eBay bulk publish — pushes every "Ready to publish" listing live */}
      {showEbayPublishModal && (
        <EbayBulkPublishModal
          onClose={() => {
            setShowEbayPublishModal(false);
            void refreshEbayChips(); // publishing changed several rows' state
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="w-full max-w-sm border p-6 flex flex-col gap-4"
            style={{ background: 'var(--color-background)', borderColor: 'var(--color-outline-variant)' }}
          >
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              Delete product?
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              {normalizeProductStatus(deleteTarget.status) === 'archived' ? (
                <>
                  &ldquo;{deleteTarget.title}&rdquo; will be permanently removed. Existing order and invoice snapshots will be retained.
                </>
              ) : (
                <>
                  &ldquo;{deleteTarget.title}&rdquo; will be permanently removed if it has no order history. Products with order history are archived first.
                </>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setDeleteTarget(null)} className="outline-button text-sm">
                Cancel
              </button>
              <button type="button" onClick={handleDelete}
                disabled={loadingProductId === deleteTarget.id}
                className="text-sm font-bold px-4 py-2"
                style={{ background: 'var(--color-error)', color: '#fff', fontFamily: 'var(--font-label)' }}>
                {loadingProductId === deleteTarget.id
                  ? 'Loading...'
                  : normalizeProductStatus(deleteTarget.status) === 'archived' ? 'Delete permanently' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation gate for the listing editor's close / cancel / save actions */}
      {editing && editorConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <div
            className="w-full max-w-sm border p-6 flex flex-col gap-4"
            style={{ background: 'var(--color-background)', borderColor: 'var(--color-outline-variant)' }}
          >
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              {editorConfirm.title}
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              {editorConfirm.message}
            </p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setEditorConfirm(null)} className="outline-button text-sm">
                Keep editing
              </button>
              <button type="button" onClick={editorConfirm.onConfirm} className="gold-button gold-button-gradient text-sm">
                {editorConfirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Heads-up before the Smart Assistant starts listening */}
      {editing && showMicPrompt && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <div
            className="w-full max-w-sm border p-6 flex flex-col gap-4"
            style={{ background: 'var(--color-background)', borderColor: 'var(--color-outline-variant)' }}
          >
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              Before you start talking
            </h2>
            <div className="flex flex-col gap-3 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              <p className="flex gap-2">
                <AppIcon name="mic" className="text-[1.1rem] leading-5" aria-hidden="true" style={{ color: 'var(--color-primary)' }} />
                <span>Your browser may pop up a request for microphone access — be sure to tap <strong>Allow</strong> (or Approve) so the assistant can hear you.</span>
              </p>
              <p className="flex gap-2">
                <AppIcon name="visibility" className="text-[1.1rem] leading-5" aria-hidden="true" style={{ color: 'var(--color-primary)' }} />
                <span>Once you begin, watch the text box below — your words will appear after a few moments. That&rsquo;s how you know it&rsquo;s working.</span>
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowMicPrompt(false)} className="outline-button text-sm">
                Cancel
              </button>
              <button type="button" onClick={() => { setShowMicPrompt(false); startAiRecording(); }} className="gold-button gold-button-gradient text-sm">
                Start recording
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
