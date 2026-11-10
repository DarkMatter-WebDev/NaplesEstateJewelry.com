'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { formatProductItemYear, inferProductJewelryType, isProductPurchasable, isProductSold, normalizeProductQuantity, normalizeProductStatus, productImagePaddingBackground, productImagePaddingForImage, productLengthSizeDisplay, productMetalVariantLabel, productStatusLabel, productSupportsLinkType, productWidthDisplay, type Product, type SpotData } from '@/types/product';
import { getStorefrontDisplayPrice } from '@/lib/pricing';
import { formatLengthChip, formatPurity, formatWeight, getPurityChipStyle } from '@/lib/product-spec-chips';
import WishlistButton from '@/components/shop/WishlistButton';
import type { WishlistItem } from '@/context/WishlistContext';
import CartButton from '@/components/shop/CartButton';
import type { CartItem } from '@/context/CartContext';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import { getMountedProductImageIndexes } from '@/lib/shop-card-images';
import { getShopCardDots } from '@/lib/shop-card-dots';
import { claimShopCardPhotoFocus, subscribeShopCardPhotoFocus } from '@/lib/shop-card-photo-focus';
import { attachPhotoSwipe } from '@/lib/photo-swipe';
import { rememberShopReturn } from '@/lib/shop-return';
import { AppIcon } from '@/components/AppIcon';

/**
 * How long a card holds a non-cover photo after the CURSOR leaves it. Pointer
 * only — a swiped card is not on a clock at all; see the focus subscription in
 * the component.
 */
const POINTER_COVER_RESET_MS = 1000;

/* The swipe's thresholds and axis arbitration now live in `lib/photo-swipe.ts`,
   shared with the product gallery. They were duplicated here and tuned only
   here, which is how the gallery ended up eight days behind on the same bug. */

interface Props {
  product: Product;
  spotData: SpotData | null;
  locale: string;
  hideSoldItemPrices?: boolean;
  variant?: 'classic' | 'modern';
  prioritizeImage?: boolean;
  includeModernStyles?: boolean;
}

