// What a lead form says when a send fails — shared by the free-appraisal,
// contact and product-inquiry forms.
//
// Why (2026-09-20): with "Send another" on the success panel a real customer can
// now reach the routes' rate limit (HTTP 429 after a handful of sends in a short
// time). The forms used to answer every failure with "Failed to send. Please try
// again." — which, at the limit, tells the customer to do the one thing that
// cannot work. At the limit the form now says so and offers the phone.

import { CONTACT_PHONE_DISPLAY } from './contact-links';

/** Thrown by a form's submit handler so the catch block can see the status. */
export class LeadSendError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`lead form send failed (${status})`);
    this.name = 'LeadSendError';
    this.status = status;
  }
}

export function leadSendErrorMessage(error: unknown, isEs: boolean, fallback: string): string {
  if (error instanceof LeadSendError && error.status === 429) {
    return isEs
      ? `Ha enviado varios mensajes en poco tiempo. Espere unos minutos, o llame o envíe un texto al ${CONTACT_PHONE_DISPLAY}.`
      : `You've sent several in a short time. Please wait a few minutes, or call or text ${CONTACT_PHONE_DISPLAY}.`;
  }
  return fallback;
}
