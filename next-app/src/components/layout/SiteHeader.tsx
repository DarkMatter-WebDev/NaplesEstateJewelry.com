'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useWishlist } from '@/context/WishlistContext';
import { useCart } from '@/context/CartContext';
import { AppIcon } from '@/components/AppIcon';
import { CONTACT_PHONE_DISPLAY, TEL_HREF, smsHref } from '@/lib/contact-links';

const GOLD = '#735c00';
const SECONDARY = '#5e5e5d';

const navLinkBase =
  'nav-link text-sm font-medium tracking-wide px-1 py-2 transition-colors hover:text-[#735c00]';

const HEADER_STYLES = `
  /* Desktop dropdown — white card matching the auth/shop modernization */
  .nav-dropdown {
    left: 0;
    top: calc(100% + 6px);
    min-width: 210px;
    background: #ffffff;
    border: 1px solid rgba(115, 92, 0, 0.15);
    border-radius: var(--radius-xl);
    box-shadow: 0 18px 52px rgba(42, 34, 12, 0.12);
    padding: 0.4rem;
  }
  /* Invisible bridge so hover survives the gap between trigger and panel */
  .nav-dropdown::before {
    content: '';
    position: absolute;
    top: -8px;
    left: 0;
    right: 0;
    height: 8px;
  }
  .nav-dropdown-link {
    display: block;
    padding: 0.6rem 0.85rem;
    border-radius: var(--radius-lg);
    font-family: var(--font-label);
    font-size: 0.82rem;
    color: var(--color-on-surface);
    text-decoration: none;
    transition: background 150ms ease, color 150ms ease;
  }
  .nav-dropdown-link:hover {
    background: linear-gradient(135deg, #dcb336, #b5890c);
    color: #fffdf7;
  }
  .nav-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
  .nav-link::after {
    content: '';
    position: absolute;
    left: 0.25rem;
    right: 0.25rem;
    bottom: 0.22rem;
    height: 1px;
    background: linear-gradient(90deg, #735c00, #dcb336);
    transform: scaleX(0);
    transform-origin: left center;
    opacity: 0;
    transition: transform 190ms ease, opacity 190ms ease;
  }
  .nav-link:hover::after,
  .nav-link:focus-visible::after,
  .nav-link[data-active="true"]::after {
    transform: scaleX(1);
    opacity: 1;
  }
  .nav-link[data-active="true"] {
    color: #735c00 !important;
  }

  /* Gold-gradient call CTA */
  .nav-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.65rem 1.4rem;
    border-radius: 999px;
    background: linear-gradient(135deg, #dcb336, #b5890c);
    color: #fffdf7;
    font-family: var(--font-label);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    text-decoration: none;
    box-shadow: 0 10px 24px rgba(181, 137, 12, 0.18);
    transition: filter 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }
  .nav-cta:hover {
    filter: brightness(1.04);
    box-shadow: 0 14px 30px rgba(181, 137, 12, 0.24);
    transform: translateY(-1px);
  }

  /* Desktop icon actions need the same affordance as the text CTAs. */
  .site-header-icon-button {
    transition: color 150ms ease;
  }
  @media (min-width: 1280px) {
    .site-header-icon-button {
      cursor: pointer;
    }
    .site-header-icon-button:hover {
      color: ${GOLD} !important;
    }
    .site-header-icon-button > .app-icon {
      transition: transform 150ms ease;
    }
    .site-header-icon-button:hover > .app-icon {
      transform: translateY(-1px);
    }
    .site-header-icon-button:active {
      color: ${GOLD} !important;
    }
    .site-header-icon-button:active > .app-icon {
      transform: scale(0.92);
      transition-duration: 0.05s;
    }
  }

  /* Keep the full brand and every action visible on scrollbar-narrowed phones.

     ONE fluid rule, not a step at 400px. The brand link carries mark + gap +
     wordmark and clips (overflow:hidden) rather than overflowing, so the
     wordmark has to surrender width smoothly as the viewport narrows instead of
     holding a fixed size and losing its tail invisibly. The rules this replaced
     stepped 10px -> 11px at exactly 400px, which made 400px the WORST width in
     the band rather than a middling one.

     2.9vw is sized so this is >= the old value at every width (320px: 9.28 vs
     8.8; 350px: 10.15 vs 9.63; 11px cap from ~379px, where the old rules only
     reached 11px at 400px), i.e. nothing got smaller to make room for the mark.
     That is affordable only because the ES/EN chip left this row for the mobile
     menu on the same day; before that it had to be 2.35vw to fit.

     Floor stays 8.75px, the floor this header already used at 320px.
     ⚠️ Re-measure the 320-430px band in Spanish WITH THE MENU OPEN before
     changing this, the mark height, or the brand gap — they share one budget. */
  .site-header-brand-mobile {
    font-size: clamp(8.75px, 2.9vw, 11px);
  }
  /* The mark shrinks with the same band, bottoming out at the 1.75rem the
     action buttons use below 350px and reaching the 2rem mobile content budget
     by ~457px. Bounded at 767px so it never fights the md:h-10 utility. */
  @media (max-width: 767px) {
    .site-header-brand-mark {
      height: clamp(1.75rem, 7vw, 2rem);
    }
  }
  /* No .site-header-language rules in the narrow blocks below: that chip is
     display:none under md now, so anything sizing it here would be dead code.
     (Never use a backtick in this block — these styles are a template literal
     and a stray one ends the string mid-CSS.) */
  @media (max-width: 399px) {
    .site-header-row {
      gap: 0.25rem;
      padding-inline: 0.625rem;
    }
    .site-header-actions {
      gap: 0.25rem;
    }
    .menu-toggle {
      padding-inline: 0.5rem;
    }
  }

  /* Menu toggle (mobile) */
  .menu-toggle {
    border: 1px solid rgba(115, 92, 0, 0.5);
    border-radius: var(--radius-lg);
    color: ${GOLD};
    font-family: var(--font-label);
    /* Set the size explicitly: a button ignores the text-[10px] utility because
       the global 'button { font: inherit }' reset (unlayered) overrides Tailwind's
       layered utilities. 12px at md matches the language chip it sits beside
       there; below md that chip is hidden and this is the only labelled control
       in the row, so 10px is on its own. */
    font-size: 0.625rem;
    transition: background 150ms ease, color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
  }
  @media (min-width: 768px) {
    .menu-toggle { font-size: 0.75rem; }
  }
  @media (max-width: 349px) {
    .site-header-row {
      /* No padding-block here: the header's height comes from
         --site-header-height and this row centers inside it. */
      --site-header-action-icon-size: 17px;
      gap: 0.1875rem;
      padding-inline: 0.5rem;
    }
    .site-header-actions {
      gap: 0.125rem;
    }
    .site-header-call-button,
    .site-header-icon-button {
      width: 1.75rem;
      height: 1.75rem;
    }
    .site-header-count-badge {
      top: -0.125rem;
      right: -0.125rem;
      width: 0.875rem;
      height: 0.875rem;
      font-size: 0.4375rem;
    }
    .menu-toggle {
      border-radius: 0.625rem;
      font-size: 0.5625rem;
      padding: 0.25rem 0.4rem;
    }
  }
  .menu-toggle[data-open="true"] {
    background: linear-gradient(135deg, #dcb336, #b5890c);
    border-color: transparent;
    color: #fffdf7;
    box-shadow: 0 8px 20px rgba(181, 137, 12, 0.2);
  }

  /* Mobile menu panel — elevated, warm-tinted, rounded */
  .mobile-menu-panel {
    border-top: 1px solid rgba(115, 92, 0, 0.12);
    border-radius: 0 0 14px 14px;
    box-shadow: 0 24px 44px rgba(42, 34, 12, 0.12);
    /* Opaque base under the warm tint — the panel overlays page content. */
    background:
      radial-gradient(circle at 92% 0%, rgba(220, 188, 96, 0.12), transparent 16rem),
      #fcfbf7;
    overflow: hidden;
    max-height: calc(100svh - var(--site-header-height));
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .mobile-row {
    border-bottom: 1px solid rgba(115, 92, 0, 0.10);
  }
  .mobile-row:last-child {
    border-bottom: none;
  }
  .mobile-nav-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.85rem 0.65rem;
    border-radius: var(--radius-lg);
    font-family: var(--font-label);
    /* Keep button rows (accordions, Saved Items) the same size as the link rows.
       Without this, buttons inherit 16px from the global 'button { font: inherit }'
       reset instead of the intended text-xs. */
    font-size: 0.75rem;
    transition: background 150ms ease, color 150ms ease;
  }
  .mobile-nav-link:hover,
  .mobile-nav-link:active {
    color: ${GOLD};
    background: rgba(212, 175, 55, 0.10);
  }
  .mobile-accordion-btn[data-open="true"] {
    background: rgba(212, 175, 55, 0.12);
    color: ${GOLD};
  }
  .mobile-sub-list {
    margin: 0.15rem 0 0.5rem;
    padding: 0.3rem;
    border-radius: var(--radius-xl);
    background: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(115, 92, 0, 0.1);
  }
  .mobile-sub-link {
    display: block;
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-lg);
    font-family: var(--font-label);
    font-size: 0.9rem;
    color: ${GOLD};
    text-decoration: none;
    transition: background 150ms ease, color 150ms ease;
  }
  .mobile-sub-link:hover,
  .mobile-sub-link:active {
    background: linear-gradient(135deg, #dcb336, #b5890c);
    color: #fffdf7;
  }
`;