export default function ProductCard({
  product,
  spotData,
  locale,
  hideSoldItemPrices = false,
  variant = 'classic',
  prioritizeImage = false,
  includeModernStyles = false,
}: Props) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isImageHovering, setIsImageHovering] = useState(false);
  const [isImageArrowHovering, setIsImageArrowHovering] = useState(false);
  const [hasCarouselInteraction, setHasCarouselInteraction] = useState(false);
  // Touch drives the carousel by swipe, mouse by hover. Once a touch gesture is
  // seen this card stops hover-cycling and stops snapping back to photo 1 —
  // both of those would fight the finger, since a touch pointer also fires
  // pointerenter/pointerleave.
  const [isTouchCarousel, setIsTouchCarousel] = useState(false);
  const isEs = locale === 'es';
  const title = isEs && product.title_es ? product.title_es : product.title;
  const price = getStorefrontDisplayPrice(product, spotData, hideSoldItemPrices, locale);
  const metalLabel = productMetalVariantLabel(product.metal_variant, product.category, locale);
  const purityLabel = formatPurity(product, isEs);
  const purityChipStyle = getPurityChipStyle(product);
  const weightLabel = formatWeight(product.gram_weight ?? product.weight_grams);
  const lengthLabel = formatLengthChip(productLengthSizeDisplay(product), isEs);
  const widthLabel = productWidthDisplay(product);
  const itemDateLabel = formatProductItemYear(product.item_year);
  const images = useMemo(
    () =>
      (product.image_urls?.length ? product.image_urls : product.images ?? [])
        .map((image) => normalizeLegacyLocalImageUrl(image))
        .filter((image): image is string => Boolean(image)),
    [product.image_urls, product.images],
  );
  const thumb = images[0] ?? null;
  const safeActiveImageIndex = activeImageIndex < images.length ? activeImageIndex : 0;
  const activeImage = images[safeActiveImageIndex] ?? thumb;
  const hasMultipleImages = images.length > 1;
  const canShowPreviousImage = hasMultipleImages && safeActiveImageIndex > 0;
  const canShowNextImage = hasMultipleImages && safeActiveImageIndex < images.length - 1;
  const imageFrameBackground = productImagePaddingBackground(productImagePaddingForImage(product.image_padding, product.image_padding_by_image, activeImage, safeActiveImageIndex));
  const thumbPadding = productImagePaddingForImage(product.image_padding, product.image_padding_by_image, thumb, 0);
  const href = locale === 'es' ? `/es/shop/${product.id}` : `/shop/${product.id}`;
  const normalizedStatus = normalizeProductStatus(product.status);
  const isSold = isProductSold(product.status);
  const isSoldPriceHidden = isSold && hideSoldItemPrices;
  const isPurchasable = isProductPurchasable(product.status, product.quantity);
  const stockQuantity = normalizeProductQuantity(product.quantity);
  const isCheckFirst = isPurchasable && product.confirm_availability === true;
  const isModern = variant === 'modern';
  const brand = product.brand?.trim() ?? '';
  const fallbackFlagLabel = getProductCardFlagFallback(product);
  const flagLabel = brand || fallbackFlagLabel;
  const isBrandFlag = brand.length > 0;
  const flagFitClass = getProductCardFlagFitClass(flagLabel);
  const showBrandTag = flagLabel.length > 0 && safeActiveImageIndex === 0 && !isImageArrowHovering;
  const mountedImageIndexes = useMemo(
    () => getMountedProductImageIndexes(images.length, safeActiveImageIndex, hasCarouselInteraction),
    [hasCarouselInteraction, images.length, safeActiveImageIndex],
  );
  const rememberReturnPosition = useCallback(() => {
    rememberShopReturn(product.id);
  }, [product.id]);

  const cartItem: CartItem = {
    id: product.id,
    title: product.title,
    title_es: product.title_es,
    description: product.description,
    description_es: product.description_es,
    public_notes: product.public_notes,
    image: thumb,
    image_padding: thumbPadding,
    status: normalizedStatus,
    stockQuantity: product.quantity,
    checkFirst: product.confirm_availability === true,
    priceLabel: price,
    category: product.category,
    metal_type: product.metal_type,
    metal_variant: product.metal_variant,
    purity: product.purity,
    weight_grams: product.weight_grams,
    gram_weight: product.gram_weight,
    product_type: product.product_type,
    jewelry_type: product.jewelry_type,
    chain_type: product.chain_type,
    length: product.length,
    brand: product.brand,
    item_year: product.item_year,
    tags: product.tags,
    tags_es: product.tags_es,
    gender: product.gender,
  };

  const wishlistItem: WishlistItem = {
    id: product.id,
    title: product.title,
    title_es: product.title_es,
    image: thumb,
    image_padding: thumbPadding,
    status: normalizedStatus,
    price_mode: product.price_mode,
    purity: product.purity,
    weight_grams: product.weight_grams,
    pricing_multiplier: product.pricing_multiplier,
    manual_price_label: product.manual_price_label,
    sold_price: product.sold_price,
  };

  useEffect(() => {
    if (isTouchCarousel || !isImageHovering || isImageArrowHovering || !canShowNextImage) return;
    const timer = window.setInterval(() => {
      setActiveImageIndex((current) => Math.min(current + 1, images.length - 1));
    }, 1150);
    return () => window.clearInterval(timer);
  }, [canShowNextImage, images.length, isImageHovering, isImageArrowHovering, isTouchCarousel]);

  useEffect(() => {
    // The timed reset is a POINTER affordance: the cursor leaving the card is an
    // explicit end-of-interest signal, and touch has no equivalent. A swiped
    // card therefore keeps its photo indefinitely (owner request) and is
    // returned to its cover only by the subscription below, when the visitor
    // swipes a different card.
    if (isTouchCarousel || isImageHovering || activeImageIndex === 0) return;
    const timer = window.setTimeout(() => {
      setActiveImageIndex(0);
    }, POINTER_COVER_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [activeImageIndex, isImageHovering, isTouchCarousel]);

  // At most one card in the grid sits off its cover photo. Whichever card was
  // swiped last holds that slot; everyone else snaps back. Cheap for the other
  // cards — setting an index that is already 0 is a no-op re-render at worst.
  useEffect(() => subscribeShopCardPhotoFocus((focusedCardId) => {
    if (focusedCardId !== product.id) setActiveImageIndex(0);
  }), [product.id]);

  const showPreviousImage = () => {
    if (!canShowPreviousImage) return;
    setHasCarouselInteraction(true);
    setActiveImageIndex((current) => Math.max(current - 1, 0));
  };

  const showNextImage = () => {
    if (!canShowNextImage) return;
    setHasCarouselInteraction(true);
    setActiveImageIndex((current) => Math.min(current + 1, images.length - 1));
  };

  // A finished swipe must not also follow the card's link. The browser still
  // fires a click after the gesture, and to that handler a swipe is
  // indistinguishable from a tap.
  const suppressNextClick = useRef(false);
  const imageFrameRef = useRef<HTMLDivElement>(null);

  // Everything the gesture listeners need, refreshed each render. The listeners
  // attach ONCE (empty deps) and read through this, because re-attaching them
  // would drop the gesture state mid-swipe — the first touch sets React state,
  // which re-renders, which would tear the listeners down half a swipe in.
  const swipeDeps = useRef({
    hasMultipleImages,
    canShowNextImage,
    canShowPreviousImage,
    showNextImage,
    showPreviousImage,
    productId: product.id,
  });
  // Refreshed after every render (no dependency array). Writing a ref during
  // render is not allowed, and the initial value above covers the first paint.
  useEffect(() => {
    swipeDeps.current = {
      hasMultipleImages,
      canShowNextImage,
      canShowPreviousImage,
      showNextImage,
      showPreviousImage,
      productId: product.id,
    };
  });

  /**
   * Swipe the card photo. The gesture itself lives in `lib/photo-swipe.ts`,
   * shared with the product gallery — see that file for why this uses native
   * non-passive touch listeners rather than React pointer events, and for the
   * asymmetric axis arbitration that keeps an arcing thumb from being read as a
   * scroll (owner, 2026-08-09 and again 2026-08-17).
   *
   * Only the card-specific consequences stay here.
   */
  useEffect(() => {
    const frame = imageFrameRef.current;
    if (!frame) return;

    return attachPhotoSwipe(frame, () => {
      const deps = swipeDeps.current;
      return {
        onGestureStart: () => {
          // Clear any suppression left over from the PREVIOUS gesture. It is
          // armed at touchend and normally consumed by the click that follows —
          // but a horizontal swipe calls preventDefault, and the browser then
          // fires no click at all, so nothing consumes it. Left standing it
          // would swallow the visitor's next genuine tap, i.e. one swipe would
          // cost one tap on the product.
          suppressNextClick.current = false;
          setIsTouchCarousel(true);
          setHasCarouselInteraction(true);
        },
        onDragged: () => {
          suppressNextClick.current = true;
        },
        // Claim only when the swipe will actually move this card. Claiming on a
        // swipe that cannot advance — already at the last photo — would send
        // every OTHER card back to its cover while this one visibly did nothing.
        canSwipe: (direction) => (
          deps.hasMultipleImages
          && (direction === 'next' ? deps.canShowNextImage : deps.canShowPreviousImage)
        ),
        onSwipe: (direction) => {
          claimShopCardPhotoFocus(deps.productId);
          if (direction === 'next') deps.showNextImage();
          else deps.showPreviousImage();
        },
      };
    });
  }, []);

  const handleImageLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      event.preventDefault();
      return;
    }
    rememberReturnPosition();
  };

  const imageDots = isModern ? getShopCardDots(images.length, safeActiveImageIndex) : [];

  return (
    <article
      className={`group relative flex flex-col overflow-hidden ${
        isModern
          ? 'modern-product-card bg-white'
          : 'bg-[color:var(--color-surface-container-lowest)] border border-[color:var(--color-outline-variant)]'
      }`}
      style={isModern ? {
        border: '1px solid rgba(115, 92, 0, 0.12)',
        borderRadius: '8px',
        boxShadow: '0 12px 32px rgba(42, 34, 12, 0.10)',
      } : undefined}
    >

      {/* Image */}
      {/* `pan-y pinch-zoom` hands horizontal gestures to the swipe handler while
          leaving vertical scrolling AND pinch-zoom to the browser — a plain
          `none` would take all three, and `auto` would let the browser consume
          the horizontal drag before we see it. */}
      <div
        ref={imageFrameRef}
        className={`relative aspect-square overflow-hidden ${isModern ? 'modern-product-image' : ''}`}
        style={{
          background: imageFrameBackground,
          touchAction: hasMultipleImages ? 'pan-y pinch-zoom' : undefined,
        }}
        onPointerEnter={(event) => {
          // Hover-cycling is a mouse affordance. Touch fires pointerenter too,
          // so without this gate a tap would start the 1150ms auto-advance and
          // walk away from the photo the visitor just swiped to.
          if (event.pointerType !== 'mouse') return;
          // The mode follows the MOST RECENT input, it does not latch. On a
          // hybrid device (touchscreen laptop, tablet with a trackpad) a single
          // early swipe would otherwise disable this card's mouse-leave reset
          // for the rest of the session. A later touch sets it back.
          setIsTouchCarousel(false);
          setHasCarouselInteraction(true);
          setIsImageHovering(true);
        }}
        onPointerLeave={() => setIsImageHovering(false)}
      >
        {isSold && (
          <div
            className="shop-card-status-tag absolute top-3 left-3 z-10 text-[0.6rem] font-bold tracking-widest uppercase px-2 py-0.5"
            style={{
              background: isModern ? '#1f2321' : 'var(--color-on-surface)',
              color: 'var(--color-surface)',
              borderRadius: isModern ? '4px' : undefined,
            }}
          >
            {isEs ? 'Vendido' : 'Sold'}
          </div>
        )}
        {/* Check Availability pieces (owner, 2026-11-10): "Inquire", not
            "Available" — the card must not say available and then ask the
            buyer to check. Its own class, NOT `shop-card-status-available`:
            that one is hidden on phones because the cart icon takes its
            corner, and these pieces have no cart icon, so the chip stays. */}
        {isCheckFirst && (
          <div
            className="shop-card-status-tag shop-card-status-inquire absolute top-3 left-3 z-10 text-[0.6rem] font-bold tracking-widest uppercase px-2 py-0.5"
            style={{
              background: isModern ? 'linear-gradient(135deg, #d5a820, #ad8507)' : 'var(--color-primary)',
              color: isModern ? '#fffdf7' : 'var(--color-on-primary)',
              borderRadius: isModern ? '4px' : undefined,
              boxShadow: isModern ? '0 8px 18px rgba(115, 92, 0, 0.16)' : undefined,
            }}
          >
            {isEs ? 'Consultar' : 'Inquire'}
          </div>
        )}
        {!isSold && !isCheckFirst && (
          <div
            className="shop-card-status-tag shop-card-status-available absolute top-3 left-3 z-10 text-[0.6rem] font-bold tracking-widest uppercase px-2 py-0.5"
            style={{
              background: isPurchasable ? (isModern ? 'linear-gradient(135deg, #d5a820, #ad8507)' : 'var(--color-primary)') : '#8a5a00',
              color: isModern ? '#fffdf7' : 'var(--color-on-primary)',
              borderRadius: isModern ? '4px' : undefined,
              boxShadow: isModern ? '0 8px 18px rgba(115, 92, 0, 0.16)' : undefined,
            }}
          >
            {isPurchasable
              ? stockQuantity > 1
                ? (isEs ? `${stockQuantity} disponibles` : `${stockQuantity} in stock`)
                : (isEs ? 'Disponible' : 'Available')
              : productStatusLabel(product.status)}
          </div>
        )}
        {/* Cart icon button — mobile only, top-left (replaces Available tag on small screens) */}
        {isPurchasable && (
          <div className="shop-card-cart-icon-wrap absolute top-2 left-2 z-10">
            <CartButton item={cartItem} variant="icon" locale={locale} />
          </div>
        )}

        {/* Wishlist button — top-right of image */}
        <div className="shop-card-wishlist-wrap absolute top-2 right-2 z-10">
          <WishlistButton item={wishlistItem} variant="icon" locale={locale} />
        </div>

        {showBrandTag && (
          <div
            className={`shop-card-brand-tag ${isBrandFlag ? 'shop-card-brand-tag-brand' : 'shop-card-brand-tag-link'} ${flagFitClass} absolute bottom-2 left-2 z-10 max-w-[70%] truncate px-2.5 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] transition-opacity duration-150`}
            style={{
              background: isBrandFlag
                ? 'linear-gradient(135deg, rgba(255, 253, 246, 0.96), rgba(246, 232, 184, 0.94))'
                : 'rgba(255, 252, 246, 0.92)',
              border: isBrandFlag
                ? '1px solid rgba(181, 137, 12, 0.42)'
                : '1px solid rgba(115, 92, 0, 0.22)',
              borderRadius: isModern ? '6px' : undefined,
              color: 'var(--color-primary)',
              fontFamily: 'var(--font-label)',
              boxShadow: isBrandFlag
                ? '0 7px 18px rgba(42, 34, 12, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.82)'
                : '0 6px 16px rgba(42, 34, 12, 0.14)',
              textShadow: isBrandFlag ? '0 1px 0 rgba(255, 255, 255, 0.72)' : undefined,
            }}
          >
            {flagLabel}
          </div>
        )}

        {activeImage ? (
          <Link href={href} prefetch={false} className="absolute inset-0" onClick={handleImageLinkClick}>
            {mountedImageIndexes.map((index) => {
              const image = images[index];
              return (
              <Image
                key={`${product.id}-${index}-${image}`}
                src={image}
                alt={index === safeActiveImageIndex ? title : ''}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1719px) 25vw, (max-width: 1959px) 20vw, (max-width: 2319px) 16vw, 14vw"
                className={`pointer-events-none object-contain object-center transition-opacity duration-700 ease-in-out ${
                  index === safeActiveImageIndex ? 'opacity-100' : 'opacity-0'
                }`}
                // The first cover image of an above-the-fold card is the LCP
                // candidate: `priority` emits a preload link + fetchpriority=high.
                // Later (hover-carousel) images stay lazy so they don't compete.
                priority={prioritizeImage && index === 0}
                loading={prioritizeImage && index === 0 ? undefined : 'lazy'}
                // Local assets in the static folder aren't in remotePatterns; unoptimized for those
                unoptimized={image.startsWith('/assets/')}
              />
              );
            })}
          </Link>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#735c00]/35">
            <AppIcon name="image"  style={{ fontSize: '2rem' }} aria-hidden="true" />
          </div>
        )}
        {imageDots.length > 0 && (
          <div
            className={`shop-card-image-dots ${isImageHovering ? 'is-visible' : ''}`}
            data-current-image={safeActiveImageIndex + 1}
            data-image-count={images.length}
            aria-hidden="true"
          >
            <span className="shop-card-image-dots-track">
              {imageDots.map((dot) => (
                <span
                  key={dot.index}
                  className={`shop-card-image-dot shop-card-image-dot-${dot.size}${dot.isActive ? ' is-active' : ''}`}
                />
              ))}
            </span>
          </div>
        )}
        {hasMultipleImages && (
          <>
            {canShowPreviousImage && (
              <button
                type="button"
                aria-label={isEs ? 'Imagen anterior' : 'Previous image'}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  showPreviousImage();
                }}
                onPointerEnter={() => setIsImageArrowHovering(true)}
                onPointerLeave={() => setIsImageArrowHovering(false)}
                onFocus={() => setIsImageArrowHovering(true)}
                onBlur={() => setIsImageArrowHovering(false)}
                className="shop-card-image-arrow absolute bottom-2 left-2 z-20 inline-flex h-6 w-6 items-center justify-center border text-sm font-bold transition-colors"
                style={{
                  borderColor: 'rgba(115, 92, 0, 0.3)',
                  background: 'rgba(255, 252, 246, 0.9)',
                  color: 'var(--color-primary)',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.12)',
                }}
              >
                &lsaquo;
              </button>
            )}
            {canShowNextImage && (
              <button
                type="button"
                aria-label={isEs ? 'Imagen siguiente' : 'Next image'}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  showNextImage();
                }}
                onPointerEnter={() => setIsImageArrowHovering(true)}
                onPointerLeave={() => setIsImageArrowHovering(false)}
                onFocus={() => setIsImageArrowHovering(true)}
                onBlur={() => setIsImageArrowHovering(false)}
                className="shop-card-image-arrow absolute bottom-2 right-2 z-20 inline-flex h-6 w-6 items-center justify-center border text-sm font-bold transition-colors"
                style={{
                  borderColor: 'rgba(115, 92, 0, 0.3)',
                  background: 'rgba(255, 252, 246, 0.9)',
                  color: 'var(--color-primary)',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.12)',
                }}
              >
                &rsaquo;
              </button>
            )}
          </>
        )}
        {isModern && (
          <div className="modern-card-hover-title" aria-hidden="true">
            {title}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="modern-card-body flex flex-col flex-1 p-4 gap-1.5">
        <span
          className="text-[0.62rem] font-bold uppercase tracking-[0.28em]"
          style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
        >
          {metalLabel}
        </span>

        <Link href={href} prefetch={false} className="group/title" onClick={rememberReturnPosition}>
          <h3
            className="hover-underline-grow font-bold text-[0.98rem] leading-snug mt-0.5 line-clamp-3"
            style={{
              fontFamily: 'var(--font-headline)',
              color: 'var(--color-on-surface)',
              minHeight: 'calc(1.375em * 3)',
            }}
          >
            {title}
          </h3>
        </Link>

        {!isModern && itemDateLabel && (
          <p
            className="modern-card-date text-[0.66rem] font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
          >
            <span className="normal-case">Ca.</span> {itemDateLabel}
          </p>
        )}

        <p
          className={`mt-1 flex items-baseline gap-2 px-2 py-1.5 ${isModern ? 'modern-price-row' : 'border-y'}`}
          style={{
            position: isModern ? 'relative' : undefined,
            background: isModern ? 'linear-gradient(135deg, rgba(255, 250, 238, 0.92), rgba(249, 244, 232, 0.96))' : 'rgba(194, 155, 45, 0.06)',
            borderColor: 'rgba(115, 92, 0, 0.18)',
            borderTop: isModern ? '1px solid rgba(115, 92, 0, 0.14)' : undefined,
            borderBottom: isModern ? '1px solid rgba(115, 92, 0, 0.14)' : undefined,
            borderRadius: isModern ? '6px' : undefined,
            fontFamily: 'var(--font-label)',
          }}
        >
          {isModern && itemDateLabel && (
            <span
              className="modern-card-date text-[0.66rem] font-semibold uppercase tracking-[0.16em]"
              style={{
                position: 'absolute',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-on-surface-variant)',
                fontFamily: 'var(--font-label)',
              }}
            >
              {/* The "Ca." prefix is its own element so a narrow card can drop
                  it and keep the bare year in place (owner, 2026-08-09). See
                  the @container rule in the stylesheet below. */}
              <span className="modern-card-date-prefix normal-case">Ca.</span> {itemDateLabel}
            </span>
          )}
          <span
            className="modern-price-label text-[0.68rem] font-extrabold uppercase tracking-widest"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            {isSoldPriceHidden ? (isEs ? 'Estado' : 'Status') : (isEs ? 'Tu precio' : 'Your price')}
          </span>
          <span
            className="modern-price-value text-base font-extrabold uppercase tracking-wide"
            style={{ color: 'var(--color-primary)' }}
          >
            {price}
          </span>
          {widthLabel && (
            <span
              className={`product-card-width text-[0.66rem] font-bold whitespace-nowrap ${isModern ? 'modern-card-width' : 'ml-auto'}`}
              style={{ color: 'var(--color-on-surface-variant)' }}
              aria-label={`${isEs ? 'Ancho' : 'Width'}: ${widthLabel}`}
            >
              {widthLabel}
            </span>
          )}
        </p>
        <div
          className="grid grid-cols-3 gap-1 text-[0.68rem] font-bold leading-none"
          style={{ fontFamily: 'var(--font-label)' }}
        >
          <span
            className="inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-full border px-1.5 py-1"
            style={{
              background: purityChipStyle.background,
              borderColor: purityChipStyle.borderColor,
              color: purityChipStyle.color,
            }}
          >
            {purityLabel}
          </span>
          <span
            className="inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-full border px-1.5 py-1"
            style={{
              background: 'rgba(72, 65, 52, 0.07)',
              borderColor: 'rgba(72, 65, 52, 0.18)',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            {weightLabel}
          </span>
          <span
            className="inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-full border px-1.5 py-1"
            style={{
              background: lengthLabel ? 'rgba(139, 85, 36, 0.08)' : 'transparent',
              borderColor: lengthLabel ? 'rgba(139, 85, 36, 0.2)' : 'transparent',
              color: '#7a4a1f',
              visibility: lengthLabel ? 'visible' : 'hidden',
            }}
          >
            {lengthLabel ?? ''}
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-auto pt-3">
          <CartButton item={cartItem} variant="card" locale={locale} includeCardStyles={includeModernStyles} />
        </div>
      </div>
      {isModern && includeModernStyles && (
        <style>{`
          .shop-card-image-arrow {
            transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease, transform 100ms ease;
            /* Sits on the SAME baseline as the brand/link flag (owner request),
               so keep this equal to the flag's bottom below. Bottom-aligned
               rather than centre-aligned deliberately: the two flag variants
               are different heights (link 18px, brand 24.9px) and share only
               their bottom edge, so a centre match would be right for one
               variant and 3.4px out on the other. */
            bottom: 1.4rem !important;
          }
          .shop-card-image-arrow:active {
            transform: scale(0.8);
            transition-duration: 0.05s;
          }
          /* No arrows on touch (owner request) — the swipe changes the photo and
             the dots report it, so the arrows are redundant chrome sitting on
             the product image. Same arrangement the product page gallery uses.
             Hidden in CSS rather than by detecting touch in JS: a JS check would
             render differently on the server and the client and produce a
             hydration mismatch. */
          @media (hover: none) {
            .shop-card-image-arrow {
              display: none;
            }
          }
          /* Carousel dots sit ON the photo's bottom edge (owner request), and
             the brand flag is lifted above them to clear the row — the flag is
             left-aligned and can run to 62% of the card, so it is the only
             piece of bottom chrome a CENTRED row can reach. The arrows are
             hard against the left/right edges and never meet it horizontally,
             and the flag and the prev-arrow are mutually exclusive (the flag
             shows only on photo 1, the prev-arrow only from photo 2), so the
             bottom-left corner is free for whichever is present. */
          .shop-card-image-dots {
            position: absolute;
            right: 0;
            bottom: 0.35rem;
            left: 0;
            z-index: 25;
            display: flex;
            justify-content: center;
            padding: 0 0.5rem;
            opacity: 0;
            /* Indicator only — the swipe and the arrows navigate. Catching a
               tap here would steal it from the link that opens the product. */
            pointer-events: none;
            transition: opacity 160ms ease;
          }
          .modern-product-image:hover .shop-card-image-dots,
          .shop-card-image-dots.is-visible {
            opacity: 1;
          }
          /* The row is taller at 641px+ (it keeps the pill there, 11px vs 5px),
             so it needs a touch more room off the edge to look seated rather
             than clipped. */
          @media (min-width: 641px) {
            .shop-card-image-dots {
              bottom: 0.45rem;
            }
          }
          /* The flag is lifted to clear the dot row. This value is a PAIR with
             the dots' offset above — the flag must clear the row's top edge
             (dots bottom + row height), so re-measure both together if either
             the offset, the row height, or the flag's own size changes.
             The element carries a Tailwind bottom-2 utility, hence !important.
             NOTE: no backticks anywhere in this stylesheet — it is a template
             literal, and one would end it mid-file. */
          .shop-card-brand-tag {
            bottom: 1.4rem !important;
          }
          /* VISIBILITY tracks hover capability instead, so it is right on a
             tablet at any width: no hover there, and the swipe is the only
             on-image control, so without a permanent indicator the gesture has
             no feedback and nothing advertises that more photos exist. */
          @media (hover: none) {
            .shop-card-image-dots {
              opacity: 1;
            }
          }
          /* On POINTER devices the scrim is what makes one dot treatment legible
             on both a white and a black product backdrop, so the dots never
             depend on the photo's padding colour. Touch drops it — see the
             floating treatment at the end of this block. */
          .shop-card-image-dots-track {
            display: inline-flex;
            align-items: center;
            gap: 0.2rem;
            max-width: 100%;
            padding: 0.2rem 0.32rem;
            border-radius: 999px;
            background: rgba(24, 19, 9, 0.5);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
          }
          .shop-card-image-dot {
            display: block;
            flex: none;
            width: 0.3rem;
            height: 0.3rem;
            border-radius: 999px;
            background: rgba(255, 252, 246, 0.55);
            transition: width 200ms ease, height 200ms ease, background-color 200ms ease;
          }
          /* The taper is the only thing telling the viewer the strip continues
             past a windowed edge. */
          .shop-card-image-dot-medium {
            width: 0.21rem;
            height: 0.21rem;
          }
          .shop-card-image-dot-small {
            width: 0.14rem;
            height: 0.14rem;
          }
          .shop-card-image-dot.is-active {
            background: #e8bb35;
          }
          /* Floating dots on touch — no shared pill (owner request). This block
             MUST stay after the base track/dot rules: it overrides them at equal
             specificity, so moving it above them silently restores the pill.
             The pill was carrying contrast for the whole row, so each dot now
             carries its own — a soft dark halo rather than a hard ring, which at
             a 4.8px dot would read as a donut. The halo is what keeps a
             near-white dot legible on a white-backdrop photo; the fill does it
             on a black one. */
          @media (hover: none) {
            .shop-card-image-dots-track {
              gap: 0.26rem;
              padding: 0;
              background: none;
              box-shadow: none;
            }
            /* Two layers, because each covers the case the other cannot. The
               hairline ring is the whole edge on a cream/white backdrop, where
               the dot's own fill measures 1.04:1 against the frame — invisible
               on fill alone. The light fill is what carries it on a black
               backdrop, where the ring disappears into the photo. Do not drop
               either one. */
            .shop-card-image-dot {
              background: rgba(255, 253, 247, 0.94);
              box-shadow:
                0 0 0 0.5px rgba(24, 19, 9, 0.5),
                0 0 2px rgba(24, 19, 9, 0.7),
                0 1px 3px rgba(24, 19, 9, 0.5);
            }
            .shop-card-image-dot.is-active {
              background: #e8bb35;
              box-shadow:
                0 0 0 0.5px rgba(24, 19, 9, 0.55),
                0 0 2px rgba(24, 19, 9, 0.75),
                0 1px 3px rgba(24, 19, 9, 0.55);
            }
          }
          .modern-product-card {
            transition:
              transform 180ms ease,
              box-shadow 180ms ease,
              border-color 180ms ease;
          }
          .modern-product-card:hover {
            transform: translateY(-3px);
            border-color: rgba(181, 137, 12, 0.26) !important;
            box-shadow: 0 18px 44px rgba(42, 34, 12, 0.14) !important;
          }
          .modern-product-card .modern-product-image {
            border-radius: var(--radius-xl);
          }
          .modern-product-card .shop-card-cart-button {
            border-radius: 999px;
            border-color: rgba(181, 137, 12, 0.38) !important;
            background: rgba(255, 253, 248, 0.86);
          }
          .modern-product-card .shop-card-cart-button:hover {
            background: linear-gradient(135deg, #d9ad2f, #b98c09);
            color: #fffdf7;
          }
          /* Compact card body — applied at all breakpoints (mobile, tablet, desktop) */
          .modern-product-card .modern-card-body {
            padding: 0.3rem 0.6rem 0.6rem;
            gap: 0.2rem;
          }
          /* Hide the metal label ("YELLOW GOLD") and the product title */
          .modern-product-card .modern-card-body > span:first-child,
          .modern-product-card .modern-card-body > a {
            display: none;
          }
          /* Price floats on the white card — no cream background or borders */
          .modern-product-card .modern-price-row {
            margin-top: 0;
            padding: 0 0.45rem;
            gap: 0.35rem;
            line-height: 1.1;
            justify-content: center;
            background: none !important;
            border: none !important;
            border-radius: 0 !important;
            /* Query container for the date rule below. It must be the ROW, not
               the viewport: the shop grid is 1-up at 320px (273px row), 2-up by
               390px (161px), and 4-up at 1280px (177px), so row width is NOT
               monotonic in viewport width and a media query would size for the
               wrong box. Safe to add here because the row is already
               position:relative and therefore already the containing block for
               the two absolutely positioned children.
               (No backticks anywhere in this stylesheet — it is a template
               literal and one would end it mid-file.) */
            container-type: inline-size;
          }
          /* Three things share this row: the date (absolute, left), the price
             (centred, in flow) and the width chip (absolute, right). "Ca. 1960"
             is 56px and the catalog's widest price is 67px ($2,394.56), which
             together with the 41px chip and the gaps needs about 187px of row.
             A 2-up phone card gives 161px and a desktop card 177px, so they
             collided — measured -9px on production, the date printing INTO the
             price.

             When it does not fit, DROP THE "Ca." PREFIX rather than reflowing
             the date somewhere else (owner, 2026-08-09). The bare year is about
             26px, which clears the widest price with ~29px to spare even on the
             narrowest card, so the label stays exactly where it belongs — in
             the left slot, on the price line — and no card changes height.
             An earlier attempt moved the date onto its own centred line above
             the price; it worked, but it made every card ~14px taller.

             The threshold is a CONTENT width and is keyed to the WORST-CASE
             price, because one colliding card is the bug: keeping the prefix
             needs 2 x (56 - 7.2 + 4) + 67 = 173px, so 185px leaves margin.
             Re-derive it if the label size, the row padding, or the widest
             price in the catalog changes. */
          @container (max-width: 185px) {
            .modern-product-card .modern-card-date-prefix {
              display: none;
            }
          }
          .modern-product-card .modern-price-label {
            display: none;
          }
          .modern-product-card .modern-price-value {
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 0.92rem;
            font-weight: 700;
            letter-spacing: 0.005em;
            text-transform: none;
            font-variant-numeric: tabular-nums;
          }
          .modern-product-card .modern-card-width {
            position: absolute;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            font-size: 0.66rem;
            font-variant-numeric: tabular-nums;
          }
          /* Compact spec chips (purity / weight / length) */
          .modern-product-card .modern-card-body > .grid span {
            padding-top: 0.22rem;
            padding-bottom: 0.22rem;
          }
          @media (max-width: 640px) {
            .shop-card-status-tag {
              top: 0.28rem !important;
              left: 0.28rem !important;
              padding: 0.08rem 0.24rem !important;
              font-size: 0.38rem !important;
              letter-spacing: 0.05em !important;
              border-radius: 2px !important;
              box-shadow: 0 3px 7px rgba(115, 92, 0, 0.12) !important;
            }
            .shop-card-wishlist-wrap {
              top: 0.32rem !important;
              right: 0.32rem !important;
            }
            .shop-card-wishlist-button {
              width: 1.8rem !important;
              height: 1.8rem !important;
              box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12) !important;
            }
            .shop-card-wishlist-button [data-wishlist-icon="true"] {
              font-size: 15px !important;
            }
            .shop-card-image-arrow {
              width: 1.15rem !important;
              height: 1.15rem !important;
              /* Paired with the flag's mobile bottom (0.9rem) — same baseline. */
              bottom: 0.9rem !important;
              font-size: 0.7rem !important;
              line-height: 1 !important;
              box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1) !important;
            }
            .shop-card-image-arrow.left-2 {
              left: 0.35rem !important;
            }
            .shop-card-image-arrow.right-2 {
              right: 0.35rem !important;
            }
          }
          .shop-card-brand-tag-link {
            padding-top: 0.22rem !important;
            padding-bottom: 0.22rem !important;
            font-size: 0.56rem !important;
            line-height: 1 !important;
            letter-spacing: 0.12em !important;
          }
          @media (max-width: 640px) {
            .shop-card-brand-tag-link {
              bottom: 0.9rem !important;
              left: 0.28rem !important;
              padding: 0.1rem 0.28rem !important;
              font-size: 0.46rem !important;
              letter-spacing: 0.05em !important;
              border-radius: 2px !important;
            }
            .shop-card-brand-tag-fit-medium {
              font-size: 0.42rem !important;
              letter-spacing: 0.03em !important;
            }
            .shop-card-brand-tag-fit-long {
              font-size: 0.38rem !important;
              letter-spacing: 0.01em !important;
              padding-left: 0.22rem !important;
              padding-right: 0.22rem !important;
            }
          }
          @media (max-width: 640px) {
            .shop-card-brand-tag-brand {
              bottom: 0.9rem !important;
              left: 0.28rem !important;
              max-width: 62% !important;
              padding: 0.1rem 0.28rem !important;
              font-size: 0.46rem !important;
              line-height: 1 !important;
              letter-spacing: 0.05em !important;
              border-radius: 2px !important;
              box-shadow: 0 3px 7px rgba(42, 34, 12, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72) !important;
            }
          }
          @media (max-width: 640px) {
            .modern-product-card .modern-card-body {
              padding-left: 0.35rem;
              padding-right: 0.35rem;
            }
            .modern-product-card .modern-card-body > .grid {
              gap: 0.08rem;
              font-size: 0.58rem;
            }
            .modern-product-card .modern-card-body > .grid span {
              padding-left: 0.08rem;
              padding-right: 0.08rem;
            }
            /* The date label is SHOWN on mobile (owner, 2026-08-09). It used to
               be hidden here alongside the price label, but it fits: on a 320px
               card the price row is 273px, the price sits at 113-159px and the
               width chip at 232-273px, so the label's ~55px has 113px of clear
               space at the left. It is absolutely positioned at left:0, so it
               takes no part in the row's flex layout and cannot push anything.
               Re-measure that gap before adding anything else to this row.
               The "Your price" label above it stays hidden, deliberately. */
            /* Hide the Available text tag on mobile — replaced by cart icon */
            .shop-card-status-available {
              display: none !important;
            }
            /* Show cart icon button on mobile */
            .shop-card-cart-icon-wrap {
              display: flex;
            }
            .shop-card-cart-icon-button {
              width: 1.8rem !important;
              height: 1.8rem !important;
              box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12) !important;
            }
            .shop-card-cart-icon-button [data-cart-icon="true"] {
              font-size: 14px !important;
            }
            /* Expand the mobile tap target for the two corner icon buttons
               without enlarging the visible icon. A transparent overlay grows
               the clickable area to ~44px (from ~28px) and, because it extends
               past the card corner where the image container clips it, the
               entire corner of the card image reliably taps the button. */
            .shop-card-cart-icon-button,
            .shop-card-wishlist-button {
              position: relative;
            }
            .shop-card-cart-icon-button::before,
            .shop-card-wishlist-button::before {
              content: '';
              position: absolute;
              inset: -0.85rem;
              border-radius: 999px;
            }
          }
          /* Cart icon button — hidden on tablet/desktop, visible on mobile */
          @media (min-width: 641px) {
            .shop-card-cart-icon-wrap {
              display: none;
            }
          }
          /* Tighten the action row above the Add button */
          .modern-product-card .modern-card-body > .flex:last-child {
            padding-top: 0.4rem;
          }
          /* Title hover tooltip — desktop only (title is hidden in the card body) */
          .modern-card-hover-title {
            display: none;
          }
          @media (min-width: 1024px) {
            .modern-card-hover-title {
              display: block;
              position: absolute;
              left: 0.7rem;
              right: 0.7rem;
              bottom: 0.7rem;
              padding: 0.5rem 0.75rem;
              border-radius: var(--radius-lg);
              background: rgba(24, 19, 9, 0.86);
              backdrop-filter: blur(3px);
              color: #fffdf7;
              font-family: var(--font-headline);
              font-size: 0.74rem;
              font-weight: 600;
              line-height: 1.3;
              text-align: center;
              opacity: 0;
              transform: translateY(8px);
              transition: opacity 200ms ease, transform 200ms ease;
              pointer-events: none;
              z-index: 15;
              box-shadow: 0 10px 26px rgba(0, 0, 0, 0.3);
            }
            .modern-product-card:hover .modern-card-hover-title {
              opacity: 1;
              transform: translateY(0);
            }
            .modern-product-card:hover .shop-card-brand-tag,
            .modern-product-card:focus-within .shop-card-brand-tag {
              opacity: 0;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .modern-product-card,
            .modern-product-card:hover,
            .shop-card-image-arrow,
            .shop-card-image-dots,
            .shop-card-image-dot {
              transition: none;
              transform: none;
              filter: none;
            }
            .shop-card-image-arrow:active {
              transform: none;
            }
          }
        `}</style>
      )}
    </article>
  );
}





function getProductCardFlagFallback(product: Product): string {
  const jewelryType = inferProductJewelryType(product);
  if (!productSupportsLinkType(jewelryType)) return '';

  const linkType = product.chain_type ?? (product.tags ?? []).find((tag) => tag.startsWith('ct:'))?.slice(3) ?? '';
  return linkType.trim();
}

function getProductCardFlagFitClass(label: string): string {
  const length = label.trim().length;
  if (length >= 18) return 'shop-card-brand-tag-fit-long';
  if (length >= 13) return 'shop-card-brand-tag-fit-medium';
  return '';
}
