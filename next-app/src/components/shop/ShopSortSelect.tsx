'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import type { CSSProperties } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { useShopNavigation } from '@/components/shop/ShopNavigationProgress';

const SORT_OPTIONS = [
  { value: '', label: 'Inventory order', labelEs: 'Inventario' },
  { value: 'newest', label: 'Newest arrivals', labelEs: 'Novedades' },
  { value: 'price-asc', label: 'Price: low to high', labelEs: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Price: high to low', labelEs: 'Precio: mayor a menor' },
  { value: 'weight-asc', label: 'Weight: low to high', labelEs: 'Peso: menor a mayor' },
  { value: 'weight-desc', label: 'Weight: high to low', labelEs: 'Peso: mayor a menor' },
  { value: 'brand-asc', label: 'Brand: A to Z', labelEs: 'Marca: A a Z' },
  { value: 'brand-desc', label: 'Brand: Z to A', labelEs: 'Marca: Z a A' },
] as const;

interface Props {
  locale: string;
  currentSort?: string;
  appearance?: 'filter' | 'gallery';
  labelStyle?: CSSProperties;
  selectStyle?: CSSProperties;
}

export default function ShopSortSelect({
  locale,
  currentSort,
  appearance = 'gallery',
  labelStyle,
  selectStyle,
}: Props) {
  const { getSearchParams, push } = useShopNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isEs = locale === 'es';

  function updateSort(value: string) {
    const params = getSearchParams(searchParams.toString());
    if (value) {
      params.set('sort', value);
    } else {
      params.delete('sort');
    }
    params.delete('page');
    const qs = params.toString();
    push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (appearance === 'filter') {
    return (
      <div>
        <label style={labelStyle}>{isEs ? 'Ordenar' : 'Sort'}</label>
        <select
          value={currentSort ?? ''}
          onChange={(event) => updateSort(event.target.value)}
          aria-label={isEs ? 'Ordenar' : 'Sort'}
          style={selectStyle}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value || 'inventory'} value={option.value}>
              {isEs ? option.labelEs : option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // The toolbar box shows its choice in a small label and lays the real
  // <select> over it, invisible (owner, 2026-10-25, "option B"). The select
  // stays 16px on touch screens — the sitewide rule in globals.css that stops
  // iOS zooming on tap — while the words people see keep the toolbar's
  // original 0.78rem bold. A tap still opens the phone's own picker.
  // ⛔ Never make the visible select itself smaller than 16px on a phone.
  const current = SORT_OPTIONS.find((option) => option.value === (currentSort ?? '')) ?? SORT_OPTIONS[0];

  return (
    <label className="shop-gallery-sort">
      <span className="shop-gallery-sort-label">{isEs ? 'Ordenar' : 'Sort'}</span>
      <span className="shop-gallery-sort-control">
        <span className="shop-gallery-sort-value" aria-hidden="true">{isEs ? current.labelEs : current.label}</span>
        <AppIcon name="arrow_drop_down" className="shop-gallery-sort-chevron" strokeWidth={2.4} />
        <select value={currentSort ?? ''} onChange={(event) => updateSort(event.target.value)}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value || 'inventory'} value={option.value}>
              {isEs ? option.labelEs : option.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
