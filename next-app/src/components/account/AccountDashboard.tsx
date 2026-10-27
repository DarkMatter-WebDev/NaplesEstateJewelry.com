'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { FormEvent, ReactNode } from 'react';
import AccountProfileForm, { type CustomerProfile } from '@/components/account/AccountProfileForm';
import SignOutButton from '@/components/account/SignOutButton';
import PasswordInput from '@/components/account/PasswordInput';
import { createClient } from '@/lib/supabase/client';
import { useWishlist } from '@/context/WishlistContext';
import { useHideSoldItemPrices } from '@/hooks/useHideSoldItemPrices';
import { formatCurrency, formatOrderAddress, formatOrderDate, formatPublicPurity, orderStatusLabel, type Order } from '@/types/sales';
import { isProductSold, productImagePaddingBackground } from '@/types/product';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import { AppIcon } from '@/components/AppIcon';
import AccountTaxExemptCard, { type AccountTaxExempt } from '@/components/account/AccountTaxExemptCard';

type AccountTab = 'overview' | 'orders' | 'wishlist';
type AccountSection = AccountTab | 'security';

interface Props {
  profile: CustomerProfile;
  fallbackEmail: string | null;
  locale: string;
  isAdmin: boolean;
  memberSince: string;
  orders: Order[];
  /** The saved tax-exempt certificate (owner, 2026-10-27). */
  taxExempt?: AccountTaxExempt;
}

export default function AccountDashboard({
  profile,
  fallbackEmail,
  locale,
  isAdmin,
  memberSince,
  orders,
  taxExempt = { certificate: null, expired: null, request: null, defaultPhone: null, startOpen: false },
}: Props) {
  const isEs = locale === 'es';
  const [activeTab, setActiveTab] = useState<AccountTab>('overview');

  useEffect(() => {
    // Apply the ?tab deep-link once, post-hydration. Deliberately NOT a lazy
    // useState initializer: SSR and the first client render must both show
    // 'overview' or React logs a hydration mismatch. Updating here after mount is
    // the intended pattern, so the set-state-in-effect flag is a false positive.
    const tab = new URLSearchParams(window.location.search).get('tab');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === 'orders' || tab === 'wishlist') setActiveTab(tab);
  }, []);

  function selectTab(tab: AccountTab) {
    setActiveTab(tab);
    if (typeof window === 'undefined') return;
    const url = tab === 'overview' ? window.location.pathname : `${window.location.pathname}?tab=${tab}`;
    window.history.replaceState(null, '', url);
  }

  return (
    <div className="account-content ultrawide-page max-w-6xl mx-auto px-4 md:px-8">
      <AccountTabs activeSection={activeTab} locale={locale} onSelectTab={selectTab} />

      <section id="account-overview" className="account-dashboard-grid">
        {isAdmin && <AdminPanelCard locale={locale} placement="mobile" />}

        <div className="account-overview-panel">
          {activeTab === 'overview' && (
            <AccountTabShell
              eyebrow={isEs ? 'Resumen de cuenta' : 'Account Overview'}
              title={isEs ? 'Tu información principal' : 'Your main account information'}
              copy={isEs ? 'Una vista rápida de tu perfil, datos de contacto y preferencias.' : 'A quick view of your profile, contact details, and preferences.'}
              action={
                <SignOutButton
                  label={isEs ? 'Cerrar Sesión' : 'Sign Out'}
                  locale={locale}
                  className="account-heading-signout"
                />
              }
            >
              <AccountProfileForm profile={profile} fallbackEmail={fallbackEmail} locale={locale} />
            </AccountTabShell>
          )}

          {activeTab === 'orders' && <OrdersTab orders={orders} locale={locale} />}
          {activeTab === 'wishlist' && <WishlistTab locale={locale} />}
        </div>

        <AccountSideRail locale={locale} fallbackEmail={fallbackEmail} isAdmin={isAdmin} memberSince={memberSince} taxExempt={taxExempt} />
      </section>

      <AccountSupportStrip locale={locale} />
    </div>
  );
}

