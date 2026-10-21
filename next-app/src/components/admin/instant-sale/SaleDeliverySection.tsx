'use client';

import { formatCurrency } from '@/types/sales';
import {
  IN_STORE_SHIPPING_CHOICES,
  IN_STORE_SHIPPING_FEE_MAX,
  IN_STORE_SHIPPING_LABELS,
  inStoreTableShippingFee,
  type InStoreShippingChoice,
} from '@/lib/in-store-sale';

export type DeliveryMethod = 'pickup' | 'ship';
export type SaleAddressDraft = { line1: string; line2: string; city: string; state: string; zip: string };
export const EMPTY_SALE_ADDRESS: SaleAddressDraft = { line1: '', line2: '', city: '', state: '', zip: '' };

const label = 'form-label';
const labelStyle = { color: 'var(--color-primary)' } as const;
const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;

function Optional() {
  return <span style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.06em' }}> optional</span>;
}

/**
 * Section "3. Pickup or ship" of Admin → Instant Sale (In-store: owner
 * 2026-10-20; shared with the Remote sale 2026-10-21). On a remote sale the
 * ship-to address may stay blank: the customer types it on the payment page.
 */
export default function SaleDeliverySection({
  variant,
  delivery,
  onDelivery,
  mailingOn,
  onMailingOn,
  address,
  onAddress,
  shipping,
  onShipping,
  customFee,
  onCustomFee,
  priceValue,
  itemCount,
}: {
  variant: 'in-store' | 'remote';
  delivery: DeliveryMethod;
  onDelivery: (value: DeliveryMethod) => void;
  mailingOn: boolean;
  onMailingOn: (value: boolean) => void;
  address: SaleAddressDraft;
  onAddress: (patch: Partial<SaleAddressDraft>) => void;
  shipping: InStoreShippingChoice;
  onShipping: (value: InStoreShippingChoice) => void;
  customFee: string;
  onCustomFee: (value: string) => void;
  /** The items' total; the shipping table goes by it. */
  priceValue: number | null;
  itemCount: number;
}) {
  const shipped = delivery === 'ship';
  const showAddress = shipped || mailingOn;
  const remote = variant === 'remote';
  const addressRequired = shipped && !remote;

  return (
    <section className="rounded-[1.25rem] border bg-white p-5 grid gap-4" style={cardStyle}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>3. Pickup or ship</h2>
        <div className="inline-flex rounded-full border p-[3px] gap-[3px]" role="group" aria-label="Pickup or ship" style={{ ...cardStyle, background: 'var(--color-surface-container-low)' }}>
          {(['pickup', 'ship'] as DeliveryMethod[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onDelivery(value)}
              aria-pressed={delivery === value}
              className="rounded-full px-4 py-2 text-[0.65rem] font-bold uppercase tracking-[0.12em]"
              style={{ fontFamily: 'var(--font-label)', background: delivery === value ? '#fff' : 'transparent', color: delivery === value ? 'var(--color-primary)' : 'var(--color-on-surface-variant)', boxShadow: delivery === value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
            >
              {value === 'pickup' ? 'Pickup' : 'Ship'}
            </button>
          ))}
        </div>
      </div>

      {shipped ? (
        <span className="text-[0.85rem]" style={hintStyle}>
          {remote ? (
            <>The address is <strong>optional here</strong> — left blank, the customer types it on the payment page. Florida tax is added for a Florida address, none out of state (the web checkout rule).</>
          ) : (
            <>You ship it after the sale. The order waits under <strong>Orders → Fulfillment: Pending</strong> until you mark it shipped.</>
          )}
        </span>
      ) : (
        <>
          <span className="text-[0.85rem]" style={hintStyle}>
            {remote
              ? <>The customer collects it at the showroom after paying. It waits under <strong>Orders</strong> as unpaid until then.</>
              : <>The customer leaves with it. Recorded as <strong>picked up</strong>, as before.</>}
          </span>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer w-fit">
            <input type="checkbox" checked={mailingOn} onChange={(e) => onMailingOn(e.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: 'var(--color-primary)' }} />
            Add a mailing address<span className="text-xs" style={hintStyle}>optional</span>
          </label>
        </>
      )}

      {showAddress && (
        <div className="grid gap-3 sm:grid-cols-2">
          <span className={label} style={{ ...labelStyle, gridColumn: '1 / -1', margin: 0 }}>
            {shipped ? 'Ship to' : 'Mailing address'}{shipped && remote ? <Optional /> : null}
          </span>
          <label className="block sm:col-span-2"><span className={label} style={labelStyle}>Street</span><input className="form-field" value={address.line1} maxLength={120} onChange={(e) => onAddress({ line1: e.target.value })} placeholder={shipped && remote ? 'Customer fills it in' : undefined} autoComplete="off" required={addressRequired} /></label>
          <label className="block sm:col-span-2"><span className={label} style={labelStyle}>Apt / suite<Optional /></span><input className="form-field" value={address.line2} maxLength={60} onChange={(e) => onAddress({ line2: e.target.value })} autoComplete="off" /></label>
          <label className="block"><span className={label} style={labelStyle}>City</span><input className="form-field" value={address.city} maxLength={60} onChange={(e) => onAddress({ city: e.target.value })} autoComplete="off" required={addressRequired} /></label>
          <div className="grid gap-3 grid-cols-[1fr_1.3fr]">
            <label className="block"><span className={label} style={labelStyle}>State</span><input className="form-field" value={address.state} maxLength={20} onChange={(e) => onAddress({ state: e.target.value })} placeholder="FL" autoComplete="off" autoCapitalize="characters" required={addressRequired} /></label>
            <label className="block"><span className={label} style={labelStyle}>ZIP</span><input className="form-field" inputMode="numeric" value={address.zip} maxLength={10} onChange={(e) => onAddress({ zip: e.target.value })} placeholder="34103" autoComplete="off" required={addressRequired} /></label>
          </div>
          <span className="text-xs sm:col-span-2" style={hintStyle}>U.S. addresses only, checked the same way as web checkout.{shipped ? '' : ' Saved on the order only — never added to a mailing list.'}</span>
        </div>
      )}

      {shipped && (
        <div className="grid gap-2">
          <span className={label} style={{ ...labelStyle, margin: 0 }}>Shipping charge</span>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2" role="group" aria-label="Shipping charge">
            {IN_STORE_SHIPPING_CHOICES.map((choice) => {
              const on = shipping === choice;
              const fee = choice === 'custom' ? null : priceValue != null ? inStoreTableShippingFee(choice, priceValue) : null;
              const unavailable = choice === 'express' && priceValue != null && fee == null;
              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => onShipping(choice)}
                  disabled={unavailable}
                  aria-pressed={on}
                  className="rounded-full border px-4 py-2 text-[0.7rem] font-bold uppercase tracking-[0.08em] disabled:opacity-40"
                  style={{ fontFamily: 'var(--font-label)', borderColor: on ? 'var(--color-primary)' : 'var(--color-outline-variant)', background: on ? '#fbf5dd' : '#fff', color: on ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}
                >
                  {IN_STORE_SHIPPING_LABELS[choice]}
                  <span className="block text-[0.72rem] font-semibold normal-case tracking-[0.04em]">
                    {choice === 'custom' ? 'Type it' : unavailable ? 'Not at $5,000+' : fee != null ? formatCurrency(fee) : '—'}
                  </span>
                </button>
              );
            })}
          </div>
          {shipping === 'custom' && (
            <label className="block sm:max-w-[12rem]">
              <span className={label} style={labelStyle}>Shipping charge $</span>
              <input className="form-field text-lg font-semibold" inputMode="decimal" value={customFee} onChange={(e) => onCustomFee(e.target.value)} placeholder="25" autoComplete="off" required />
            </label>
          )}
          <span className="text-xs" style={hintStyle}>
            {shipping === 'custom'
              ? `Any amount up to ${formatCurrency(IN_STORE_SHIPPING_FEE_MAX)}.`
              : `The website's own shipping fees${priceValue != null ? ` for ${itemCount > 1 ? `${formatCurrency(priceValue)} of items` : `a ${formatCurrency(priceValue)} item`}` : ''}. Express is not offered at $5,000 and up, the same as online.`}
          </span>
        </div>
      )}
    </section>
  );
}
