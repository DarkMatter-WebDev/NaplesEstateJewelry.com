import { normalizeUsState, normalizeUsZip } from '@/lib/us-address';

/**
 * The billing address sent with a card from our own card boxes (PayPal Advanced
 * Checkout, 2026-10-28) — shared by the checkout pay box and the Make an Offer
 * hold box (2026-10-29), so both ask the same thing the same way:
 *  - Local Pickup: the billing ZIP only (there is no shipping address to copy);
 *  - "Billing address same as shipping" ticked: the shipping address;
 *  - unticked: the street / city / state / ZIP the buyer typed.
 */

export type BillingForm = { line1: string; line2: string; city: string; state: string; zip: string };

export const EMPTY_BILLING_FORM: BillingForm = { line1: '', line2: '', city: '', state: '', zip: '' };

export type CardBillingAddress = {
  addressLine1?: string;
  addressLine2?: string;
  adminArea1?: string;
  adminArea2?: string;
  postalCode?: string;
  countryCode?: string;
};

/** Local pickup: `local-pickup` on the checkout and offers, `pickup` on a pay link. */
export function isPickupMethod(shippingMethod: string): boolean {
  return shippingMethod === 'local-pickup' || shippingMethod === 'pickup';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildCardBillingAddress(input: {
  shippingMethod: string;
  customer: Record<string, unknown>;
  billingSame: boolean;
  billing: BillingForm;
  isEs: boolean;
}): { value: CardBillingAddress } | { error: string } {
  const { billing, isEs: es } = input;
  if (isPickupMethod(input.shippingMethod)) {
    const zip = normalizeUsZip(billing.zip);
    if (!zip) return { error: es ? 'Escriba el código postal de facturación de la tarjeta.' : 'Enter the card’s billing ZIP code.' };
    return { value: { postalCode: zip, countryCode: 'US' } };
  }
  if (input.billingSame) {
    const c = input.customer;
    const line2 = text(c.address_line2);
    return {
      value: {
        addressLine1: text(c.address_line1),
        ...(line2 ? { addressLine2: line2 } : {}),
        adminArea2: text(c.city),
        adminArea1: normalizeUsState(c.state) ?? text(c.state),
        postalCode: normalizeUsZip(c.postal_code) ?? text(c.postal_code),
        countryCode: 'US',
      },
    };
  }
  const state = normalizeUsState(billing.state);
  const zip = normalizeUsZip(billing.zip);
  const missing = [
    !billing.line1.trim() && (es ? 'dirección' : 'street'),
    !billing.city.trim() && (es ? 'ciudad' : 'city'),
    !state && (es ? 'estado' : 'state'),
    !zip && (es ? 'código postal' : 'ZIP code'),
  ].filter(Boolean);
  if (missing.length > 0 || !state || !zip) {
    return { error: es ? `Complete la dirección de facturación: ${missing.join(', ')}.` : `Complete the billing address: ${missing.join(', ')}.` };
  }
  return {
    value: {
      addressLine1: billing.line1.trim(),
      ...(billing.line2.trim() ? { addressLine2: billing.line2.trim() } : {}),
      adminArea2: billing.city.trim(),
      adminArea1: state,
      postalCode: zip,
      countryCode: 'US',
    },
  };
}

/** Which card box PayPal says is wrong, in words, or null when the form is valid. */
export function cardFieldsProblem(
  state: { isFormValid: boolean; fields: Record<string, { isValid: boolean } | undefined> },
  isEs: boolean,
): string | null {
  if (state.isFormValid) return null;
  const field = (key: string) => state.fields[key];
  const bad = [
    !field('cardNumberField')?.isValid && (isEs ? 'número de tarjeta' : 'card number'),
    !field('cardExpiryField')?.isValid && (isEs ? 'vencimiento' : 'expiration date'),
    !field('cardCvvField')?.isValid && (isEs ? 'código de seguridad' : 'security code'),
    field('cardNameField') && !field('cardNameField')?.isValid && (isEs ? 'nombre en la tarjeta' : 'name on card'),
  ].filter(Boolean);
  return isEs
    ? `Revise: ${bad.length > 0 ? bad.join(', ') : 'los datos de la tarjeta'}.`
    : `Please check the ${bad.length > 0 ? bad.join(', ') : 'card details'}.`;
}