export function AccountTabs({
  activeSection,
  locale,
  onSelectTab,
}: {
  activeSection: AccountSection;
  locale: string;
  onSelectTab?: (tab: AccountTab) => void;
}) {
  const isEs = locale === 'es';
  const prefix = isEs ? '/es' : '';
  const tabs: { key: AccountSection; icon: string; label: string; href: string }[] = [
    { key: 'overview', icon: 'person', label: isEs ? 'Resumen' : 'Overview', href: `${prefix}/account` },
    { key: 'orders', icon: 'inventory_2', label: isEs ? 'Pedidos' : 'Orders', href: `${prefix}/account?tab=orders` },
    { key: 'wishlist', icon: 'favorite', label: isEs ? 'Favoritos' : 'Wishlist', href: `${prefix}/account?tab=wishlist` },
    { key: 'security', icon: 'admin_panel_settings', label: isEs ? 'Admin y seguridad' : 'Admin and Security', href: `${prefix}/account/security` },
  ];

  return (
    <nav className="account-tabs" aria-label={isEs ? 'Menú de cuenta' : 'Account menu'}>
      {tabs.map((tab) => {
        const isActive = activeSection === tab.key;
        const contents = (
          <>
            <AppIcon name={tab.icon}  aria-hidden="true" />
            {tab.label}
          </>
        );

        if (tab.key === 'overview' || tab.key === 'orders' || tab.key === 'wishlist') {
          const accountTab = tab.key as AccountTab;
          if (!onSelectTab) {
            return (
              <Link key={tab.key} href={tab.href} className={isActive ? 'active' : ''} aria-current={isActive ? 'page' : undefined}>
                {contents}
              </Link>
            );
          }

          return (
            <button
              key={tab.key}
              type="button"
              className={isActive ? 'active' : ''}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(accountTab)}
            >
              {contents}
            </button>
          );
        }

        return (
          <Link key={tab.key} href={tab.href} className={isActive ? 'active' : ''} aria-current={isActive ? 'page' : undefined}>
            {contents}
          </Link>
        );
      })}
    </nav>
  );
}

export function AccountSupportStrip({ locale }: { locale: string }) {
  const isEs = locale === 'es';
  const contactHref = isEs ? '/es/contact' : '/contact';

  return (
    <section className="account-support-strip">
      <div>
        <h2>{isEs ? '¿Necesitas ayuda?' : 'Need Help?'}</h2>
        <p>{isEs ? 'Nuestro equipo está aquí para ayudarte.' : 'Our support team is here to help.'}</p>
      </div>
      <div className="account-support-item">
        <AppIcon name="call"  aria-hidden="true" />
        <div>
          <strong>{isEs ? 'Llámanos' : 'Call Us'}</strong>
          <a href="tel:2394048505">(239) 404-8505</a>
        </div>
      </div>
      <div className="account-support-item">
        <AppIcon name="mail"  aria-hidden="true" />
        <div>
          <strong>{isEs ? 'Escríbenos' : 'Email Us'}</strong>
          <a href="mailto:info@naplesestatejewelry.com">info@naplesestatejewelry.com</a>
        </div>
      </div>
      <Link href={contactHref} className="gold-button text-sm account-arrow-button">
        {isEs ? 'Contactar soporte' : 'Contact Support'}
        <AppIcon name="chevron_right"  aria-hidden="true" />
      </Link>
    </section>
  );
}