export default function SiteHeader() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const { count: wishlistCount, openDrawer: openWishlist } = useWishlist();
  const { count: cartCount, openDrawer: openCart, clear: clearCart, recentlyAdded, dismissAdded } = useCart();

  function href(path: string) {
    return `${locale === 'es' ? '/es' : ''}${path}`;
  }

  const normalizedPathname = pathname.replace(/^\/(?:en|es)(?=\/|$)/, '') || '/';

  // Clicking Home while ALREADY on the homepage returns the visitor to the top.
  // Next's <Link> no-ops when the href matches the current route, so without
  // this the button looks broken — especially on this site, where the pinned
  // hero means "back to the top" is a real destination rather than just a
  // scroll position. Locale-agnostic: normalizedPathname has the /en|/es prefix
  // stripped, so it covers '/' and '/es' alike.
  const onHomePage = normalizedPathname === '/';

  function handleHomeClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!onHomePage) return; // elsewhere, let it navigate normally
    // Never hijack a modified click — those mean "open in a new tab/window".
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  const altLocale = locale === 'en' ? 'es' : 'en';
  const altPath = normalizedPathname.replace(/^(?!\/)/, '/');
  const altHref = altLocale === 'es' ? `/es${altPath === '/' ? '' : altPath}` : altPath;

  const SELL_ITEMS = [
    { key: 'estateJewelry' as const, path: '/estate-jewelry' },
    { key: 'goldServices' as const, path: '/gold-services' },
    { key: 'silverServices' as const, path: '/silver-services' },
    { key: 'bullion' as const, path: '/bullion' },
    { key: 'tradeIn' as const, path: '/trade-in' },
    { key: 'freeEvaluation' as const, path: '/free-evaluation' },
  ];

  const ABOUT_ITEMS = [
    { key: 'aboutUs' as const, path: '/about' },
    { key: 'reviews' as const, path: '/reviews' },
    { key: 'livePrices' as const, path: '/spot-prices' },
    { key: 'otherServices' as const, path: '/services' },
  ];

  function closeAll() {
    setMenuOpen(false);
    setSellOpen(false);
    setAboutOpen(false);
  }

  // Dismiss the nav when the visitor interacts anywhere outside the header, and
  // on Escape. Before this, the mobile panel could only be closed by pressing
  // the toggle a second time, which is not where anyone reaches.
  //
  // ⚠️ The header holds TWO menus that close by different mechanisms, and both
  // need handling:
  //   1. The mobile panel and its Sell/About accordions are React state, so
  //      they are reset directly.
  //   2. The desktop dropdown is pure CSS (`group-hover` / `group-focus-within`
  //      on .nav-dropdown) with no state to reset. A mouse closes it by moving
  //      away — but a TAP leaves the trigger focused, so `:focus-within` holds
  //      it open on touch with no way out. Blurring the focused trigger is what
  //      closes that one.
  //
  // Anchored to the whole <header>, not the panel: the toggle button lives in
  // the header too, so a narrower test would let a tap on it both close (here)
  // and re-open (its own onClick), leaving the menu stuck open.
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function dismiss(target: Node | null) {
      const header = headerRef.current;
      if (!header) return;
      // Inside the header, every control already owns its own behaviour.
      if (target && header.contains(target)) return;

      setMenuOpen(false);
      setSellOpen(false);
      setAboutOpen(false);

      const focused = document.activeElement;
      if (focused instanceof HTMLElement && header.contains(focused)) focused.blur();
    }

    // `pointerdown` rather than `click`: it fires on the press instead of the
    // release, so the menu is gone before the finger lifts, and a single
    // listener covers mouse, touch and pen without a synthetic-click delay.
    function onPointerDown(event: PointerEvent) {
      dismiss(event.target instanceof Node ? event.target : null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') dismiss(null);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  function isActive(path: string) {
    return normalizedPathname === path || (path !== '/' && normalizedPathname.startsWith(`${path}/`));
  }

  function isAnyActive(items: { path: string }[]) {
    return items.some((item) => isActive(item.path));
  }

  return (
    <header
      ref={headerRef}
      // Marker for `body:has([data-site-header])` in globals.css, which drops the
      // route progress bar to this header's bottom edge. Surfaces that do not
      // render this header (admin) keep the bar at the top of the viewport, so
      // it never floats in empty space. Keep this attribute if the header moves.
      data-site-header
      className="fixed top-0 w-full z-50"
      style={{
        // Fully opaque, not a 0.95 wash + backdrop blur: page content scrolling
        // under a fixed header must never ghost through it. The blur went with
        // it — with nothing translucent left to soften, it only cost a
        // compositing layer on every scroll frame.
        background: '#f9f9f7',
        borderBottom: '1px solid rgba(115,92,0,0.12)',
        boxShadow: '0 6px 24px rgba(42,34,12,0.05)',
        // The header takes its height FROM the shared token rather than
        // growing to fit its padding — that is what makes --site-header-height
        // authoritative, so every page offset and sticky top derived from it is
        // exact by construction. box-sizing: border-box means the 1px border is
        // included, so the token is the true occupied space. The row below
        // centers within it; see globals.css for the content-height budget.
        height: 'var(--site-header-height)',
      }}
    >
      <div className="site-header-row flex h-full w-full items-center justify-between gap-3 px-[clamp(0.75rem,2vw,2rem)]">

        {/* Brand — same home-link behaviour as the Home nav item: on the
            homepage it returns to the top rather than doing nothing. */}
        {/* gap-[0.3125rem] below md: 5px, not 8px. On a phone the mark and the
            wordmark are competing for a row that is already full, and 3px of
            gap is 3px the wordmark does not have to give up. */}
        <Link href={href('/')} onClick={handleHomeClick} className="flex items-center gap-[0.3125rem] md:gap-2 min-w-0 shrink overflow-hidden">
          {/* The mark is the octopus alone on transparency (owner, 2026-08-16),
              replacing the old navy circular emblem that carried its own
              "NAPLES ESTATE JEWELRY" text — which duplicated the wordmark
              beside it. width/height describe the LANDSCAPE artwork (157x120
              source, ~1.31:1); they are aspect-ratio metadata for next/image,
              while the rendered size comes from the height ladder below with
              w-auto. Leaving them square, as they were, would mis-declare the
              ratio.

              It shows at EVERY width (owner, 2026-08-17) — it used to be
              `hidden md:block`, so every phone and every sub-768px tablet
              carried a wordmark with no mark beside it. The heights are the
              header's own content budget, not arbitrary: 32px is exactly the
              mobile budget (56px token = 32px content + 12px above/below) and
              40px the desktop one (72px = 40 + 16), so the mark fills the row
              without inflating --site-header-height. `.site-header-brand-mark`
              exists only so the ≤349px block can shrink it in step with the
              action buttons there; the sizes attr states the largest rendered
              width (52px at md+). */}
          <Image
            src="/assets/images/branding/nav-logo.webp"
            alt="Naples Estate Jewelry Logo"
            width={52}
            height={40}
            sizes="52px"
            className="site-header-brand-mark block h-8 w-auto md:h-10 object-contain flex-shrink-0"
            priority
          />
          {/* Full name on md+; abbreviated on mobile.
              The wordmark is BLACK, not gold (owner, 2026-08-13). Uses the
              on-surface token — the same near-black every heading on the site
              uses — rather than a hardcoded #000, so it stays consistent with
              the type around it. The token is only ever redefined inside
              `.product-page-dark .product-light-surface`, which the fixed
              header sits outside of, so it always resolves to #1a1c1c here. */}
          <span
            className="hidden sm:block text-[clamp(0.82rem,1.55vw,1.38rem)] tracking-normal uppercase whitespace-nowrap"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            Naples Estate Jewelry
          </span>
          <span
            className="site-header-brand-mobile block sm:hidden tracking-normal uppercase whitespace-nowrap"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            Naples Estate Jewelry
          </span>
        </Link>

        {/* Desktop nav — 2xl and up */}
        <nav className="hidden xl:flex items-center justify-center gap-[clamp(0.8rem,1.3vw,1.35rem)]" style={{ fontFamily: 'var(--font-label)' }}>
            <Link href={href('/')} onClick={handleHomeClick} className={navLinkBase} data-active={isActive('/') ? 'true' : 'false'} style={{ color: SECONDARY }}>{t('home')}</Link>
            {/* Shop is a direct link — no submenu (auctions page removed 2026-08-01) */}
            <Link href={href('/shop')} className={navLinkBase} data-active={isActive('/shop') ? 'true' : 'false'} style={{ color: SECONDARY }}>{t('shop')}</Link>

          {/* Sell To Us dropdown */}
          <div className="group relative flex items-center">
              <Link href={href('/sell')} className={navLinkBase} data-active={isActive('/sell') || isAnyActive(SELL_ITEMS) ? 'true' : 'false'} style={{ color: SECONDARY }}>
                {t('sellToUs')}
              </Link>
            <DesktopDropdown items={SELL_ITEMS} t={t} href={href} />
          </div>

          {/* About dropdown */}
          <div className="group relative flex items-center">
              <Link href={href('/about')} className={navLinkBase} data-active={isAnyActive(ABOUT_ITEMS) ? 'true' : 'false'} style={{ color: SECONDARY }}>
                {t('about')}
              </Link>
            <DesktopDropdown items={ABOUT_ITEMS} t={t} href={href} />
          </div>

            <Link href={href('/contact')} className={navLinkBase} data-active={isActive('/contact') ? 'true' : 'false'} style={{ color: SECONDARY }}>{t('contact')}</Link>
            <Link href={href('/account')} className={navLinkBase} data-active={isActive('/account') ? 'true' : 'false'} style={{ color: SECONDARY }}>{t('myAccount')}</Link>
        </nav>

        {/* Actions */}
        <div className="site-header-actions flex items-center gap-2 md:gap-3 flex-shrink-0">
          {/* Language — md and up only (owner, 2026-08-17), to buy back header
              space on phones. Below md it is NOT lost: the mobile menu has
              carried its own language item all along (the `Español`/`English`
              MobileLink at the foot of the panel), so this chip was a duplicate
              control on exactly the widths that could least afford one.

              Safe for SEO despite Google indexing mobile-first: hreflang is
              declared in the HEAD by `pageMetadata()`/`alternatesFor()` on every
              page (verified: en, es and x-default all present), and every locale
              URL is in the sitemap. Alternate-language discovery never depended
              on this body link. */}
          <Link
            href={altHref}
            className="site-header-language hidden md:inline-block text-xs font-bold tracking-widest uppercase px-1.5 py-1 transition-colors"
            style={{ color: GOLD, fontFamily: 'var(--font-label)' }}
          >
            {locale === 'en' ? 'ES' : 'EN'}
          </Link>

          {/* Tap-to-call — mobile/tablet only (desktop has the CALL NOW nav button) */}
          <a
            href="tel:2394048505"
            className="site-header-call-button flex xl:hidden items-center justify-center w-8 h-8"
            style={{ color: GOLD }}
            aria-label="Call (239) 404-8505"
          >
            <AppIcon name="call"  style={{ fontSize: 'var(--site-header-action-icon-size, 20px)', lineHeight: 1 }} />
          </a>

          {/* Wishlist heart — desktop only */}
          <button
            type="button"
            onClick={openWishlist}
            className="site-header-icon-button relative hidden xl:flex items-center justify-center w-8 h-8 transition-colors"
            style={{ color: wishlistCount > 0 ? GOLD : '#5e5e5d' }}
            aria-label="Saved items"
          >
            <AppIcon name="favorite"
              fill={wishlistCount > 0 ? 'currentColor' : 'none'}
              style={{
                fontSize: 'var(--site-header-action-icon-size, 20px)',
                lineHeight: 1,
              }}
             />
            {wishlistCount > 0 && (
              <span
                className="site-header-count-badge absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[0.5rem] font-bold rounded-full"
                style={{ background: GOLD, color: '#fff', fontFamily: 'var(--font-label)' }}
              >
                {wishlistCount > 9 ? '9+' : wishlistCount}
              </span>
            )}
          </button>

          {/* Cart button + added popup */}
          <div className="relative">
            <button
              type="button"
              onClick={openCart}
              className="site-header-icon-button relative flex items-center justify-center w-8 h-8 transition-colors"
              style={{ color: cartCount > 0 ? GOLD : '#5e5e5d' }}
              aria-label="Cart"
            >
              {/* Has-items state keeps the outline readable: soft gold tint
                  inside the cart instead of a solid currentColor fill. */}
              <AppIcon name="shopping_cart"
                fill={cartCount > 0 ? 'color-mix(in srgb, currentColor 22%, transparent)' : 'none'}
                style={{
                  fontSize: 'var(--site-header-action-icon-size, 20px)',
                  lineHeight: 1,
                }}
               />
              {cartCount > 0 && (
                <span
                  className="site-header-count-badge absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[0.5rem] font-bold rounded-full"
                  style={{ background: GOLD, color: '#fff', fontFamily: 'var(--font-label)' }}
                >
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </button>

            {/* "Item added" mini popup */}
            {recentlyAdded && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  width: 'min(220px, calc(100vw - 1.5rem))',
                  background: 'white',
                  border: '1px solid rgba(115,92,0,0.15)',
                  borderRadius: '8px',
                  boxShadow: '0 18px 52px rgba(42,34,12,0.12)',
                  padding: '0.85rem',
                  zIndex: 60,
                }}
              >
                {/* Arrow */}
                <div style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '10px',
                  width: '10px',
                  height: '10px',
                  background: 'white',
                  border: '1px solid rgba(115,92,0,0.15)',
                  borderBottom: 'none',
                  borderRight: 'none',
                  transform: 'rotate(45deg)',
                }} />
                {/* Dismiss — pinned to the popup's top-right corner */}
                <button
                  type="button"
                  onClick={dismissAdded}
                  style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', width: '1.4rem', height: '1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', background: 'none', border: 'none', color: GOLD, borderRadius: '6px', cursor: 'pointer', lineHeight: 1 }}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: GOLD, fontFamily: 'var(--font-label)', marginBottom: '0.2rem', paddingRight: '1.4rem' }}>
                  {locale === 'es' ? 'Agregado al carrito' : 'Item added'}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#555', marginBottom: '0.6rem', lineHeight: 1.3 }} className="line-clamp-2">
                  {recentlyAdded}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => { dismissAdded(); openCart(); }}
                    style={{ flex: 1, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.45rem 0.5rem', background: 'linear-gradient(135deg, #dcb336, #b5890c)', color: '#fffdf7', border: 'none', borderRadius: '6px', cursor: 'pointer', fontFamily: 'var(--font-label)', boxShadow: '0 8px 18px rgba(181,137,12,0.18)' }}
                  >
                    {locale === 'es' ? 'Ver carrito' : 'Go to cart'}
                  </button>
                  {cartCount > 0 && (
                    <button
                      type="button"
                      onClick={() => { clearCart(); dismissAdded(); }}
                      style={{ flex: '1 1 100%', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.4rem 0.5rem', background: 'rgba(186,26,26,0.06)', border: '1px solid rgba(186,26,26,0.32)', color: 'var(--color-error)', borderRadius: '6px', cursor: 'pointer', fontFamily: 'var(--font-label)' }}
                    >
                      {locale === 'es' ? 'Vaciar carrito' : 'Clear Cart'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Call Now — hidden on mobile; inline-flex at 2xl. Wrapped in span so the
              span controls visibility and .nav-cta's display doesn't override `hidden`. */}
          <span className="hidden xl:inline-flex">
            <a href="tel:2394048505" className="nav-cta">{t('callNow')}</a>
          </span>


          <button
            type="button"
            onClick={() => {
              if (menuOpen) { closeAll(); } else { setMenuOpen(true); }
            }}
            className="menu-toggle xl:hidden px-2.5 py-1.5 md:px-3 md:py-2 text-[10px] md:text-xs font-bold tracking-widest uppercase"
            data-open={menuOpen ? 'true' : 'false'}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t('close') : t('menu')}
          >
            {menuOpen ? t('close') : t('menu')}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="mobile-menu-panel xl:hidden">
          <div className="flex flex-col px-4 py-3" style={{ fontFamily: 'var(--font-label)' }}>

            <MobileLink
              href={href('/')}
              onClick={(event) => {
                closeAll();
                handleHomeClick(event);
              }}
              style={{ color: GOLD }}
            >
              {t('home')}
            </MobileLink>
            {/* Shop is a direct link — no submenu (auctions page removed 2026-08-01) */}
            <MobileLink href={href('/shop')} onClick={closeAll}>{t('shop')}</MobileLink>

            {/* Sell To Us — collapsible */}
            <MobileAccordion
              label={t('sellToUs')}
              open={sellOpen}
              onToggle={() => setSellOpen(o => !o)}
            >
              {SELL_ITEMS.map(({ key, path }) => (
                <Link key={key} href={href(path)} onClick={closeAll} className="mobile-sub-link">{t(key)}</Link>
              ))}
            </MobileAccordion>

            {/* Services — collapsible */}
            <MobileAccordion
              label={t('about')}
              open={aboutOpen}
              onToggle={() => setAboutOpen(o => !o)}
            >
              {ABOUT_ITEMS.map(({ key, path }) => (
                <Link key={key} href={href(path)} onClick={closeAll} className="mobile-sub-link">{t(key)}</Link>
              ))}
            </MobileAccordion>

            <MobileLink href={href('/contact')} onClick={closeAll}>{t('contact')}</MobileLink>
            <MobileLink href={href('/account')} onClick={closeAll}>{t('myAccount')}</MobileLink>

            {/* Wishlist — opens drawer */}
            <div className="mobile-row">
              <button
                type="button"
                onClick={() => { closeAll(); openWishlist(); }}
                className="mobile-nav-link text-xs font-bold uppercase tracking-[0.08em]"
                style={{ color: '#1a1c1c' }}
              >
                <span>{locale === 'en' ? 'Saved Items' : 'Lista de deseos'}</span>
                {wishlistCount > 0 && (
                  <span
                    className="text-[0.5rem] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: GOLD, color: '#fff' }}
                  >
                    {wishlistCount}
                  </span>
                )}
              </button>
            </div>

            <MobileLink href={altHref} onClick={closeAll} style={{ color: GOLD }}>
              {locale === 'en' ? 'Español' : 'English'}
            </MobileLink>

            {/* Call + Text rows (owner-approved mockup, 2026-09-20). In the
                PANEL on purpose: the header row above is width-budgeted to the
                pixel and takes no new icon. Plain anchors — `tel:` / `sms:` are
                not navigations, so the panel closes itself. */}
            <div className="mobile-row">
              <a
                href={TEL_HREF}
                onClick={closeAll}
                className="mobile-nav-link text-xs font-bold uppercase tracking-[0.08em]"
                style={{ color: GOLD, justifyContent: 'flex-start', gap: '0.5rem' }}
              >
                <AppIcon name="call" className="text-[1rem]" />
                {locale === 'en' ? 'Call' : 'Llamar'} {CONTACT_PHONE_DISPLAY}
              </a>
            </div>
            <div className="mobile-row">
              <a
                href={smsHref()}
                onClick={closeAll}
                className="mobile-nav-link text-xs font-bold uppercase tracking-[0.08em]"
                style={{ color: GOLD, justifyContent: 'flex-start', gap: '0.5rem' }}
              >
                <AppIcon name="sms" className="text-[1rem]" />
                {locale === 'en' ? 'Text Us' : 'Enviar Texto'}
              </a>
            </div>

          </div>
        </div>
      )}

      <style>{HEADER_STYLES}</style>
    </header>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function DesktopDropdown({
  items,
  t,
  href,
}: {
  items: { key: string; path: string }[];
  t: (k: string) => string;
  href: (p: string) => string;
}) {
  return (
    <div
      className="nav-dropdown absolute z-50 opacity-0 pointer-events-none -translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0"
    >
      {items.map(({ key, path }) => (
        <Link key={key} href={href(path)} className="nav-dropdown-link">
          {t(key)}
        </Link>
      ))}
    </div>
  );
}

function MobileAccordion({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mobile-row">
      <button
        type="button"
        onClick={onToggle}
        className="mobile-nav-link mobile-accordion-btn"
        data-open={open ? 'true' : 'false'}
        aria-expanded={open}
      >
        <span
          className="text-xs font-bold uppercase tracking-[0.08em]"
          style={{ color: 'inherit' }}
        >
          {label}
        </span>
        <AppIcon name="expand_more"
          className="transition-transform duration-200"
          style={{ fontSize: '18px', lineHeight: 1, color: GOLD, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
         />
      </button>
      {open && <div className="mobile-sub-list flex flex-col">{children}</div>}
    </div>
  );
}

function MobileLink({
  href,
  onClick,
  children,
  style,
}: {
  href: string;
  /** Receives the event so a handler can preventDefault (see handleHomeClick). */
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="mobile-row">
      <Link
        href={href}
        onClick={onClick}
        className="mobile-nav-link text-xs font-bold uppercase tracking-[0.08em]"
        style={{ color: '#1a1c1c', ...style }}
      >
        {children}
      </Link>
    </div>
  );
}
