'use client';

import { useCallback, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  formatProductItemYear,
  inferProductJewelryType,
  isProductPurchasable,
  isProductSold,
  normalizeProductQuantity,
  normalizeProductStatus,
  productImagePaddingBackground,
  productImagePaddingForImage,
  productLengthSizeDisplay,
  productMetalVariantLabel,
  productStatusLabel,
  productSupportsLinkType,
  productWidthDisplay,
  type Product,
  type SpotData,
} from '@/types/product';
import { getStorefrontDisplayPrice } from '@/lib/pricing';
import { formatLengthChip, formatPurity, formatWeight, getPurityChipStyle } from '@/lib/product-spec-chips';
import WishlistButton from '@/components/shop/WishlistButton';
import type { WishlistItem } from '@/context/WishlistContext';
import CartButton from '@/components/shop/CartButton';
import type { CartItem } from '@/context/CartContext';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import { rememberShopReturn } from '@/lib/shop-return';
import { AppIcon } from '@/components/AppIcon';

interface Props {
  product: Product;
  spotData: SpotData | null;
  locale: string;
  hideSoldItemPrices?: boolean;
  prioritizeImage?: boolean;
}

export default function ProductListRow({ product, spotData, locale, hideSoldItemPrices = false, prioritizeImage = false }: Props) {
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
  const thumbPadding = productImagePaddingForImage(product.image_padding, product.image_padding_by_image, thumb, 0);
  const imageFrameBackground = productImagePaddingBackground(thumbPadding);
  const href = locale === 'es' ? `/es/shop/${product.id}` : `/shop/${product.id}`;
  const normalizedStatus = normalizeProductStatus(product.status);
  const isSold = isProductSold(product.status);
  const isSoldPriceHidden = isSold && hideSoldItemPrices;
  const isPurchasable = isProductPurchasable(product.status, product.quantity);
  const stockQuantity = normalizeProductQuantity(product.quantity);
  const brand = product.brand?.trim() ?? '';
  const linkTypeLabel = getProductLinkTypeLabel(product);
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

  return (
    <article className="shop-list-row">
      <Link href={href} prefetch={false} className="shop-list-thumb" style={{ background: imageFrameBackground }} onClick={rememberReturnPosition}>
        {thumb ? (
          <Image
            src={thumb}
            alt={title}
            fill
            sizes="(max-width: 640px) 22vw, 120px"
            className="object-contain object-center"
            priority={prioritizeImage}
            loading={prioritizeImage ? undefined : 'lazy'}
            unoptimized={thumb.startsWith('/assets/')}
          />
        ) : (
          <AppIcon name="image" className="shop-list-thumb-placeholder" aria-hidden="true" />
        )}
      </Link>

      <div className="shop-list-main">
        <div className="shop-list-metal-row">
          <span
            className="shop-list-status"
            data-sold={isSold || undefined}
            data-pending={!isSold && !isPurchasable || undefined}
          >
            {isSold
              ? (isEs ? 'Vendido' : 'Sold')
              : isPurchasable
                // Check Availability pieces say "Inquire" (owner, 2026-11-10) — same as the card.
                ? product.confirm_availability === true
                  ? (isEs ? 'Consultar' : 'Inquire')
                  : stockQuantity > 1
                    ? (isEs ? `${stockQuantity} disponibles` : `${stockQuantity} in stock`)
                    : (isEs ? 'Disponible' : 'Available')
                : productStatusLabel(product.status)}
          </span>
          <span className="shop-list-metal">{metalLabel}</span>
        </div>
        <Link href={href} prefetch={false} className="shop-list-title-link" onClick={rememberReturnPosition}>
          <h3 className="shop-list-title hover-underline-grow">{title}</h3>
        </Link>
        <div className="shop-list-meta">
          {(brand || linkTypeLabel) && (
            <span className={`shop-list-flag ${brand ? 'is-brand' : 'is-link'}`}>{brand || linkTypeLabel}</span>
          )}
          {itemDateLabel && (
            <span className="shop-list-circa">
              <span className="shop-list-circa-prefix">Ca.</span> {itemDateLabel}
            </span>
          )}
        </div>
        <div className="shop-list-chips">
          <span
            className="shop-list-chip"
            style={{ background: purityChipStyle.background, borderColor: purityChipStyle.borderColor, color: purityChipStyle.color }}
          >
            {purityLabel}
          </span>
          <span
            className="shop-list-chip"
            style={{ background: 'rgba(72, 65, 52, 0.07)', borderColor: 'rgba(72, 65, 52, 0.18)', color: 'var(--color-on-surface-variant)' }}
          >
            {weightLabel}
          </span>
          {lengthLabel && (
            <span
              className="shop-list-chip"
              style={{ background: 'rgba(139, 85, 36, 0.08)', borderColor: 'rgba(139, 85, 36, 0.2)', color: '#7a4a1f' }}
            >
              {lengthLabel}
            </span>
          )}
          {widthLabel && (
            <span
              className="shop-list-chip"
              style={{ background: 'rgba(77, 99, 93, 0.08)', borderColor: 'rgba(77, 99, 93, 0.2)', color: '#3f5f56' }}
              aria-label={`${isEs ? 'Ancho' : 'Width'}: ${widthLabel}`}
            >
              {widthLabel}
            </span>
          )}
        </div>
      </div>

      <div className="shop-list-aside">
        <div className="shop-list-price">
          <span className="shop-list-price-label">{isSoldPriceHidden ? (isEs ? 'Estado' : 'Status') : (isEs ? 'Tu precio' : 'Your price')}</span>
          <span className="shop-list-price-value">{price}</span>
        </div>
        <div className="shop-list-actions">
          <WishlistButton item={wishlistItem} variant="icon" locale={locale} />
          <CartButton item={cartItem} variant="list" locale={locale} />
        </div>
      </div>
    </article>
  );
}

function getProductLinkTypeLabel(product: Product): string {
  const jewelryType = inferProductJewelryType(product);
  if (!productSupportsLinkType(jewelryType)) return '';
  const linkType = product.chain_type ?? (product.tags ?? []).find((tag) => tag.startsWith('ct:'))?.slice(3) ?? '';
  return linkType.trim();
}