export function AccountSideRail({
  locale,
  fallbackEmail,
  isAdmin,
  memberSince,
  taxExempt,
}: {
  locale: string;
  fallbackEmail: string | null;
  isAdmin: boolean;
  memberSince: string;
  /** Omitted where the account side rail is reused without it (profile / security pages). */
  taxExempt?: AccountTaxExempt;
}) {
  const isEs = locale === 'es';
  const shopHref = isEs ? '/es/shop' : '/shop';

  return (
    <aside className="account-side-rail" aria-label={isEs ? 'Acciones de cuenta' : 'Account actions'}>
      {isAdmin && <AdminPanelCard locale={locale} placement="rail" />}

      <div className="account-card account-side-card">
        <h2>{isEs ? 'Detalles de cuenta' : 'Account Details'}</h2>
        <p>{isEs ? 'Configuración y preferencias principales.' : 'Manage your account settings and preferences.'}</p>
        <div className="account-detail-grid">
          <div>
            <span>{isEs ? 'Correo' : 'Email'}</span>
            <strong>{fallbackEmail}</strong>
          </div>
          <div>
            <span>{isEs ? 'Tipo de cuenta' : 'Account type'}</span>
            <strong>{isAdmin ? (isEs ? 'Administrador' : 'Administrator') : (isEs ? 'Miembro' : 'Member')}</strong>
          </div>
          <div>
            <span>{isEs ? 'Miembro desde' : 'Member since'}</span>
            <strong>{memberSince}</strong>
          </div>
        </div>
        <SignOutButton
          label={isEs ? 'Cerrar Sesión' : 'Sign Out'}
          locale={locale}
        />
      </div>

      {taxExempt && <AccountTaxExemptCard locale={locale} initial={taxExempt} />}

      <div className="account-card account-side-card account-shop-card">
        <div>
          <h2>{isEs ? 'Comprar ahora' : 'Shop Now'}</h2>
          <p>{isEs ? 'Explora las últimas colecciones.' : 'Browse our latest collections.'}</p>
          <Link href={shopHref} className="outline-button text-sm account-arrow-button">
            {isEs ? 'Ver tienda' : 'Browse Shop'}
            <AppIcon name="chevron_right"  aria-hidden="true" />
          </Link>
        </div>
        <AppIcon name="redeem"  aria-hidden="true" />
      </div>
    </aside>
  );
}

