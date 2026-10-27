import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import SiteHeader from '@/components/layout/SiteHeader';
import AccountDashboard from '@/components/account/AccountDashboard';
import { type CustomerProfile } from '@/components/account/AccountProfileForm';
import SiteFooter from '@/components/layout/SiteFooter';
import type { Order, OrderItem } from '@/types/sales';
import { getAccountMetadata } from '@/lib/account-metadata';
import { createServiceClient } from '@/lib/supabase/service';
import { savedCertificateForUser, savedCertificateView } from '@/lib/tax-exempt-server';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return getAccountMetadata('account', locale);
}

const CUSTOMER_PROFILE_COLUMNS = [
  'first_name',
  'last_name',
  'full_name',
  'email',
  'phone',
  'alternate_phone',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
  'marketing_opt_in',
  'marketing_opt_out',
  'is_admin',
].join(', ');

const ACCOUNT_ORDER_COLUMNS = [
  'id',
  'order_number',
  'user_id',
  'customer_name',
  'customer_email',
  'customer_phone',
  'subtotal',
  'tax',
  'shipping_fee',
  'discount',
  'total',
  'payment_status',
  'fulfillment_status',
  'order_status',
  'payment_method',
  'payment_reference',
  'shipping_method',
  'shipping_address',
  'billing_address',
  // internal_notes is deliberately NOT selected: it is admin-only and anything
  // fetched here is serialized into the customer's client payload.
  'customer_notes',
  'created_at',
  'updated_at',
  'order_items(id, order_id, product_id, inventory_number, title_snapshot, item_year_snapshot, metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot, quantity, discount, image_snapshot, created_at)',
].join(', ');
const ACCOUNT_ORDER_COLUMNS_WITHOUT_ITEM_YEAR_SNAPSHOT = ACCOUNT_ORDER_COLUMNS
  .replace('item_year_snapshot, ', '')
  .replace('quantity, ', '');

function isMissingItemYearColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('item_year'))
    || Boolean(error?.message?.toLowerCase().includes('quantity'));
}

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(isEs ? '/es/account/sign-in' : '/account/sign-in');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(CUSTOMER_PROFILE_COLUMNS)
    .eq('id', user.id)
    .single();

  const profileData = (profile ?? {}) as Partial<CustomerProfile> & { is_admin?: boolean };
  const displayName = profileData.full_name ?? profileData.first_name ?? user.email ?? 'Member';
  const isAdmin = profileData.is_admin === true;
  const memberSince = user.created_at
    ? new Intl.DateTimeFormat(isEs ? 'es-US' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(user.created_at))
    : (isEs ? 'No disponible' : 'Not available');
  const editableProfile: CustomerProfile = {
    id: user.id,
    first_name: profileData.first_name ?? null,
    last_name: profileData.last_name ?? null,
    full_name: profileData.full_name ?? null,
    email: profileData.email ?? user.email ?? null,
    phone: profileData.phone ?? null,
    alternate_phone: profileData.alternate_phone ?? null,
    address_line1: profileData.address_line1 ?? null,
    address_line2: profileData.address_line2 ?? null,
    city: profileData.city ?? null,
    state: profileData.state ?? null,
    postal_code: profileData.postal_code ?? null,
    country: profileData.country ?? 'United States',
    marketing_opt_in: profileData.marketing_opt_in ?? false,
    marketing_opt_out: profileData.marketing_opt_out ?? false,
  };
  const ordersResult = await supabase
    .from('orders')
    .select(ACCOUNT_ORDER_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(25);
  let orders = ordersResult.data;
  if (isMissingItemYearColumnError(ordersResult.error)) {
    const fallback = await supabase
      .from('orders')
      .select(ACCOUNT_ORDER_COLUMNS_WITHOUT_ITEM_YEAR_SNAPSHOT)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(25);
    orders = fallback.data;
  }
  const accountOrders = (orders ?? []) as unknown as Order[];
  const productIds = Array.from(new Set(
    accountOrders
      .flatMap((order) => order.order_items ?? [])
      .map((item) => item.product_id)
      .filter((id): id is string => Boolean(id)),
  ));
  const { data: productInventoryRows } = productIds.length > 0
    ? await supabase
        .from('products')
        .select('id, inventory_number')
        .in('id', productIds)
    : { data: [] };
  const productInventoryById = new Map(
    (productInventoryRows ?? []).map((product) => [String(product.id), product.inventory_number == null ? null : String(product.inventory_number)]),
  );
  const ordersWithInventory = accountOrders.map((order) => ({
    ...order,
    order_items: (order.order_items ?? []).map((item: OrderItem) => {
      const snapshotInventory = formatCustomerInventoryValue(item.inventory_number);
      const productInventory = item.product_id ? formatCustomerInventoryValue(productInventoryById.get(item.product_id)) : null;
      return {
        ...item,
        inventory_number: snapshotInventory ?? productInventory,
      };
    }),
  }));

  // Tax-exempt status (owner, 2026-10-27): the saved Florida certificate, or a
  // request saved to this account that still waits for approval. Read with the
  // service client (the tables have no customer access) for THIS user only.
  const taxService = createServiceClient();
  const [savedCertificate, pendingRequest] = await Promise.all([
    savedCertificateForUser(taxService, user.id).catch(() => null),
    taxService.from('tax_exempt_requests').select('id').eq('user_id', user.id).eq('status', 'pending').eq('save_to_account', true).limit(1),
  ]);
  const savedView = savedCertificate ? savedCertificateView(savedCertificate) : null;
  const taxExempt = {
    certificate: savedView
      ? { businessName: savedView.businessName, typeLabel: savedView.typeLabel, masked: savedView.masked, validThrough: savedView.validThrough, approvedOn: savedView.approvedOn }
      : null,
    pending: !savedView && (pendingRequest.data ?? []).length > 0,
  };

  return (
    <>
      <SiteHeader />
      <main className="account-page pt-24 md:pt-28 pb-0 min-h-svh">
        <section className="account-hero px-4 md:px-8">
          <div className="account-hero-inner ultrawide-page max-w-6xl mx-auto">
            <div className="account-hero-copy">
              <p
                className="text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3"
                style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
              >
                {isEs ? 'Mi Cuenta' : 'My Account'}
              </p>
              <h1
                className="text-4xl md:text-5xl font-bold leading-tight"
                style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
              >
                {isEs ? `Bienvenido, ${displayName}` : `Welcome, ${displayName}`}
              </h1>
              <p className="mt-5 max-w-xl text-sm md:text-base leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
                {isEs
                  ? 'Administra tu perfil, pedidos y preferencias.'
                  : 'Manage your profile, orders, and preferences.'}
              </p>
            </div>
          </div>
        </section>

        <AccountDashboard
          profile={editableProfile}
          fallbackEmail={user.email ?? null}
          locale={locale}
          isAdmin={isAdmin}
          memberSince={memberSince}
          orders={ordersWithInventory}
          taxExempt={taxExempt}
        />
      </main>
      <SiteFooter locale={locale} />
      <style>{`
        .account-page {
          position: relative;
          isolation: isolate;
          background: #ffffff;
        }
        .account-page::before {
          content: '';
          position: fixed;
          top: 0;
          right: 0;
          left: 0;
          /* var(--app-vh), not svh. Fixed and decorative, so it adds no
             document height - but it still RESIZED by 74.2px as the in-app
             browser chrome moved, dragging the gradient edge across the page.
             Being invisible to a document-height test is not the same as being
             invisible to the reader. */
          height: min(42rem, calc(var(--app-vh) * 0.82));
          pointer-events: none;
          z-index: 0;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0) 64%, rgba(255, 255, 255, 0.86) 91%, #ffffff 100%),
            linear-gradient(90deg, #ffffff 0%, rgba(255, 255, 255, 0.94) 35%, rgba(255, 255, 255, 0.26) 62%, rgba(255, 255, 255, 0.02) 100%),
            url('/assets/images/pages/account-hero-jewelry.webp') top right / cover no-repeat;
        }
        .account-hero {
          position: relative;
          min-height: 19rem;
          display: flex;
          align-items: center;
          overflow: visible;
          z-index: 1;
        }
        .account-hero-inner {
          position: relative;
          z-index: 1;
          width: 100%;
          padding-block: 3.5rem 4rem;
        }
        .account-hero-copy {
          max-width: 42rem;
        }
        .account-content {
          position: relative;
          z-index: 2;
          margin-top: -2.35rem;
        }
        .account-card,
        .account-profile-form {
          border: 1px solid rgba(115, 92, 0, 0.12) !important;
          border-radius: var(--radius-xl);
          background: #ffffff !important;
          box-shadow: 0 18px 48px rgba(42, 34, 12, 0.09);
        }
        .account-tabs {
          display: flex;
          align-items: stretch;
          overflow-x: auto;
          border: 1px solid rgba(115, 92, 0, 0.1);
          border-radius: var(--radius-xl);
          background: #ffffff;
          box-shadow: 0 18px 50px rgba(42, 34, 12, 0.08);
        }
        .account-tabs button,
        .account-tabs a {
          position: relative;
          min-width: 10.5rem;
          min-height: 4.6rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.65rem;
          padding: 1rem 1.25rem;
          color: var(--color-on-surface-variant);
          font-size: 0.82rem;
          font-weight: 700;
          white-space: nowrap;
          border-right: 1px solid rgba(115, 92, 0, 0.1);
          background: transparent;
          cursor: pointer;
        }
        .account-tabs button:last-child,
        .account-tabs a:last-child {
          border-right: 0;
        }
        .account-tabs button.active,
        .account-tabs a.active {
          color: var(--color-primary);
        }
        .account-tabs button.active::after,
        .account-tabs a.active::after {
          content: '';
          position: absolute;
          right: 1rem;
          bottom: 0;
          left: 1rem;
          height: 2px;
          background: linear-gradient(135deg, #dcb336, #b5890c);
        }
        .account-tabs .app-icon {
          font-size: 1.25rem;
        }
        .account-dashboard-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.9fr) minmax(18rem, 1fr);
          gap: 1.45rem;
          margin-top: 1.45rem;
          align-items: start;
        }
        .account-overview-panel .account-profile-form {
          margin-bottom: 0 !important;
          min-height: 31rem;
        }
        .account-tab-stack {
          display: grid;
          gap: 1rem;
        }
        .account-tab-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.25rem;
          padding: 1.4rem 1.8rem;
          border: 1px solid rgba(115, 92, 0, 0.1);
          border-radius: var(--radius-xl);
          background: #ffffff;
        }
        .account-tab-heading > div:first-child {
          min-width: 0;
        }
        .account-tab-heading-action {
          flex-shrink: 0;
          display: flex;
          justify-content: flex-end;
        }
        .account-heading-signout {
          min-width: 7.75rem;
          justify-content: center;
        }
        .account-tab-heading p,
        .account-tab-eyebrow {
          color: var(--color-primary);
          font-family: var(--font-label);
          font-size: 0.64rem;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .account-tab-heading h2,
        .account-tab-card h2 {
          margin-top: 0.35rem;
          color: var(--color-on-surface);
          font-size: 1.15rem;
          font-weight: 800;
        }
        .account-tab-heading span,
        .account-tab-card > p:not(.account-tab-eyebrow) {
          display: block;
          margin-top: 0.35rem;
          color: var(--color-on-surface-variant);
          font-size: 0.9rem;
          line-height: 1.45;
        }
        .account-tab-card {
          min-height: 31rem;
          padding: 2.1rem;
        }
        .account-empty-state {
          min-height: 18rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.55rem;
          margin-top: 1.5rem;
          border: 1px dashed rgba(115, 92, 0, 0.2);
          border-radius: var(--radius-xl);
          background: #ffffff;
          text-align: center;
        }
        .account-empty-state .app-icon {
          color: rgba(115, 92, 0, 0.34);
          font-size: 2.5rem;
        }
        .account-empty-state strong {
          color: var(--color-on-surface);
          font-size: 1rem;
        }
        .account-empty-state p {
          max-width: 22rem;
          color: var(--color-on-surface-variant);
          font-size: 0.86rem;
        }
        .account-order-list {
          display: grid;
          gap: 0.75rem;
          margin-top: 1.5rem;
        }
        .account-order-row {
          position: relative;
          display: grid;
          grid-template-columns: 1.2fr repeat(3, minmax(0, 0.75fr)) auto;
          gap: 1rem;
          align-items: center;
          width: 100%;
          text-align: left;
          padding: 1rem;
          border: 1px solid rgba(115, 92, 0, 0.12);
          border-radius: var(--radius-xl);
          background: #ffffff;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
          cursor: pointer;
        }
        .account-order-row:hover,
        .account-order-row:focus-visible {
          border-color: rgba(115, 92, 0, 0.32);
          box-shadow: 0 12px 28px rgba(42, 34, 12, 0.08);
          transform: translateY(-1px);
          outline: none;
        }
        .account-order-row span {
          display: block;
          color: var(--color-on-surface-variant);
          font-family: var(--font-label);
          font-size: 0.6rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .account-order-row strong {
          display: block;
          margin-top: 0.22rem;
          color: var(--color-on-surface);
          font-size: 0.88rem;
        }
        .account-order-row-icon {
          color: var(--color-primary) !important;
          font-size: 1.15rem !important;
          font-weight: 400 !important;
          letter-spacing: 0 !important;
          line-height: 1 !important;
          text-transform: none !important;
        }
        .account-order-dialog-backdrop {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: grid;
          place-items: center;
          padding: 1.25rem;
          background: rgba(20, 18, 14, 0.38);
          backdrop-filter: blur(5px);
        }
        .account-order-dialog {
          position: relative;
          width: min(72rem, calc(100vw - 4rem));
          max-height: min(96svh, calc(100svh - 1rem));
          overflow: auto;
          padding: 4.25rem 2.5rem 2.5rem;
          border: 1px solid rgba(115, 92, 0, 0.16);
          border-radius: var(--radius-xl);
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 28px 80px rgba(20, 18, 14, 0.24);
        }
        .account-order-dialog-close {
          position: absolute;
          top: 1rem;
          left: 1rem;
          width: 2.4rem;
          height: 2.4rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(115, 92, 0, 0.18);
          border-radius: 999px;
          color: var(--color-primary);
          background: #ffffff;
          box-shadow: 0 8px 18px rgba(42, 34, 12, 0.08);
        }
        .account-order-dialog-close .app-icon {
          font-size: 1.25rem;
        }
        .account-order-dialog-header {
          padding-bottom: 1.1rem;
          border-bottom: 1px solid rgba(115, 92, 0, 0.12);
        }
        .account-order-dialog-header h2 {
          margin-top: 0.25rem;
          color: var(--color-on-surface);
          font-size: 1.45rem;
          font-weight: 800;
        }
        .account-order-dialog-header > span,
        .account-order-muted {
          display: block;
          margin-top: 0.25rem;
          color: var(--color-on-surface-variant);
          font-size: 0.88rem;
        }
        .account-order-detail-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.75rem;
          margin: 1rem 0;
        }
        .account-order-detail-grid > div,
        .account-order-dialog-section {
          border: 1px solid rgba(115, 92, 0, 0.12);
          border-radius: var(--radius-xl);
          background: #ffffff;
        }
        .account-order-detail-grid > div {
          padding: 0.85rem;
        }
        .account-order-detail-grid span,
        .account-order-detail-line span {
          display: block;
          color: var(--color-primary);
          font-family: var(--font-label);
          font-size: 0.58rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .account-order-detail-grid strong,
        .account-order-detail-line strong {
          display: block;
          margin-top: 0.28rem;
          color: var(--color-on-surface);
          font-size: 0.88rem;
          overflow-wrap: anywhere;
        }
        .account-order-dialog-section {
          margin-top: 1rem;
          padding: 1rem;
        }
        .account-order-dialog-section h3 {
          color: var(--color-on-surface);
          font-size: 0.98rem;
          font-weight: 800;
          margin-bottom: 0.75rem;
        }
        .account-order-item-list {
          display: grid;
          gap: 0.7rem;
        }
        .account-order-item {
          display: grid;
          grid-template-columns: 4.5rem minmax(0, 1fr) auto;
          gap: 0.85rem;
          align-items: center;
          padding: 0.75rem;
          border: 1px solid rgba(115, 92, 0, 0.1);
          border-radius: var(--radius-lg);
          background: rgba(255, 255, 255, 0.74);
        }
        .account-order-item-link {
          color: inherit;
          text-decoration: none;
          transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }
        .account-order-item-link:hover,
        .account-order-item-link:focus-visible {
          border-color: rgba(115, 92, 0, 0.32);
          box-shadow: 0 10px 24px rgba(42, 34, 12, 0.08);
          outline: none;
          transform: translateY(-1px);
        }
        .account-order-item-link:hover strong,
        .account-order-item-link:focus-visible strong {
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 3px;
        }
        .account-order-item-image {
          position: relative;
          min-height: 4.5rem;
          border-radius: var(--radius-lg);
          background: var(--color-surface-container);
          overflow: hidden;
        }
        .account-order-item-image > .app-icon {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(115, 92, 0, 0.28);
          font-size: 1.8rem;
        }
        .account-order-item strong {
          display: block;
          color: var(--color-on-surface);
          font-size: 0.9rem;
          line-height: 1.25;
        }
        .account-order-item-inventory {
          display: inline-flex;
          width: fit-content;
          margin-top: 0.3rem;
          border: 1px solid rgba(115, 92, 0, 0.18);
          border-radius: 999px;
          background: rgba(181, 137, 12, 0.07);
          color: var(--color-primary);
          font-family: var(--font-label);
          font-size: 0.62rem;
          font-style: normal;
          font-weight: 800;
          letter-spacing: 0.08em;
          line-height: 1;
          padding: 0.22rem 0.45rem;
          text-transform: uppercase;
        }
        .account-order-item span {
          display: block;
          margin-top: 0.25rem;
          color: var(--color-on-surface-variant);
          font-size: 0.76rem;
        }
        .account-order-item b {
          color: var(--color-primary);
          font-size: 0.92rem;
          white-space: nowrap;
        }
        .account-order-dialog-columns {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }
        .account-order-detail-line {
          display: grid;
          grid-template-columns: minmax(7rem, 0.45fr) minmax(0, 1fr);
          gap: 0.75rem;
          align-items: start;
          padding-block: 0.42rem;
          border-top: 1px solid rgba(115, 92, 0, 0.08);
        }
        .account-order-detail-line:first-of-type {
          border-top: 0;
          padding-top: 0;
        }
        .account-order-detail-line.strong strong {
          color: var(--color-primary);
          font-size: 1rem;
        }
        .account-wishlist-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
          margin-top: 1.5rem;
        }
        .account-wishlist-card {
          display: grid;
          grid-template-columns: 6rem 1fr;
          gap: 0.9rem;
          padding: 0.85rem;
          border: 1px solid rgba(115, 92, 0, 0.12);
          border-radius: var(--radius-xl);
          background: #ffffff;
        }
        .account-wishlist-image {
          position: relative;
          min-height: 6rem;
          border-radius: var(--radius-lg);
          background: var(--color-surface-container);
          overflow: hidden;
        }
        .account-wishlist-image > .app-icon {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(115, 92, 0, 0.28);
          font-size: 2rem;
        }
        .account-wishlist-card a:not(.account-wishlist-image) {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          color: var(--color-on-surface);
          font-family: var(--font-headline);
          font-size: 0.98rem;
          font-weight: 800;
          line-height: 1.2;
        }
        .account-wishlist-card span {
          display: block;
          margin-top: 0.4rem;
          color: var(--color-primary);
          font-family: var(--font-label);
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .account-wishlist-card button {
          margin-top: 0.7rem;
          color: var(--color-error);
          font-family: var(--font-label);
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .account-side-rail {
          display: grid;
          gap: 1.2rem;
        }
        .account-side-card {
          padding: 2rem;
        }
        .account-side-card h2 {
          color: var(--color-on-surface);
          font-size: 1.05rem;
          font-weight: 800;
          margin-bottom: 0.45rem;
        }
        .account-side-card p {
          color: var(--color-on-surface-variant);
          font-size: 0.86rem;
          line-height: 1.45;
          margin-bottom: 1.35rem;
        }
        .account-admin-card {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 1rem;
          align-items: center;
        }
        .account-mobile-admin-card {
          display: none;
        }
        .account-card-icon {
          width: 3.65rem;
          height: 3.65rem;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #a98208;
          background: rgba(212, 175, 55, 0.12);
          flex: 0 0 auto;
        }
        .account-card-icon .app-icon {
          font-size: 1.65rem;
        }
        .account-profile-form .form-field {
          min-height: 3.05rem;
          border-color: rgba(115, 92, 0, 0.2);
          border-radius: var(--radius-lg);
          background: #ffffff;
        }
        .account-profile-form .form-label {
          color: var(--color-primary);
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.14em;
        }
        .account-profile-preview {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.95rem;
        }
        .account-profile-preview > div {
          min-height: 5.1rem;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 0.9rem;
          align-items: center;
          border: 1px solid rgba(115, 92, 0, 0.12);
          border-radius: var(--radius-lg);
          padding: 0.95rem 1rem;
          background: #ffffff;
        }
        .account-profile-preview-copy {
          min-width: 0;
        }
        .account-profile-preview-label {
          display: block;
          color: var(--color-primary);
          font-family: var(--font-label);
          font-size: 0.6rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          line-height: 1.2;
        }
        .account-profile-preview-value {
          display: block;
          margin-top: 0.38rem;
          color: var(--color-on-surface);
          font-size: 0.95rem;
          font-weight: 800;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }
        .account-detail-grid {
          display: grid;
          gap: 1.1rem;
          margin: 1.4rem 0 1rem;
        }
        .account-detail-grid span {
          display: block;
          color: var(--color-on-surface-variant);
          font-family: var(--font-label);
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .account-detail-grid strong {
          display: block;
          margin-top: 0.25rem;
          color: var(--color-on-surface);
          font-size: 0.92rem;
          overflow-wrap: anywhere;
        }
        .account-arrow-button {
          align-items: center;
          gap: 0.35rem;
        }
        .account-arrow-button .app-icon {
          font-size: 1rem;
        }
        .account-shop-card {
          position: relative;
          overflow: hidden;
          min-height: 10.5rem;
          display: flex;
          justify-content: space-between;
          gap: 1rem;
        }
        .account-shop-card > .app-icon {
          align-self: flex-end;
          color: rgba(115, 92, 0, 0.08);
          font-size: 5.5rem;
        }
        .account-password-panel {
          display: grid;
          gap: 0.8rem;
          margin: 1rem 0;
        }
        .account-password-panel form {
          display: grid;
          gap: 0.75rem;
          padding: 1rem;
          border: 1px solid rgba(115, 92, 0, 0.12);
          border-radius: var(--radius-xl);
          background: #ffffff;
        }
        .account-password-panel .form-field {
          min-height: 2.7rem;
          border-color: rgba(115, 92, 0, 0.2);
          border-radius: var(--radius-lg);
          background: #ffffff;
        }
        .account-form-error,
        .account-form-success {
          font-size: 0.78rem;
          font-weight: 700;
        }
        .account-form-error {
          color: var(--color-error);
        }
        .account-form-success {
          color: var(--color-primary);
        }
        .account-support-strip {
          display: grid;
          grid-template-columns: 1.25fr 1fr 1fr auto;
          gap: 1.5rem;
          align-items: center;
          margin: 1.45rem 0 4rem;
          padding: 1.65rem 2rem;
          border: 1px solid rgba(115, 92, 0, 0.12);
          border-radius: var(--radius-xl);
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 18px 48px rgba(42, 34, 12, 0.07);
        }
        .account-support-strip h2 {
          color: var(--color-on-surface);
          font-size: 1rem;
          font-weight: 800;
          margin-bottom: 0.25rem;
        }
        .account-support-strip p,
        .account-support-strip a {
          color: var(--color-on-surface-variant);
          font-size: 0.86rem;
        }
        .account-support-item {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.8rem;
          align-items: center;
        }
        .account-support-item > .app-icon {
          color: var(--color-primary);
          font-size: 1.8rem;
        }
        .account-support-item strong {
          display: block;
          color: var(--color-on-surface);
          font-size: 0.84rem;
          font-weight: 700;
          margin-bottom: 0.18rem;
        }
        .account-profile-preview-icon {
          width: 3.15rem;
          height: 3.15rem;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #a98208;
          background: rgba(212, 175, 55, 0.11);
          font-size: 1.35rem;
        }
        .account-order-print-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          flex-shrink: 0;
          margin-top: 0.5rem;
        }
@media (max-width: 700px) {
          .account-hero {
            min-height: 17rem;
          }
          .account-page::before {
            opacity: 0.72;
            background-position: 62% center;
            height: 32rem;
          }
          .account-content {
            margin-top: -1.1rem;
          }
          .account-tabs {
            margin-inline: 0;
            overflow-x: hidden;
          }
          .account-tabs button,
          .account-tabs a {
            min-width: 0;
            flex: 1 1 0;
            flex-direction: column;
            gap: 0.28rem;
            padding: 0.55rem 0.3rem;
            min-height: 0;
            font-size: 0.6rem;
            line-height: 1.15;
            white-space: normal;
            text-align: center;
          }
          .account-tabs .app-icon {
            font-size: 1.15rem;
          }
          .account-tabs button.active::after,
          .account-tabs a.active::after {
            right: 0.4rem;
            left: 0.4rem;
          }
          .account-dashboard-grid,
          .account-support-strip {
            grid-template-columns: 1fr;
          }
          .account-support-strip {
            padding: 1.35rem;
          }
          .account-tab-heading {
            align-items: flex-start;
            flex-direction: column;
          }
          .account-tab-heading-action,
          .account-heading-signout {
            width: 100%;
          }
          .account-admin-card,
          .account-profile-form {
            padding: 1.35rem !important;
          }
          .account-admin-card {
            grid-template-columns: 1fr;
          }
          .account-mobile-admin-card {
            display: grid;
          }
          .account-rail-admin-card {
            display: none;
          }
          .account-card-icon {
            width: 4.4rem;
            height: 4.4rem;
          }
          .account-detail-grid {
            grid-template-columns: 1fr;
          }
          .account-profile-preview {
            grid-template-columns: 1fr;
          }
          .account-profile-preview > div {
            grid-template-columns: auto minmax(0, 1fr);
          }
          .account-order-row,
          .account-order-detail-grid,
          .account-order-dialog-columns,
          .account-wishlist-grid,
          .account-wishlist-card {
            grid-template-columns: 1fr;
          }
          .account-order-dialog {
            padding: 4rem 1rem 1rem;
          }
          .account-order-item {
            grid-template-columns: 4.25rem minmax(0, 1fr);
          }
          .account-order-item b {
            grid-column: 2;
          }
          .account-order-detail-line {
            grid-template-columns: 1fr;
            gap: 0.2rem;
          }
        }
      `}</style>
    </>
  );
}

function formatCustomerInventoryValue(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/^#\s*/, '');
  return /^\d+$/.test(normalized) ? normalized : null;
}
