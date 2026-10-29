'use client';

import type { BillingForm } from '@/lib/card-billing';

/**
 * The billing boxes under the card form — the billing ZIP for Local Pickup, or
 * "Billing address same as shipping" (unticked = street / apt / city / state /
 * ZIP). Shared by the checkout pay box and the Make an Offer hold box; the
 * address itself is built by `buildCardBillingAddress` (lib/card-billing.ts).
 */
export default function CardBillingInputs({
  idPrefix,
  pickup,
  billingSame,
  onBillingSameChange,
  billing,
  onBillingChange,
  isEs,
  separateOnly = false,
}: {
  /** A shipped gift: no "same as shipping" box (that address is the
   *  recipient's) — the billing boxes always show. */
  separateOnly?: boolean;
  /** Keeps the input ids unique if two forms ever share a page. */
  idPrefix: string;
  pickup: boolean;
  billingSame: boolean;
  onBillingSameChange: (same: boolean) => void;
  billing: BillingForm;
  onBillingChange: (billing: BillingForm) => void;
  isEs: boolean;
}) {
  const set = (key: keyof BillingForm) => (e: { target: { value: string } }) => onBillingChange({ ...billing, [key]: e.target.value });

  if (pickup) {
    return (
      <div className="mt-2">
        <label className="form-label" htmlFor={`${idPrefix}-zip`}>{isEs ? 'Código postal de facturación' : 'Billing ZIP code'}</label>
        <input
          id={`${idPrefix}-zip`}
          className="form-field"
          inputMode="numeric"
          autoComplete="billing postal-code"
          value={billing.zip}
          onChange={set('zip')}
        />
      </div>
    );
  }

  return (
    <>
      {separateOnly ? (
        <p className="mt-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs
            ? 'Su dirección de facturación (la de la tarjeta, no la de quien recibe el regalo):'
            : 'Your billing address (the card’s — not the gift recipient’s):'}
        </p>
      ) : (
        <label className="mt-2 flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={billingSame}
            onChange={(e) => onBillingSameChange(e.target.checked)}
            style={{ accentColor: 'var(--color-primary)', width: '1.05rem', height: '1.05rem', flexShrink: 0, cursor: 'pointer' }}
          />
          {isEs ? 'Dirección de facturación igual a la de envío' : 'Billing address same as shipping'}
        </label>
      )}
      {!billingSame && (
        <div className="mt-2 grid gap-2">
          <div>
            <label className="form-label" htmlFor={`${idPrefix}-line1`}>{isEs ? 'Dirección de facturación' : 'Billing street address'}</label>
            <input id={`${idPrefix}-line1`} className="form-field" autoComplete="billing address-line1" value={billing.line1} onChange={set('line1')} />
          </div>
          <div>
            <label className="form-label" htmlFor={`${idPrefix}-line2`}>{isEs ? 'Apto., suite (opcional)' : 'Apt, suite (optional)'}</label>
            <input id={`${idPrefix}-line2`} className="form-field" autoComplete="billing address-line2" value={billing.line2} onChange={set('line2')} />
          </div>
          <div>
            <label className="form-label" htmlFor={`${idPrefix}-city`}>{isEs ? 'Ciudad' : 'City'}</label>
            <input id={`${idPrefix}-city`} className="form-field" autoComplete="billing address-level2" value={billing.city} onChange={set('city')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label" htmlFor={`${idPrefix}-state`}>{isEs ? 'Estado' : 'State'}</label>
              <input id={`${idPrefix}-state`} className="form-field" autoComplete="billing address-level1" value={billing.state} onChange={set('state')} />
            </div>
            <div>
              <label className="form-label" htmlFor={`${idPrefix}-zip`}>{isEs ? 'Código postal' : 'ZIP code'}</label>
              <input id={`${idPrefix}-zip`} className="form-field" inputMode="numeric" autoComplete="billing postal-code" value={billing.zip} onChange={set('zip')} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
