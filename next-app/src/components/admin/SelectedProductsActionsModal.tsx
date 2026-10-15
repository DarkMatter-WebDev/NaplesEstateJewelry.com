'use client';

import { AppIcon } from '@/components/AppIcon';

type SelectedMarketplaceAction =
  | 'etsy'
  | 'ebay'
  | 'both'
  | 'check-etsy'
  | 'check-ebay'
  | 'repair-etsy'
  | 'publish-etsy-ready'
  | 'publish-ready'
  | 'ebay-best-offer-on'
  | 'ebay-best-offer-off'
  | 'site-offers-on'
  | 'site-offers-off';

interface Props {
  count: number;
  onClose: () => void;
  onChoose: (action: SelectedMarketplaceAction) => void;
}

const iconStyle = {
  lineHeight: 1,
};

function ActionButton({
  icon,
  title,
  description,
  onClick,
  disabled = false,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 border px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-container)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--color-surface-container-lowest)]"
      style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}
    >
      <AppIcon name={icon} className="shrink-0" style={{ ...iconStyle, fontSize: '22px', color: 'var(--color-primary)' }} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-label)' }}>
          {title}
        </span>
        <span className="mt-1 block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          {description}
        </span>
      </span>
      <AppIcon name="chevron_right" className="ml-auto shrink-0" style={{ ...iconStyle, fontSize: '20px', color: 'var(--color-on-surface-variant)' }} aria-hidden="true" />
    </button>
  );
}

export default function SelectedProductsActionsModal({ count, onClose, onChoose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto whitespace-normal p-4 sm:items-center"
      style={{ background: 'rgba(0,0,0,0.52)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="selected-products-actions-title"
    >
      <div
        className="min-w-0 w-full max-w-lg max-h-[calc(100svh-2rem)] overflow-y-auto border p-5 shadow-2xl [overflow-wrap:anywhere] md:p-6"
        style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-background)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
              {count > 0 ? `${count} selected ${count === 1 ? 'item' : 'items'}` : 'No items selected'}
            </p>
            <h2 id="selected-products-actions-title" className="mt-1 text-2xl font-bold" style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-headline)' }}>
              Choose an action
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: 'var(--color-on-surface-variant)' }}
            aria-label="Close selected product actions"
            title="Close"
          >
            <AppIcon name="close"  style={iconStyle} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          Sync selected products, compare their marketplace status, turn site offers or eBay Best Offer on or off, or publish completed marketplace drafts that are ready to go live.
        </p>

        <p className="mt-5 text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
          Sync selected
        </p>
        <div className="mt-2 grid gap-2">
          <ActionButton
            icon="shopping_bag"
            title="Sync to Etsy"
            description="Prepare the selected products as Etsy drafts or active listings, based on your Etsy settings."
            onClick={() => onChoose('etsy')}
            disabled={count === 0}
          />
          <ActionButton
            icon="store"
            title="Sync to eBay"
            description="Prepare the selected products on eBay, following the current eBay publish settings."
            onClick={() => onChoose('ebay')}
            disabled={count === 0}
          />
          <ActionButton
            icon="edit_note"
            title="Sync to both"
            description="Run Etsy first, then eBay after the Etsy batch finishes successfully."
            onClick={() => onChoose('both')}
            disabled={count === 0}
          />
        </div>

        <p className="mt-5 text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
          Repair Etsy sync
        </p>
        <div className="mt-2 grid gap-2">
          <ActionButton
            icon="sync"
            title="Repair all Etsy sync issues"
            description="Resume interrupted image batches and refresh every linked listing that still needs synchronization."
            onClick={() => onChoose('repair-etsy')}
          />
        </div>

        <p className="mt-5 text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
          Check marketplace status
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ActionButton
            icon="sync"
            title="Check Etsy status"
            description="Reconcile the selected products with Etsy without pushing content."
            onClick={() => onChoose('check-etsy')}
            disabled={count === 0}
          />
          <ActionButton
            icon="sync"
            title="Check eBay status"
            description="Reconcile the selected products with eBay without pushing content."
            onClick={() => onChoose('check-ebay')}
            disabled={count === 0}
          />
        </div>

        {/* The site shop's own "Accept offers" box, for many items at once
            (owner, 2026-10-15). Separate from eBay Best Offer below. */}
        <p className="mt-5 text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
          Site offers
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ActionButton
            icon="sell"
            title="Set all accept offers"
            description="Tick Accept offers on the selected items. Each shows Make an Offer on its page."
            onClick={() => onChoose('site-offers-on')}
            disabled={count === 0}
          />
          <ActionButton
            icon="remove"
            title="Set all no offers"
            description="Untick Accept offers on the selected items. Offers already open stay until you answer them."
            onClick={() => onChoose('site-offers-off')}
            disabled={count === 0}
          />
        </div>

        <p className="mt-5 text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
          eBay Best Offer
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ActionButton
            icon="sell"
            title="Allow offers on eBay"
            description="Turn Best Offer on for the selected items. Live listings show Make Offer right away."
            onClick={() => onChoose('ebay-best-offer-on')}
            disabled={count === 0}
          />
          <ActionButton
            icon="remove"
            title="Turn offers off on eBay"
            description="Turn Best Offer off for the selected items. Live listings go back to Buy It Now only."
            onClick={() => onChoose('ebay-best-offer-off')}
            disabled={count === 0}
          />
        </div>

        <p className="mt-5 text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
          Publish ready listings
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ActionButton
            icon="shopping_bag"
            title="Publish all ready to Etsy"
            description="Publish every completed Etsy draft currently awaiting review."
            onClick={() => onChoose('publish-etsy-ready')}
          />
          <ActionButton
            icon="store"
            title="Publish all ready to eBay"
            description="Publish every eBay listing currently in the Ready to publish state."
            onClick={() => onChoose('publish-ready')}
          />
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="outline-button text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export type { SelectedMarketplaceAction };