function AdminPanelCard({ locale, placement }: { locale: string; placement: 'mobile' | 'rail' }) {
  const isEs = locale === 'es';

  return (
    <div className={`account-card account-side-card account-admin-card ${placement === 'mobile' ? 'account-mobile-admin-card' : 'account-rail-admin-card'}`}>
      <div className="account-card-icon" aria-hidden="true">
        <AppIcon name="admin_panel_settings" />
      </div>
      <div>
        <h2>{isEs ? 'Panel de Administración' : 'Admin Panel'}</h2>
        <p>{isEs ? 'Gestionar productos, imágenes y precios.' : 'Manage products, images, and pricing.'}</p>
        <Link href={isEs ? '/es/admin' : '/admin'} className="gold-button text-sm account-arrow-button">
          {isEs ? 'Abrir Admin' : 'Open Admin Panel'}
          <AppIcon name="chevron_right" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function AccountTabShell({
  eyebrow,
  title,
  copy,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="account-tab-stack">
      <div className="account-tab-heading">
        <div>
          <p>{eyebrow}</p>
          <h2>{title}</h2>
          <span>{copy}</span>
        </div>
        {action && <div className="account-tab-heading-action">{action}</div>}
      </div>
      {children}
    </div>
  );
}

function OrdersTab({ orders, locale }: { orders: Order[]; locale: string }) {
  const isEs = locale === 'es';
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  return (
    <div className="account-card account-tab-card">
      <p className="account-tab-eyebrow">{isEs ? 'Pedidos' : 'Orders'}</p>
      <h2>{isEs ? 'Historial de pedidos' : 'Order History'}</h2>
      <p>{isEs ? 'Revisa tus pedidos y estados recientes.' : 'Review your recent order totals and statuses.'}</p>
      {orders.length === 0 ? (
        <div className="account-empty-state">
          <AppIcon name="inventory_2"  aria-hidden="true" />
          <strong>{isEs ? 'Sin pedidos todavia' : 'No orders yet'}</strong>
          <p>{isEs ? 'Cuando hagas una compra, aparecera aqui.' : 'When you place a purchase, it will appear here.'}</p>
        </div>
      ) : (
        <div className="account-order-list">
          {orders.map((order) => (
            <button
              key={order.id}
              type="button"
              className="account-order-row"
              onClick={() => setSelectedOrder(order)}
              aria-label={isEs ? `Ver detalles del pedido ${order.order_number}` : `View details for order ${order.order_number}`}
            >
              <div>
                <strong>{order.order_number}</strong>
                <span>{formatOrderDate(order.created_at)}</span>
              </div>
              <div>
                <span>{isEs ? 'Pago' : 'Payment'}</span>
                <strong>{orderStatusLabel(order.payment_status)}</strong>
              </div>
              <div>
                <span>{isEs ? 'Estado' : 'Status'}</span>
                <strong>{orderStatusLabel(order.order_status)}</strong>
              </div>
              <div>
                <span>{isEs ? 'Total' : 'Total'}</span>
                <strong>{formatCurrency(order.total)}</strong>
              </div>
              <AppIcon name="chevron_right" className="account-order-row-icon" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {selectedOrder && (
        <OrderDetailsDialog order={selectedOrder} locale={locale} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
}

type DialogInvoice = { id: string; invoice_number: string; status: string; total: number };

function OrderDetailsDialog({
  order,
  locale,
  onClose,
}: {
  order: Order;
  locale: string;
  onClose: () => void;
}) {
  const isEs = locale === 'es';
  const itemCount = order.order_items?.length ?? 0;
  const accountOrdersHref = isEs ? '/es/account?tab=orders' : '/account?tab=orders';
  const supabase = createClient();
  const [invoices, setInvoices] = useState<DialogInvoice[]>([]);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [mounted, setMounted] = useState(false);
  const shippingAddress = formatOrderAddress(order.shipping_address);
  const billingAddress = formatOrderAddress(order.billing_address);
  const hasAdditionalDetails = Boolean(order.customer_notes || shippingAddress || billingAddress);
  const shippingAddressLabel = order.shipping_method === 'pickup'
    ? (isEs ? 'Dirección' : 'Address')
    : order.shipping_method === 'local_delivery'
      ? (isEs ? 'Dirección de entrega' : 'Delivery address')
      : (isEs ? 'Dirección de envío' : 'Shipping address');

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total, created_at')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled && data) setInvoices(data as DialogInvoice[]);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  // The dialog renders through a portal into document.body, which only exists on
  // the client — gate it on a mount flag. setState-in-effect is the standard,
  // intended pattern here, so the lint flag is a false positive.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return createPortal(
    <>
    <div className="account-order-dialog-backdrop" role="dialog" aria-modal="true" aria-label={isEs ? 'Detalles del pedido' : 'Order details'}>
      <div className="account-order-dialog">
        <button type="button" className="account-order-dialog-close" onClick={onClose} aria-label={isEs ? 'Cerrar detalles del pedido' : 'Close order details'}>
          <AppIcon name="close"  aria-hidden="true" />
        </button>

        <div className="account-order-dialog-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <p className="account-tab-eyebrow">{isEs ? 'Pedido' : 'Order'}</p>
              <h2>{order.order_number}</h2>
              <span style={{ display: 'block', marginTop: '0.25rem', color: 'var(--color-on-surface-variant)', fontSize: '0.88rem' }}>
                {formatOrderDate(order.created_at)}
              </span>
            </div>
            <button
              type="button"
              className="account-order-print-btn outline-button text-sm"
              onClick={() => setShowPrintPreview(true)}
              aria-label={isEs ? 'Imprimir pedido' : 'Print order'}
            >
              <AppIcon name="print"  aria-hidden="true" style={{ fontSize: '1rem', lineHeight: 1 }} />
              {isEs ? 'Imprimir' : 'Print'}
            </button>
          </div>
        </div>

        <div className="account-order-detail-grid">
          <OrderDetailBlock label={isEs ? 'Pago' : 'Payment'} value={orderStatusLabel(order.payment_status)} />
          <OrderDetailBlock label={isEs ? 'Estado' : 'Status'} value={orderStatusLabel(order.order_status)} />
          <OrderDetailBlock label={isEs ? 'Cumplimiento' : 'Fulfillment'} value={orderStatusLabel(order.fulfillment_status)} />
          <OrderDetailBlock label={isEs ? 'Entrega' : 'Delivery'} value={orderStatusLabel(order.shipping_method)} />
        </div>

        <div className="account-order-dialog-section">
          <h3>{isEs ? 'Artículos' : 'Items'}</h3>
          {itemCount === 0 ? (
            <p className="account-order-muted">{isEs ? 'No hay artículos guardados para este pedido.' : 'No saved items are attached to this order.'}</p>
          ) : (
            <div className="account-order-item-list">
              {order.order_items?.map((item) => {
                const productHref = item.product_id
                  ? `${isEs ? '/es/shop' : '/shop'}/${item.product_id}?returnTo=${encodeURIComponent(accountOrdersHref)}`
                  : null;
                const inventoryLabel = formatPublicInventoryNumber(item.inventory_number);
                const purityLabel = formatPublicPurity(item.purity_snapshot);
                const imageSnapshot = normalizeLegacyLocalImageUrl(item.image_snapshot);
                const rowContent = (
                  <>
                  <div className="account-order-item-image">
                    {imageSnapshot ? (
                      <Image
                        src={imageSnapshot}
                        alt={item.title_snapshot}
                        fill
                        sizes="96px"
                        className="object-contain"
                        unoptimized={imageSnapshot.startsWith('/assets/')}
                      />
                    ) : (
                      <AppIcon name="photo_camera"  aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <strong>{item.title_snapshot}</strong>
                    {inventoryLabel && <em className="account-order-item-inventory">{inventoryLabel}</em>}
                    <span>
                      {[
                        item.metal_snapshot,
                        purityLabel,
                        item.gram_weight_snapshot ? `${item.gram_weight_snapshot}g` : null,
                        accountItemQty(item) > 1 ? `${isEs ? 'Cant.' : 'Qty'} ${accountItemQty(item)} × ${formatCurrency(item.price_snapshot)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <b>{formatCurrency(item.price_snapshot * accountItemQty(item))}</b>
                  </>
                );

                return productHref ? (
                  <Link key={item.id} href={productHref} className="account-order-item account-order-item-link">
                    {rowContent}
                  </Link>
                ) : (
                  <div key={item.id} className="account-order-item">
                    {rowContent}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="account-order-dialog-columns">
          <div className="account-order-dialog-section">
            <h3>{isEs ? 'Cliente' : 'Customer'}</h3>
            <OrderDetailLine label={isEs ? 'Nombre' : 'Name'} value={order.customer_name} />
            <OrderDetailLine label={isEs ? 'Correo' : 'Email'} value={order.customer_email} />
            <OrderDetailLine label={isEs ? 'Teléfono' : 'Phone'} value={order.customer_phone} />
          </div>
          <div className="account-order-dialog-section">
            <h3>{isEs ? 'Totales' : 'Totals'}</h3>
            <OrderDetailLine label={isEs ? 'Subtotal' : 'Subtotal'} value={formatCurrency(order.subtotal)} />
            <OrderDetailLine label={isEs ? 'Impuesto' : 'Tax'} value={formatCurrency(order.tax)} />
            <OrderDetailLine label={isEs ? 'Envío' : 'Shipping'} value={formatCurrency(order.shipping_fee)} />
            {order.discount > 0 && <OrderDetailLine label={isEs ? 'Descuento' : 'Discount'} value={`-${formatCurrency(order.discount)}`} />}
            <OrderDetailLine label={isEs ? 'Total' : 'Total'} value={formatCurrency(order.total)} strong />
          </div>
        </div>

        {hasAdditionalDetails && (
          <div className="account-order-dialog-section">
            <h3>{isEs ? 'Detalles adicionales' : 'Additional Details'}</h3>
            <OrderDetailLine label={isEs ? 'Notas' : 'Notes'} value={order.customer_notes} />
            <OrderDetailLine label={shippingAddressLabel} value={shippingAddress} />
            <OrderDetailLine label={isEs ? 'Dirección de facturación' : 'Billing address'} value={billingAddress} />
          </div>
        )}

        {invoices.length > 0 && (
          <div className="account-order-dialog-section">
            <h3>{isEs ? 'Factura' : 'Invoice'}</h3>
            {invoices.map((invoice) => (
              <div key={invoice.id} className="account-order-detail-line">
                <span style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {invoice.invoice_number}
                </span>
                <strong style={{ color: 'var(--color-on-surface)', fontSize: '0.88rem' }}>
                  {orderStatusLabel(invoice.status)}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Print preview overlay — sits above the dialog */}
    {showPrintPreview && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          background: '#2b2519',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Toolbar — hidden on print */}
        <div
          className="order-print-toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1.25rem',
            background: '#1e1b15',
            borderBottom: '1px solid #3d3522',
            position: 'sticky',
            top: 0,
            zIndex: 1,
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          <button
            type="button"
            onClick={() => setShowPrintPreview(false)}
            style={{ fontSize: '0.82rem', color: '#e5d48a', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {isEs ? '← Volver' : '← Back'}
          </button>
          <span style={{ color: '#55493a', fontSize: '0.82rem' }}>|</span>
          <span style={{ fontSize: '0.82rem', color: '#c8b264', fontWeight: 700 }}>
            {isEs ? 'Vista previa de impresión' : 'Print Preview'} — {order.order_number}
          </span>
          <button
            type="button"
            onClick={() => {
              const paper = document.querySelector<HTMLElement>('.order-print-paper');
              if (!paper) return;
              const win = window.open('', '_blank');
              if (!win) return;
              win.document.write(
                '<!DOCTYPE html><html><head><meta charset="utf-8">' +
                `<title>${order.order_number}</title>` +
                '<style>' +
                '*{box-sizing:border-box;margin:0;padding:0;}' +
                'body{font-family:Arial,Helvetica,sans-serif;color:#1d1a14;}' +
                '@page{size:letter;margin:0.75in;}' +
                'table{width:100%;border-collapse:collapse;}' +
                '</style>' +
                `</head><body>${paper.innerHTML}</body></html>`,
              );
              win.document.close();
              win.onafterprint = () => win.close();
              win.print();
            }}
            style={{
              marginLeft: 'auto',
              padding: '0.5rem 1.4rem',
              background: 'linear-gradient(135deg, #dcb336, #b5890c)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.82rem',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {isEs ? 'Imprimir ahora' : 'Print Now'}
          </button>
        </div>

        {/* Paper — the only thing that prints */}
        <div
          className="order-print-paper"
          style={{
            width: 'min(816px, calc(100% - 2rem))',
            margin: '1.5rem auto 3rem',
            background: '#ffffff',
            padding: '3rem 2.5rem',
            boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
            fontFamily: 'Arial, Helvetica, sans-serif',
            color: '#1d1a14',
          }}
        >
          {/* Receipt header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '2px solid #d5c697' }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.35em', textTransform: 'uppercase', color: '#735c00', marginBottom: '0.4rem' }}>
              Naples Estate Jewelry
            </p>
            <p style={{ fontSize: '0.78rem', color: '#746b5b' }}>Naples, Florida · (239) 404-8505</p>
          </div>

          {/* Order number + invoice + date */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              {invoices[0] && (
                <p style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#735c00', marginBottom: '0.25rem' }}>
                  {isEs ? 'Factura #:' : 'Invoice #:'} {invoices[0].invoice_number}
                </p>
              )}
              <p style={{ fontSize: '1rem', fontWeight: 700 }}>{order.order_number}</p>
              <p style={{ fontSize: '0.78rem', color: '#746b5b', marginTop: '0.2rem' }}>{formatOrderDate(order.created_at)}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#735c00' }}>
                {isEs ? 'Pago' : 'Payment'}
              </p>
              <p style={{ fontSize: '0.88rem', marginTop: '0.2rem' }}>{orderStatusLabel(order.payment_status)}</p>
            </div>
          </div>

          {/* Customer */}
          {(order.customer_name || order.customer_email || order.customer_phone) && (
            <div style={{ marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid #eadfbd' }}>
              <p style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#735c00', marginBottom: '0.5rem' }}>
                {isEs ? 'Cliente' : 'Customer'}
              </p>
              {order.customer_name && <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>{order.customer_name}</p>}
              {order.customer_email && <p style={{ fontSize: '0.8rem', color: '#746b5b', marginTop: '0.15rem' }}>{order.customer_email}</p>}
              {order.customer_phone && <p style={{ fontSize: '0.8rem', color: '#746b5b', marginTop: '0.15rem' }}>{order.customer_phone}</p>}
            </div>
          )}

          {/* Delivery method */}
          {order.shipping_method && (
            <div style={{ marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid #eadfbd' }}>
              <p style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#735c00', marginBottom: '0.35rem' }}>
                {isEs ? 'Método de entrega' : 'Delivery Method'}
              </p>
              <p style={{ fontSize: '0.88rem' }}>{orderStatusLabel(order.shipping_method)}</p>
            </div>
          )}

          {/* Items */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #d5c697' }}>
                <th style={{ textAlign: 'left', padding: '0.4rem 0', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#735c00' }}>
                  {isEs ? 'Artículo' : 'Item'}
                </th>
                <th style={{ textAlign: 'right', padding: '0.4rem 0', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#735c00' }}>
                  {isEs ? 'Precio' : 'Price'}
                </th>
              </tr>
            </thead>
            <tbody>
              {(order.order_items ?? []).map((item) => {
                const purityLabel = formatPublicPurity(item.purity_snapshot);
                const qty = accountItemQty(item);
                const details = [
                  item.metal_snapshot,
                  purityLabel,
                  item.gram_weight_snapshot ? `${item.gram_weight_snapshot}g` : null,
                  qty > 1 ? `${isEs ? 'Cant.' : 'Qty'} ${qty} × ${formatCurrency(item.price_snapshot)}` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #eadfbd' }}>
                    <td style={{ padding: '0.85rem 0.5rem 0.85rem 0', verticalAlign: 'top' }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700 }}>{item.title_snapshot}</p>
                      {item.inventory_number && (
                        <p style={{ fontSize: '0.72rem', color: '#735c00', marginTop: '0.2rem' }}>#{item.inventory_number}</p>
                      )}
                      {details && <p style={{ fontSize: '0.75rem', color: '#746b5b', marginTop: '0.15rem' }}>{details}</p>}
                    </td>
                    <td style={{ padding: '0.85rem 0', textAlign: 'right', fontWeight: 700, color: '#735c00', fontSize: '0.9rem', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                      {formatCurrency(item.price_snapshot * qty)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ marginLeft: 'auto', width: 'min(16rem, 100%)' }}>
            <PrintTotalLine label={isEs ? 'Subtotal' : 'Subtotal'} value={formatCurrency(order.subtotal)} />
            {order.discount > 0 && <PrintTotalLine label={isEs ? 'Descuento' : 'Discount'} value={`-${formatCurrency(order.discount)}`} />}
            <PrintTotalLine label={isEs ? 'Impuesto' : 'Tax'} value={formatCurrency(order.tax)} />
            {order.shipping_fee > 0 && <PrintTotalLine label={isEs ? 'Envío' : 'Shipping'} value={formatCurrency(order.shipping_fee)} />}
            <div style={{ borderTop: '1.5px solid #d5c697', marginTop: '0.4rem', paddingTop: '0.5rem' }}>
              <PrintTotalLine label={isEs ? 'Total' : 'Total'} value={formatCurrency(order.total)} strong />
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: '1px solid #eadfbd', textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: '#746b5b' }}>
              {isEs
                ? 'Gracias por su compra. Para cualquier pregunta, llame o envíe un mensaje al (239) 404-8505.'
                : 'Thank you for your purchase. For questions, call or text (239) 404-8505.'}
            </p>
          </div>
        </div>
      </div>
    )}
    </>, document.body);
}

function PrintTotalLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.2rem 0' }}>
      <span style={{ fontSize: '0.82rem', color: strong ? '#1d1a14' : '#746b5b', fontWeight: strong ? 700 : 400, fontFamily: 'Arial, Helvetica, sans-serif' }}>{label}</span>
      <span style={{ fontSize: '0.82rem', color: strong ? '#735c00' : '#1d1a14', fontWeight: strong ? 700 : 400, fontFamily: 'Arial, Helvetica, sans-serif' }}>{value}</span>
    </div>
  );
}

function OrderDetailBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

function formatPublicInventoryNumber(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/^#\s*/, '');
  return /^\d+$/.test(normalized) ? `Inv #${normalized}` : null;
}

function accountItemQty(item: { quantity?: number | null }): number {
  const qty = Math.floor(Number(item.quantity ?? 1));
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function OrderDetailLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string | number | null | undefined;
  strong?: boolean;
}) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={strong ? 'account-order-detail-line strong' : 'account-order-detail-line'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WishlistTab({ locale }: { locale: string }) {
  const { items, remove } = useWishlist();
  const isEs = locale === 'es';
  const prefix = isEs ? '/es' : '';
  const hideSoldItemPrices = useHideSoldItemPrices();

  return (
    <div className="account-card account-tab-card">
      <p className="account-tab-eyebrow">{isEs ? 'Favoritos' : 'Wishlist'}</p>
      <h2>{isEs ? 'Piezas guardadas' : 'Saved Pieces'}</h2>
      <p>{isEs ? 'Tus piezas guardadas desde la tienda.' : 'Your saved items from the shop.'}</p>
      {items.length === 0 ? (
        <div className="account-empty-state">
          <AppIcon name="favorite"  aria-hidden="true" />
          <strong>{isEs ? 'Sin favoritos todavia' : 'No saved items yet'}</strong>
          <p>{isEs ? 'Toca el corazón en una pieza para guardarla aquí.' : 'Tap the heart on a piece to save it here.'}</p>
        </div>
      ) : (
        <div className="account-wishlist-grid">
          {items.map((item) => {
            const title = isEs && item.title_es ? item.title_es : item.title;
            const imageFrameBackground = productImagePaddingBackground(item.image_padding);
            return (
              <article key={item.id} className="account-wishlist-card">
                <Link href={`${prefix}/shop/${item.id}`} className="account-wishlist-image" style={{ background: imageFrameBackground }}>
                  {item.image ? (
                    <Image src={item.image} alt={title} fill sizes="180px" className="object-contain" unoptimized={item.image.startsWith('/assets/')} />
                  ) : (
                    <AppIcon name="photo_camera"  aria-hidden="true" />
                  )}
                </Link>
                <div>
                  <Link href={`${prefix}/shop/${item.id}`}>{title}</Link>
                  <span>
                    {hideSoldItemPrices && isProductSold(item.status)
                      ? (isEs ? 'Vendido' : 'Sold')
                      : item.price_mode === 'manual'
                        ? (item.manual_price_label ?? (isEs ? 'Consultar precio' : 'Ask for price'))
                        : (isEs ? 'Precio según mercado' : 'Live market price')}
                  </span>
                  <button type="button" className="account-wishlist-remove" onClick={() => remove(item.id)}>
                    {isEs ? 'Eliminar' : 'Remove'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PasswordChangeForm({ locale }: { locale: string }) {
  const isEs = locale === 'es';
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (password.length < 6) {
      setError(isEs ? 'Usa al menos 6 caracteres.' : 'Use at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError(isEs ? 'Las contraseñas no coinciden.' : 'Passwords do not match.');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPassword('');
    setConfirmPassword('');
    setOpen(false);
    setMessage(isEs ? 'Contraseña actualizada.' : 'Password updated.');
  }

  return (
    <div className="account-password-panel">
      <button type="button" className="outline-button text-sm account-arrow-button" onClick={() => setOpen((value) => !value)}>
        {isEs ? 'Cambiar contraseña' : 'Change Password'}
        <AppIcon name={open ? 'expand_less' : 'chevron_right'}  aria-hidden="true" />
      </button>
      {open && (
        <form onSubmit={handleSubmit}>
          <label>
            <span className="form-label">{isEs ? 'Nueva contraseña' : 'New Password'}</span>
            <PasswordInput
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              isEs={isEs}
            />
          </label>
          <label>
            <span className="form-label">{isEs ? 'Confirmar contraseña' : 'Confirm Password'}</span>
            <PasswordInput
              confirm
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              isEs={isEs}
            />
          </label>
          {error && <p className="account-form-error">{error}</p>}
          <button type="submit" disabled={saving} className="gold-button text-sm disabled:opacity-50">
            {saving ? (isEs ? 'Guardando...' : 'Saving...') : (isEs ? 'Guardar contraseña' : 'Save Password')}
          </button>
        </form>
      )}
      {message && <p className="account-form-success">{message}</p>}
    </div>
  );
}
