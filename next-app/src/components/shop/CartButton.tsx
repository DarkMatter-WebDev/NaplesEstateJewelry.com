'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCart, type CartItem } from '@/context/CartContext';
import { QuantityStepper } from '@/components/checkout/OrderSummary';
import { isProductPurchasable, normalizeProductQuantity } from '@/types/product';
import { AppIcon } from '@/components/AppIcon';

interface Props {
  item: CartItem;
  variant?: 'card' | 'detail' | 'icon' | 'list';
  locale?: string;
  includeCardStyles?: boolean;
}

export default function CartButton({ item, variant = 'card', locale = 'en', includeCardStyles = true }: Props) {
  const { isIn, add, remove, notifyAdded } = useCart();
  const inCart = isIn(item.id);
  const isEs = locale === 'es';
  const canPurchase = isProductPurchasable(item.status, item.stockQuantity);
  const stockCap = Math.max(1, normalizeProductQuantity(item.stockQuantity));
  const [detailQty, setDetailQty] = useState(1);
  const [showCardConfirmation, setShowCardConfirmation] = useState(false);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    };
  }, []);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!canPurchase && !inCart) return;
    if (inCart) {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
      setShowCardConfirmation(false);
      remove(item.id);
    } else {
      add(item, variant === 'detail' ? detailQty : 1);
      if (variant === 'card') {
        if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
        setShowCardConfirmation(true);
        confirmationTimer.current = setTimeout(() => setShowCardConfirmation(false), 1800);
      } else {
        notifyAdded(item.title);
      }
    }
  }

  // Check Availability (owner, 2026-11-05): a piece another dealer holds goes
  // to its short ask-first form, never into a cart. One already in a cart from
  // before the box was ticked keeps its Remove button.
  if (item.checkFirst && canPurchase && !inCart) {
    const href = `${isEs ? '/es' : ''}/availability/${encodeURIComponent(item.id)}`;
    if (variant === 'icon') return null;
    if (variant === 'detail') {
      return (
        <Link href={href} rel="nofollow" className="gold-button detail-cart-button flex items-center gap-2">
          {isEs ? 'Consultar disponibilidad' : 'Check Availability'}
        </Link>
      );
    }
    if (variant === 'list') {
      return (
        <Link
          href={href}
          rel="nofollow"
          className="shop-list-cart-button flex items-center justify-center gap-1.5"
          style={{
            borderRadius: '6px',
            padding: '0.5rem 0.85rem',
            fontFamily: 'var(--font-label)',
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            border: '1px solid transparent',
            background: 'linear-gradient(135deg, #dcb336, #b5890c)',
            color: '#fffdf7',
            boxShadow: '0 6px 14px rgba(181, 137, 12, 0.18)',
          }}
        >
          <span>{isEs ? 'Consultar' : 'Check Availability'}</span>
        </Link>
      );
    }
    // ONE label at every width (owner, 2026-11-10, version A): "Check
    // Availability" fits a 360px phone's card button on one line at the
    // same size as "Add" (measured: ~100px of ~135px). The old full/compact
    // pair printed BOTH words ("Check Availability Check") whenever the
    // stylesheet below was missing. Spanish is longer — `.shop-card-check-label`
    // shrinks it on the narrowest two-across phones.
    return (
      <>
        <Link
          href={href}
          rel="nofollow"
          className="outline-button shop-card-cart-button text-xs flex w-full min-h-9 items-center justify-center gap-1 whitespace-nowrap"
        >
          <AppIcon name="mail" style={{ fontSize: '13px', lineHeight: 1 }} aria-hidden="true" />
          <span className="shop-card-check-label" data-es={isEs || undefined}>{isEs ? 'Consultar disponibilidad' : 'Check Availability'}</span>
        </Link>
        {includeCardStyles && <CardButtonStyles />}
      </>
    );
  }

  if (variant === 'detail') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {!inCart && canPurchase && stockCap > 1 && (
          <QuantityStepper value={detailQty} max={stockCap} onChange={setDetailQty} isEs={isEs} />
        )}
        <button
          type="button"
          onClick={handleClick}
          disabled={!canPurchase && !inCart}
          className={inCart ? 'outline-button flex items-center gap-2' : 'gold-button detail-cart-button flex items-center gap-2'}
          style={inCart ? { borderColor: GOLD, color: GOLD } : !canPurchase ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
          aria-pressed={inCart}
        >
          <AppIcon name={inCart ? 'remove_shopping_cart' : 'add_shopping_cart'}  style={{ fontSize: '16px', lineHeight: 1 }} />
          {inCart
            ? (isEs ? 'En el carrito' : 'In Cart')
            : canPurchase ? (isEs ? 'Agregar al carrito' : 'Add to Cart') : (isEs ? 'No disponible' : 'Unavailable')}
        </button>
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!canPurchase && !inCart}
        aria-pressed={inCart}
        className="shop-list-cart-button flex items-center justify-center gap-1.5"
        style={{
          borderRadius: '6px',
          padding: '0.5rem 0.85rem',
          fontFamily: 'var(--font-label)',
          fontSize: '0.62rem',
          fontWeight: 800,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          cursor: canPurchase || inCart ? 'pointer' : 'not-allowed',
          border: `1px solid ${inCart ? 'rgba(181, 137, 12, 0.5)' : 'transparent'}`,
          background: inCart
            ? 'rgba(255, 253, 248, 0.9)'
            : canPurchase
              ? 'linear-gradient(135deg, #dcb336, #b5890c)'
              : 'rgba(115, 92, 0, 0.12)',
          color: inCart ? GOLD : canPurchase ? '#fffdf7' : 'var(--color-on-surface-variant)',
          boxShadow: inCart || !canPurchase ? 'none' : '0 6px 14px rgba(181, 137, 12, 0.18)',
          opacity: !canPurchase && !inCart ? 0.6 : 1,
        }}
      >
        <AppIcon name={inCart ? 'remove_shopping_cart' : 'add_shopping_cart'}  aria-hidden="true" style={{ fontSize: '15px', lineHeight: 1 }} />
        <span>
          {inCart
            ? (isEs ? 'En carrito' : 'In Cart')
            : canPurchase ? (isEs ? 'Agregar' : 'Add to Cart') : (isEs ? 'No disponible' : 'Unavailable')}
        </span>
      </button>
    );
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!canPurchase && !inCart}
        aria-label={inCart ? (isEs ? 'Quitar del carrito' : 'Remove from cart') : (isEs ? 'Agregar al carrito' : 'Add to cart')}
        aria-pressed={inCart}
        className="shop-card-cart-icon-button flex items-center justify-center w-7 h-7 rounded-full transition-colors"
        style={{
          background: inCart ? 'linear-gradient(135deg, #d9ad2f, #b98c09)' : 'rgba(255, 252, 246, 0.92)',
          border: `1px solid ${inCart ? 'rgba(181, 137, 12, 0.5)' : 'rgba(115, 92, 0, 0.22)'}`,
          color: inCart ? '#fffdf7' : GOLD,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          opacity: !canPurchase && !inCart ? 0.5 : 1,
          cursor: canPurchase || inCart ? 'pointer' : 'not-allowed',
        }}
      >
        {/* No fill in either state: the button already inverts its background
            and colour when the item is in the cart, so filling the cart as well
            is a redundant signal that only costs the icon its readability. */}
        <AppIcon name="shopping_cart"
          aria-hidden="true"
          data-cart-icon="true"
          style={{ fontSize: '13px', lineHeight: 1 }}
         />
      </button>
    );
  }

  // card variant — compact button in the actions row
  return (
    <div className="relative inline-flex w-full">
      {showCardConfirmation && (
        <span
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 whitespace-nowrap px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide"
          style={{
            background: 'var(--color-surface-container-lowest)',
            border: `1px solid color-mix(in srgb, ${GOLD} 28%, transparent)`,
            color: GOLD,
            boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
            fontFamily: 'var(--font-label)',
          }}
        >
          {isEs ? 'Agregado al carrito' : 'Added to cart'}
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={!canPurchase && !inCart}
        className="outline-button shop-card-cart-button text-xs flex w-full min-h-9 items-center justify-center gap-1 whitespace-nowrap"
        style={inCart ? { borderColor: GOLD, color: GOLD, background: `color-mix(in srgb, ${GOLD} 8%, transparent)` } : !canPurchase ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
        aria-pressed={inCart}
      >
        <AppIcon name={inCart ? 'remove_shopping_cart' : 'add_shopping_cart'}  style={{ fontSize: '13px', lineHeight: 1 }} />
        <span className="shop-card-cart-label-full">
          {inCart ? (isEs ? 'Quitar del carrito' : 'Remove from Cart') : canPurchase ? (isEs ? 'Agregar al carrito' : 'Add to Cart') : (isEs ? 'No disponible' : 'Unavailable')}
        </span>
        <span className="shop-card-cart-label-compact" aria-hidden="true">
          {inCart ? (isEs ? 'Quitar' : 'Remove') : canPurchase ? (isEs ? 'Agregar' : 'Add') : (isEs ? 'No' : 'N/A')}
        </span>
      </button>
      {includeCardStyles && <CardButtonStyles />}
    </div>
  );
}

/**
 * The card button's stylesheet. Only the grid's FIRST card renders it
 * (`includeCardStyles`, ShopProductGrid), so every branch that can be that
 * first card must render it too. Until 2026-11-10 the Check Availability
 * branch returned early without it: with that piece sorted first (Newest
 * arrivals) all 24 cards lost their button styling and read "ADD TO CART ADD".
 */
function CardButtonStyles() {
  return (
      <style>{`
        .shop-card-cart-button {
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
          padding-inline: 0.55rem;
          letter-spacing: 0.08em;
        }
        .shop-card-cart-label-compact {
          display: none;
        }
        /* Compact card button — applied at all breakpoints */
        .shop-card-cart-button {
          min-height: 1.9rem;
          padding-block: 0.18rem;
          padding-inline: 0.38rem;
          font-size: 0.58rem;
          gap: 0.22rem;
          letter-spacing: 0.045em;
        }
        .shop-card-cart-button .app-icon {
          font-size: 12px !important;
        }
        @media (max-width: 430px) {
          .shop-card-cart-button {
            min-height: 1.55rem;
            padding-block: 0.08rem;
            padding-inline: 0.28rem;
            font-size: 0.52rem;
            gap: 0.16rem;
          }
          .shop-card-cart-button .app-icon {
            font-size: 10px !important;
          }
        }
        .shop-card-cart-label-full {
          display: none;
        }
        .shop-card-cart-label-compact {
          display: inline;
        }
        /* "Consultar disponibilidad" needs ~131px; a 360px phone gives ~135px. */
        @media (max-width: 370px) {
          .shop-card-check-label[data-es] {
            font-size: 0.47rem;
          }
        }
      `}</style>
  );
}

const GOLD = '#735c00';
