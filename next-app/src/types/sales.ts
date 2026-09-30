export type PaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export type FulfillmentStatus =
  | 'pending'
  | 'packed'
  | 'shipped'
  | 'picked_up'
  | 'cancelled';

export type OrderStatus = 'open' | 'completed' | 'cancelled' | 'refunded';

export type ShippingMethod = 'pickup' | 'shipping' | 'local_delivery';

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  inventory_number: string | null;
  title_snapshot: string;
  item_year_snapshot: number | null;
  metal_snapshot: string | null;
  purity_snapshot: string | null;
  gram_weight_snapshot: number | null;
  price_snapshot: number;
  quantity?: number;
  discount?: number;
  image_snapshot: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  subtotal: number;
  tax: number;
  shipping_fee: number;
  discount: number;
  total: number;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  order_status: OrderStatus;
  payment_method: string | null;
  payment_reference: string | null;
  shipping_method: ShippingMethod;
  shipping_carrier?: string | null;
  tracking_number?: string | null;
  shipping_address: Record<string, unknown> | null;
  billing_address: Record<string, unknown> | null;
  internal_notes: string | null;
  customer_notes: string | null;
  refund_amount: number | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
}

export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function formatOrderDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function orderStatusLabel(value: string | null | undefined): string {
  if (!value) return '-';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatOrderAddress(address: Record<string, unknown> | null): string | null {
  if (!address) return null;

  // Checkout stores the street as `line1` / `line2` (buildAddressObject);
  // older rows and the manual admin form use `address_line1` / `address_line2`.
  // Reading only the latter dropped the street from every checkout order on
  // the account page and the guest lookup (found 2026-09-17).
  const street1 = address.address_line1 ?? address.line1;
  const street2 = address.address_line2 ?? address.line2;
  const addressParts = [street1, street2, address.city, address.state, address.postal_code]
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map((value) => String(value).trim())
    .filter(Boolean);

  // Checkout may retain a default country even when the buyer entered no address.
  if (addressParts.length === 0) return null;

  const country = address.country;
  if (typeof country === 'string' || typeof country === 'number') {
    const normalizedCountry = String(country).trim();
    if (normalizedCountry) addressParts.push(normalizedCountry);
  }

  return addressParts.join(', ');
}

/** Formats a stored purity snapshot for display — appends "K" for karat gold values
 *  (1-24); leaves other values (e.g. silver fineness like 925) unchanged. */
export function formatPublicPurity(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim();
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0 && numeric <= 24) {
    return `${numeric}K`;
  }
  return normalized;
}
