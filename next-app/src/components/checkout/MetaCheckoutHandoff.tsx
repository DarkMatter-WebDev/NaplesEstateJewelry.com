'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppIcon } from '@/components/AppIcon';
import { useCart, type CartItem } from '@/context/CartContext';
import { startRouteProgress } from '@/components/layout/RouteProgressBar';

interface Props {
  locale: string;
  lines: { item: CartItem; quantity: number }[];
  /** Titles (or refs) of pieces that are no longer for sale. */
  unavailable: string[];
}

/**
 * Meta shop checkout hand-off (2026-10-25; see lib/meta-checkout.ts): puts
 * the pieces in the cart, then opens /checkout. Waits for the cart to load
 * from localStorage first, or that load would overwrite these adds. Stays on
 * the page only to say a piece has sold (the same calm card as
 * OfferUnavailable).
 */
export default function MetaCheckoutHandoff({ locale, lines, unavailable }: Props) {
  const { hydrated, isIn, add } = useCart();
  const router = useRouter();
  const done = useRef(false);
  const [added, setAdded] = useState(false);
  const isEs = locale === 'es';
  const prefix = isEs ? '/es' : '';
  const checkoutHref = `${prefix}/checkout`;
  const goingStraight = lines.length > 0 && unavailable.length === 0;

  useEffect(() => {
    if (!hydrated || done.current) return;
    done.current = true;
    for (const { item, quantity } of lines) {
      if (!isIn(item.id)) add(item, quantity);
    }
    setAdded(true);
    if (goingStraight) {
      startRouteProgress(checkoutHref);
      router.replace(checkoutHref);
    }
  }, [hydrated, lines, goingStraight, isIn, add, router, checkoutHref]);

  if (goingStraight || !added) {
    return (
      <div className="max-w-xl mx-auto text-center px-6 py-16">
        <p className="mb-8" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs ? 'Abriendo su carrito…' : 'Opening your cart…'}
        </p>
      </div>
    );
  }

  const title = unavailable.length > 0
    ? (unavailable.length === 1
      ? (isEs ? 'Esta pieza ya se vendió' : 'This piece has already sold')
      : (isEs ? 'Algunas piezas ya se vendieron' : 'Some pieces have already sold'))
    : (isEs ? 'No encontramos esa pieza' : 'We couldn’t find that piece');

  return (
    <div className="max-w-xl mx-auto text-center px-6 py-16">
      <AppIcon name="info" style={{ fontSize: '44px', color: 'var(--color-outline-variant)' }} />
      <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-4" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
        {title}
      </h1>
      {unavailable.length > 0 && (
        <ul className="mb-8 space-y-1" style={{ color: 'var(--color-on-surface-variant)' }}>
          {unavailable.map((name) => <li key={name}>{name}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        {lines.length > 0 ? (
          <>
            <Link href={checkoutHref} className="gold-button">
              {isEs ? 'Continuar al pago' : 'Continue to checkout'}
            </Link>
            <Link href={`${prefix}/shop`} className="outline-button">
              {isEs ? 'Ver la tienda' : 'Browse the shop'}
            </Link>
          </>
        ) : (
          <>
            <Link href={`${prefix}/shop`} className="gold-button">
              {isEs ? 'Ver la tienda' : 'Browse the shop'}
            </Link>
            <a href="tel:2394048505" className="outline-button">{isEs ? 'Llamar' : 'Call'}</a>
          </>
        )}
      </div>
    </div>
  );
}
