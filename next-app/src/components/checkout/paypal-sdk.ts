'use client';

// The slice of the PayPal JS SDK (v5) the checkout uses, plus Apple Pay and
// Google Pay. Card fields, Apple Pay and Google Pay are PayPal "Advanced
// Checkout" (owner's yes + PayPal approval, 2026-10-28) — PayPal processes every
// one of them; card numbers never reach our server.

export type PayPalButtonsActions = { resolve: () => Promise<void>; reject: () => Promise<void> };
export type PayPalButtonsConfig = {
  fundingSource?: string;
  style?: Record<string, unknown>;
  onClick?: (data: Record<string, unknown>, actions: PayPalButtonsActions) => Promise<void> | void;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel?: () => void;
  onError?: (err: unknown) => void;
};
export type PayPalButtonsInstance = {
  render: (container: HTMLElement) => Promise<void>;
  isEligible?: () => boolean;
  close?: () => void;
};

export type PayPalCardField = {
  render: (container: HTMLElement) => Promise<void>;
  clear?: () => void;
  close?: () => Promise<void> | void;
};
export type PayPalCardFieldsState = {
  isFormValid: boolean;
  fields: Record<string, { isValid: boolean; isEmpty: boolean } | undefined>;
};
export type PayPalBillingAddress = {
  addressLine1?: string;
  addressLine2?: string;
  adminArea1?: string;
  adminArea2?: string;
  postalCode?: string;
  countryCode?: string;
};
export type PayPalCardFieldsConfig = {
  style?: Record<string, Record<string, string>>;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string; liabilityShift?: string }) => Promise<void> | void;
  onError: (err: unknown) => void;
};
export type PayPalCardFieldsInstance = {
  isEligible: () => boolean;
  NumberField: (options?: { placeholder?: string }) => PayPalCardField;
  ExpiryField: (options?: { placeholder?: string }) => PayPalCardField;
  CVVField: (options?: { placeholder?: string }) => PayPalCardField;
  NameField: (options?: { placeholder?: string }) => PayPalCardField;
  getState: () => Promise<PayPalCardFieldsState>;
  submit: (options?: { billingAddress?: PayPalBillingAddress }) => Promise<void>;
};

export type ApplePayConfig = {
  isEligible: boolean;
  countryCode: string;
  merchantCapabilities: string[];
  supportedNetworks: string[];
};
export type PayPalApplePay = {
  config: () => Promise<ApplePayConfig>;
  validateMerchant: (options: { validationUrl: string; displayName?: string }) => Promise<{ merchantSession: unknown }>;
  confirmOrder: (options: { orderId: string; token: unknown; billingContact?: unknown }) => Promise<unknown>;
};

export type GooglePayConfig = {
  isEligible: boolean;
  apiVersion: number;
  apiVersionMinor: number;
  allowedPaymentMethods: unknown[];
  merchantInfo: unknown;
  countryCode?: string;
};
export type PayPalGooglePay = {
  config: () => Promise<GooglePayConfig>;
  confirmOrder: (options: { orderId: string; paymentMethodData: unknown }) => Promise<{ status?: string }>;
  initiatePayerAction: (options: { orderId: string }) => Promise<unknown>;
};

export type PayPalNamespace = {
  Buttons: (config: PayPalButtonsConfig) => PayPalButtonsInstance;
  CardFields?: (config: PayPalCardFieldsConfig) => PayPalCardFieldsInstance;
  Applepay?: () => PayPalApplePay;
  Googlepay?: () => PayPalGooglePay;
  FUNDING?: Record<string, string>;
};

export type GooglePaymentsClient = {
  isReadyToPay: (request: Record<string, unknown>) => Promise<{ result: boolean }>;
  createButton: (options: Record<string, unknown>) => HTMLElement;
  loadPaymentData: (request: Record<string, unknown>) => Promise<unknown>;
};
export type GooglePaymentAuthorizationResult = {
  transactionState: 'SUCCESS' | 'ERROR';
  error?: { intent: string; reason: string; message: string };
};

export type ApplePaySessionInstance = {
  onvalidatemerchant: ((event: { validationURL: string }) => void) | null;
  onpaymentauthorized: ((event: { payment: { token: unknown; billingContact?: unknown } }) => void) | null;
  oncancel: (() => void) | null;
  completeMerchantValidation: (merchantSession: unknown) => void;
  completePayment: (status: number) => void;
  abort: () => void;
  begin: () => void;
};
export type ApplePaySessionConstructor = {
  new (version: number, request: Record<string, unknown>): ApplePaySessionInstance;
  canMakePayments: () => boolean;
  STATUS_SUCCESS: number;
  STATUS_FAILURE: number;
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
    ApplePaySession?: ApplePaySessionConstructor;
    google?: {
      payments?: {
        api?: {
          PaymentsClient: new (options: Record<string, unknown>) => GooglePaymentsClient;
        };
      };
    };
  }
}

const sdkPromises: Record<string, Promise<void> | undefined> = {};

export function loadPayPalSdk(clientId: string, currency: string): Promise<void> {
  const key = `${clientId}:${currency}`;
  if (typeof window !== 'undefined' && window.paypal) return Promise.resolve();
  const existing = sdkPromises[key];
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const params = new URLSearchParams({
      'client-id': clientId,
      currency,
      intent: 'capture',
      // card-fields / applepay / googlepay = Advanced Checkout (2026-10-28). Each
      // is only shown when PayPal says this account and this buyer are eligible.
      components: 'buttons,card-fields,applepay,googlepay',
      // Pay Later stays OFF (owner, 2026-10-28). Venmo stays on.
      'disable-funding': 'paylater,credit',
    });
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      delete sdkPromises[key];
      reject(new Error('Failed to load PayPal SDK'));
    };
    document.body.appendChild(script);
  });
  sdkPromises[key] = promise;
  return promise;
}

let googlePayPromise: Promise<void> | null = null;

/** Google's pay.js — needed only to draw and open Google Pay. */
export function loadGooglePayJs(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.payments?.api) return Promise.resolve();
  if (googlePayPromise) return googlePayPromise;
  googlePayPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://pay.google.com/gp/p/js/pay.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googlePayPromise = null;
      reject(new Error('Failed to load Google Pay'));
    };
    document.body.appendChild(script);
  });
  return googlePayPromise;
}

/** The card boxes are PayPal iframes; this styles the input inside each to match `.form-field`. */
export const CARD_FIELD_STYLE: Record<string, Record<string, string>> = {
  input: {
    'font-size': '16px', // 16px: iOS zooms the page into any smaller input
    'font-family': 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    color: '#1a1c1c',
    padding: '0.65rem 0.85rem',
    border: '1px solid #d0c5af',
    'border-radius': '0.75rem',
    'box-shadow': 'none',
  },
  'input:focus': {
    border: '1px solid #735c00',
    'box-shadow': '0 0 0 2px rgba(115, 92, 0, 0.25)',
  },
  '.invalid': {
    color: '#ba1a1a',
  },
};
