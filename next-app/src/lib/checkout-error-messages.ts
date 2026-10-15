// Pure helpers for the PayPal checkout error UX (see PayPalCheckoutButton).
// Extracted so the message/escalation logic is unit-testable without a browser.

/**
 * Does a server error message indicate an item is no longer buyable (sold out,
 * low stock, or won by another buyer)? Used to show a stock-specific message and
 * trigger a live re-check instead of a generic PayPal error. Fallback only —
 * when the server sends a machine-readable `code`,
 * checkoutErrorMessageForCode below takes precedence (this regex misfires on
 * the Express-over-$5,000 message, which contains "not available").
 */
export function isAvailabilityError(message: string | undefined | null): boolean {
  if (!message) return false;
  return /no longer available|not available|unavailable|sold|out of stock|not enough stock|just purchased|another buyer/i.test(message);
}

/**
 * Precise bilingual guidance for a server checkout rejection code (see
 * OrderDraftErrorCode in checkout-pricing.ts). Returns null for unknown/absent
 * codes so callers fall back to the message-pattern classification above.
 * 'unavailable' is intentionally NOT mapped here — it flows through the
 * existing availability path, which also re-checks live stock.
 */
export function checkoutErrorMessageForCode(
  code: string | undefined | null,
  isEs: boolean,
): string | null {
  switch (code) {
    case 'express_unavailable':
      return isEs
        ? 'El envío Express nocturno no está disponible para pedidos de $5,000 o más (límite de seguro del transportista). Elija la opción de envío asegurado estándar en su resumen y vuelva a intentarlo.'
        : 'Express Overnight shipping isn’t available for orders of $5,000 or more (carrier insurance limit). Choose the standard Insured Shipping option in your order summary and try again.';
    case 'spot_unavailable':
      return isEs
        ? 'El precio del metal en vivo no está disponible en este momento, así que los artículos con precio spot no se pueden comprar en línea ahora. Llámenos al (239) 404-8505 para completar su compra.'
        : 'Live metal pricing is temporarily unavailable, so spot-priced items can’t be purchased online right now. Please call (239) 404-8505 to complete your purchase.';
    case 'call_to_purchase':
      return isEs
        ? 'Un artículo de su pedido aún no está disponible para compra en línea. Llámenos al (239) 404-8505 para comprarlo.'
        : 'An item in your order isn’t available for online purchase yet. Please call (239) 404-8505 to buy it.';
    // The amounts live in the summary banner (CheckoutClient) because only the
    // page knows them. This message sits at the pay button, where the buyer
    // just clicked — and the "not been charged" line is the load-bearing part:
    // a price-change notice appearing mid-payment otherwise reads like a bill
    // they have just been handed.
    case 'price_changed':
      return isEs
        ? 'El precio se actualizó. Los precios de los metales cambian durante el día. NO se le ha cobrado — revise el resumen actualizado arriba y marque la casilla de confirmación para continuar.'
        : 'The price updated. Metal prices move through the day. You have NOT been charged — review the updated summary above and tick the confirmation box to continue.';
    case 'discount_invalid':
      return isEs
        ? 'El código de descuento de este pedido ya no es válido — puede haber expirado o alcanzado su límite de usos. Quítelo con “Quitar” en su resumen e intente de nuevo.'
        : 'The discount code on this order is no longer valid — it may have expired or reached its usage limit. Remove it with “Remove” in your order summary and try again.';
    // A counter-offer's Buy-now link (lib/offers.ts) that ran out, was used, or
    // whose piece sold. Nothing was charged.
    case 'counter_unavailable':
      return isEs
        ? 'Esta contraoferta ya no está disponible (venció, ya se pagó o la pieza se vendió). No se le ha cobrado. Llámenos al (239) 404-8505 si tiene preguntas.'
        : 'This counter-offer is no longer available (it expired, was already paid, or the piece sold). You have not been charged. Call (239) 404-8505 with any questions.';
    default:
      return null;
  }
}

/**
 * Message for a generic PayPal failure we can't attribute to a specific cause.
 * Because the buyer may have been paying by debit/credit card through PayPal's
 * hosted card form, a card problem is a real possibility — so on the FIRST return
 * we suggest re-checking the card details "just in case", and on the SECOND we
 * suggest trying a different card. Both keep the sold-out possibility in view (a
 * re-check runs in parallel and flags it in the summary if that's the real cause).
 *
 * @param attempt 1-based count of consecutive unknown errors this session.
 */
export function composeUnknownErrorMessage(attempt: number, isEs: boolean): string {
  if (attempt >= 2) {
    return isEs
      ? 'El pago aún no se completó. Es posible que su tarjeta no se acepte — intente con una tarjeta diferente, o llámenos al (239) 404-8505 y le ayudamos a completar su compra. (Si un artículo aparece agotado en su resumen de arriba, quítelo e intente de nuevo.)'
      : 'The payment still didn’t go through. Your card may not be going through — please try a different card, or call us at (239) 404-8505 and we’ll help you complete your purchase. (If an item now shows as sold out in your order summary above, remove it and try again.)';
  }
  return isEs
    ? 'PayPal lo devolvió sin completar el pago y no obtuvimos un motivo exacto. Si pagó con tarjeta de débito o crédito, verifique el número y los datos de la tarjeta e intente de nuevo. (Si un artículo aparece agotado en su resumen de arriba, esa es la causa.)'
    : 'PayPal sent you back without completing the payment, and we couldn’t get an exact reason. If you paid by debit or credit card, please re-enter and double-check your card number and details, then try again. (If an item now shows as sold out in your order summary above, that’s the cause instead.)';
}
