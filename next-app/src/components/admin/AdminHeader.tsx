'use client';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import AdminMessagesLink from './AdminMessagesLink';
import AdminOrdersLink from './AdminOrdersLink';
import { AppIcon } from '@/components/AppIcon';

const GOLD = '#735c00';

export type AdminSection = 'products' | 'social-queues' | 'orders' | 'in-store-sale' | 'buy-receipts' | 'buyers' | 'messages' | 'subscribers' | 'text-deals' | 'marketing' | 'discount-codes' | 'users' | 'settings';

const SECTION_LABELS: Record<AdminSection, string> = {
  products: 'Products',
  'social-queues': 'Social Queues',
  orders: 'Orders',
  'in-store-sale': 'In-Store Sale',
  'buy-receipts': 'Buy Receipts',
  buyers: 'Buyers',
  messages: 'Messages',
  subscribers: 'Subscribers',
  'text-deals': 'Text Deals',
  marketing: 'Email Campaigns',
  'discount-codes': 'Discount Codes',
  users: 'Users',
  settings: 'Admin Settings',
};

const linkStyle = {
  fontSize: '0.8125rem',
  color: '#555',
  textDecoration: 'none',
  textUnderlineOffset: '3px',
  whiteSpace: 'nowrap',
} as const;

const activeStyle = {
  ...linkStyle,
  fontWeight: 600,
  textDecoration: 'underline',
} as const;

const productsLinkStyle = {
  ...linkStyle,
  color: GOLD,
} as const;

const activeProductsStyle = {
  ...productsLinkStyle,
  fontWeight: 600,
  textDecoration: 'underline',
} as const;

function AdminNavItem({
  href,
  active,
  children,
  products = false,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  products?: boolean;
}) {
  if (active) {
    return <span style={products ? activeProductsStyle : activeStyle}>{children}</span>;
  }

  return (
    <Link href={href} style={products ? productsLinkStyle : linkStyle}>
      {children}
    </Link>
  );
}

const STORAGE_KEY = 'admin-nav-collapsed';

export default function AdminHeader({
  adminBasePath,
  active,
  unreadMessagesCount,
  userEmail,
  rightContent,
}: {
  adminBasePath: string;
  active: AdminSection;
  unreadMessagesCount: number;
  userEmail?: string | null;
  rightContent?: ReactNode;
}) {
  const homeHref = adminBasePath.startsWith('/es') ? '/es' : '/';
  // Always starts expanded to match SSR (no window/localStorage on the server);
  // the persisted preference is applied after mount, client-side only, to avoid
  // a hydration mismatch when the admin previously collapsed the menu.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Apply the persisted collapse preference after mount (see the note above the
    // useState default) — post-hydration on purpose to avoid a mismatch, so the
    // set-state-in-effect flag is a false positive here.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(STORAGE_KEY) === 'true') setCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  };

  const toggleBtn = (
    <button
      type="button"
      onClick={toggle}
      title={collapsed ? 'Expand admin menu' : 'Collapse admin menu'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '2rem',
        height: '2rem',
        borderRadius: '0.375rem',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: GOLD,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(115,92,0,0.08)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      <AppIcon name={collapsed ? 'menu' : 'menu_open'}  aria-hidden="true" style={{ fontSize: '1.25rem', lineHeight: 1 }} />
    </button>
  );

  if (collapsed) {
    return (
      <header
        style={{
          borderBottom: '1px solid rgba(115,92,0,0.2)',
          padding: '0 clamp(0.75rem, 2vw, 1rem)',
          height: '2.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          background: 'white',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          href={homeHref}
          style={{ fontSize: '0.8125rem', color: GOLD, textDecoration: 'none', textUnderlineOffset: '3px', flexShrink: 0 }}
        >
          ← Home
        </Link>
        <span
          style={{
            fontSize: '0.5rem',
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            background: GOLD,
            color: 'white',
            padding: '0.2rem 0.45rem',
            flexShrink: 0,
          }}
        >
          Admin
        </span>
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: GOLD,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {SECTION_LABELS[active]}
        </span>
        <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {toggleBtn}
        </span>
      </header>
    );
  }

  return (
    <header
      style={{
        borderBottom: '1px solid rgba(115,92,0,0.2)',
        padding: '0.75rem clamp(0.75rem, 2vw, 2rem)',
        display: 'flex',
        alignItems: 'center',
        gap: 'clamp(0.75rem, 1.6vw, 1.5rem)',
        background: 'white',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        flexWrap: 'wrap',
        overflowX: 'auto',
        overscrollBehaviorX: 'contain',
      }}
    >
      <Link
        href={homeHref}
        style={{
          fontSize: '0.8125rem',
          color: GOLD,
          textDecoration: 'none',
          textUnderlineOffset: '3px',
        }}
      >
        ← Home
      </Link>
      <span
        style={{
          fontSize: '0.55rem',
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          background: GOLD,
          color: 'white',
          padding: '0.2rem 0.5rem',
        }}
      >
        Admin
      </span>
      <AdminNavItem href={adminBasePath} active={active === 'products'} products>
        Products
      </AdminNavItem>
      <AdminNavItem href={`${adminBasePath}/social-queues`} active={active === 'social-queues'}>
        Social Queues
      </AdminNavItem>
      <AdminOrdersLink
        href={`${adminBasePath}/orders`}
        active={active === 'orders'}
        userEmail={userEmail}
        style={active === 'orders' ? activeStyle : linkStyle}
      />
      <AdminNavItem href={`${adminBasePath}/in-store-sale`} active={active === 'in-store-sale'}>
        In-Store Sale
      </AdminNavItem>
      <AdminNavItem href={`${adminBasePath}/buy-receipts`} active={active === 'buy-receipts'}>
        Buy Receipts
      </AdminNavItem>
      <AdminNavItem href={`${adminBasePath}/buyers`} active={active === 'buyers'}>
        Buyers
      </AdminNavItem>
      <AdminMessagesLink
        href={`${adminBasePath}/messages`}
        unreadCount={unreadMessagesCount}
        active={active === 'messages'}
        style={active === 'messages' ? activeStyle : linkStyle}
      />
      <AdminNavItem href={`${adminBasePath}/subscribers`} active={active === 'subscribers'}>
        Subscribers
      </AdminNavItem>
      <AdminNavItem href={`${adminBasePath}/text-deals`} active={active === 'text-deals'}>
        Text Deals
      </AdminNavItem>
      <AdminNavItem href={`${adminBasePath}/marketing`} active={active === 'marketing'}>
        Email Campaigns
      </AdminNavItem>
      <AdminNavItem href={`${adminBasePath}/discount-codes`} active={active === 'discount-codes'}>
        Discount Codes
      </AdminNavItem>
      <AdminNavItem href={`${adminBasePath}/users`} active={active === 'users'}>
        Users
      </AdminNavItem>
      <AdminNavItem href={`${adminBasePath}/settings`} active={active === 'settings'}>
        Admin Settings
      </AdminNavItem>
      <span
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        {rightContent}
        {userEmail && (
          <span style={{ fontSize: '0.75rem', color: '#aaa' }}>
            {userEmail}
          </span>
        )}
        {toggleBtn}
      </span>
    </header>
  );
}
