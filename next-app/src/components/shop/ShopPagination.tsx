'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useShopNavigation, LinkPendingBridge } from '@/components/shop/ShopNavigationProgress';
import { buildShopPaginationHref, getShopPaginationItems } from '@/lib/shop-pagination';
import { AppIcon } from '@/components/AppIcon';

const GOLD = '#735c00';
const BRIGHT_GOLD_GRADIENT = 'linear-gradient(135deg, #dcb336, #b5890c)';
const PER_PAGE_OPTIONS = [12, 24, 48, 96];

// After paging, bring the top of the results into view: the era/year slider
// (desktop) or the catalog/filters area (mobile), offset below the fixed header.
// Page links use scroll={false}, so without this the window would stay parked at
// the bottom where the pagination controls are.
function scrollToResultsTop() {
  if (typeof window === 'undefined') return;
  const standalone = document.querySelector('.shop-year-filter-standalone') as HTMLElement | null;
  const target = standalone && standalone.offsetParent !== null
    ? standalone
    : (document.querySelector('.shop-catalog-layout') as HTMLElement | null);
  if (!target) return;
  const header = document.querySelector('header');
  const offset = (header?.offsetHeight ?? 72) + 12;
  const top = target.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

interface Props {
  locale: string;
  currentPage: number;
  perPage: number;
  totalPages: number;
  totalCount: number;
  showingStart: number;
  showingEnd: number;
}

export default function ShopPagination({
  locale,
  currentPage,
  perPage,
  totalPages,
  totalCount,
  showingStart,
  showingEnd,
}: Props) {
  const { getSearchParams, push } = useShopNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isEs = locale === 'es';

  // Render from committed URL state so SSR and the first client render match.
  // Pending state is merged only after a click, where it cannot alter hydration.
  function buildHref(page: number) {
    return buildShopPaginationHref(pathname, searchParams.toString(), page);
  }

  function handlePageClick(
    event: ReactMouseEvent<HTMLAnchorElement>,
    page: number,
    renderedHref: string,
  ) {
    scrollToResultsTop();
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;

    const pendingHref = buildShopPaginationHref(pathname, getSearchParams(searchParams.toString()), page);
    if (pendingHref === renderedHref) return;

    event.preventDefault();
    push(pendingHref, { scroll: false });
  }

  function updatePerPage(value: string) {
    const nextPerPage = Number(value);
    const params = getSearchParams(searchParams.toString());
    if (nextPerPage === 24) {
      params.delete('perPage');
    } else {
      params.set('perPage', String(nextPerPage));
    }
    params.delete('page');
    const qs = params.toString();
    scrollToResultsTop();
    push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const paginationItems = getShopPaginationItems(currentPage, totalPages);

  return (
    <nav
      aria-label={isEs ? 'Paginación de productos' : 'Product pagination'}
      className="shop-pagination"
    >
      <div className="shop-pagination-count">
        <AppIcon name="inventory_2"  aria-hidden="true" />
        <span>
          {totalCount > 0
            ? isEs
              ? `Mostrando ${showingStart}-${showingEnd} de ${totalCount}`
              : `Showing ${showingStart}-${showingEnd} of ${totalCount}`
            : isEs
              ? 'No hay resultados'
              : 'No results'}
        </span>
      </div>

      <div className="shop-pagination-pages">
        {totalPages > 1 && (
          <>
          <PageLink
            page={Math.max(1, currentPage - 1)}
            href={buildHref(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            label={isEs ? 'Anterior' : 'Previous'}
            icon="chevron_left"
            iconOnly
            onClick={handlePageClick}
          />
          <span className="shop-pagination-sequence">
            {paginationItems.map((item, index) => item === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="shop-pagination-ellipsis"
                aria-hidden="true"
              >
                &hellip;
              </span>
            ) : (
              <PageLink
                key={item}
                page={item}
                href={buildHref(item)}
                active={item === currentPage}
                label={String(item)}
                onClick={handlePageClick}
              />
            ))}
          </span>
          <span className="shop-pagination-mobile-status" aria-live="polite">
            {isEs
              ? `P\u00e1gina ${currentPage} de ${totalPages}`
              : `Page ${currentPage} of ${totalPages}`}
          </span>
          <PageLink
            page={Math.min(totalPages, currentPage + 1)}
            href={buildHref(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            label={isEs ? 'Siguiente' : 'Next'}
            icon="chevron_right"
            iconOnly
            onClick={handlePageClick}
          />
          </>
        )}
      </div>

      {/* Same treatment as the toolbar sort box (owner, 2026-10-25): the number
          is a label and the real <select> lies over it, invisible, so it can
          stay 16px on touch screens (the sitewide iOS no-zoom rule) while the
          box keeps its original 0.82rem bold. A tap opens the phone's picker. */}
      <label
        className="shop-pagination-size"
      >
        <span>{isEs ? 'Por página' : 'Per page'}</span>
        <span className="shop-pagination-size-control">
          <span className="shop-pagination-size-value" aria-hidden="true">{perPage}</span>
          <AppIcon name="arrow_drop_down" className="shop-pagination-size-chevron" strokeWidth={2.4} />
          <select
            value={perPage}
            onChange={(event) => updatePerPage(event.target.value)}
            aria-label={isEs ? 'Productos por página' : 'Products per page'}
          >
            {PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </span>
      </label>
      <style>{`
        .shop-pagination {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: center;
          gap: 1rem;
          margin-top: 2rem;
          padding: 0.85rem;
          border: 1px solid rgba(115, 92, 0, 0.12);
          border-radius: var(--radius-xl);
          background: #ffffff;
          box-shadow: 0 14px 36px rgba(42, 34, 12, 0.07);
        }
        .shop-pagination-count,
        .shop-pagination-size {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          min-width: 0;
          color: var(--color-on-surface-variant);
          font-family: var(--font-label);
          font-size: 0.76rem;
          font-weight: 700;
        }
        .shop-pagination-count .app-icon {
          color: ${GOLD};
          font-size: 1.05rem;
          line-height: 1;
        }
        .shop-pagination-pages {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.28rem;
          padding: 0.28rem;
          border: 1px solid rgba(115, 92, 0, 0.1);
          border-radius: var(--radius-xl);
          background: rgba(255, 255, 255, 0.96);
        }
        .shop-pagination-sequence {
          display: inline-flex;
          align-items: center;
          gap: 0.28rem;
        }
        .shop-pagination-ellipsis {
          width: 1.6rem;
          min-height: 2.35rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-on-surface-variant);
          font-family: var(--font-label);
          font-size: 0.86rem;
          font-weight: 800;
          line-height: 1;
        }
        .shop-pagination-mobile-status {
          display: none;
        }
        .shop-pagination-size {
          justify-self: end;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        /* The box people see (the number + a chevron); the real select lies
           over it at opacity 0 and is free to be 16px on touch screens. */
        .shop-pagination-size-control {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.35rem;
          min-height: 2.45rem;
          min-width: 4.25rem;
          border: 1px solid rgba(115, 92, 0, 0.18);
          border-radius: 7px;
          background: #ffffff;
          color: var(--color-on-surface);
          cursor: pointer;
          font-family: var(--font-label);
          font-size: 0.82rem;
          font-weight: 800;
          letter-spacing: normal;
          text-transform: none;
          padding: 0 0.55rem 0 0.85rem;
          box-shadow: 0 8px 18px rgba(42, 34, 12, 0.04);
        }
        .shop-pagination-size-chevron {
          flex: none;
          width: 0.95rem;
          height: 0.95rem;
        }
        .shop-pagination-size-control select {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          opacity: 0;
          border: 0;
          cursor: pointer;
          appearance: none;
        }
        .shop-pagination-size-control:has(select:focus-visible) {
          border-color: ${GOLD};
          box-shadow: 0 0 0 3px rgba(115, 92, 0, 0.12);
        }
        .shop-page-control {
          min-width: 2.35rem;
          min-height: 2.35rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          border: 1px solid rgba(115, 92, 0, 0.12);
          border-radius: 7px;
          background: #ffffff;
          color: var(--color-on-surface);
          font-family: var(--font-label);
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          line-height: 1;
          padding: 0 0.78rem;
          text-decoration: none;
          transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, color 160ms ease, transform 160ms ease;
        }
        .shop-page-control:hover {
          border-color: rgba(115, 92, 0, 0.28);
          box-shadow: 0 8px 18px rgba(42, 34, 12, 0.07);
          transform: translateY(-1px);
        }
        .shop-page-control:active {
          transform: scale(0.93);
          transition-duration: 0.05s;
        }
        @media (prefers-reduced-motion: reduce) {
          .shop-page-control {
            transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, color 160ms ease;
          }
          .shop-page-control:hover,
          .shop-page-control:active {
            transform: none;
          }
        }
        .shop-page-control.is-active {
          border-color: transparent;
          background: ${BRIGHT_GOLD_GRADIENT};
          color: var(--color-on-primary);
          box-shadow: 0 10px 22px rgba(181, 137, 12, 0.18);
        }
        .shop-page-control.is-disabled {
          color: rgba(72, 65, 52, 0.32);
          pointer-events: none;
          box-shadow: none;
        }
        .shop-page-control.is-icon-only {
          min-width: 2.35rem;
          padding: 0;
        }
        .shop-page-control .app-icon {
          font-size: 1.12rem;
          line-height: 1;
        }
        @media (max-width: 760px) {
          .shop-pagination {
            grid-template-columns: 1fr;
            justify-items: stretch;
          }
          .shop-pagination-count,
          .shop-pagination-size,
          .shop-pagination-pages {
            justify-content: center;
            justify-self: stretch;
          }
          /* "Per page" sits right beside its box, centred like the rows above
             (owner, 2026-10-25: they were pushed to opposite edges). */
          .shop-pagination-size {
            justify-content: center;
          }
        }
        @media (max-width: 440px) {
          .shop-pagination-sequence {
            display: none;
          }
          .shop-pagination-mobile-status {
            min-height: 2.35rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 0.45rem;
            color: var(--color-on-surface);
            font-family: var(--font-label);
            font-size: 0.75rem;
            font-weight: 800;
            line-height: 1;
          }
        }
      `}</style>
    </nav>
  );
}

function PageLink({
  page,
  href,
  label,
  active = false,
  disabled = false,
  icon,
  iconOnly = false,
  onClick,
}: {
  page: number;
  href: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  icon?: string;
  iconOnly?: boolean;
  onClick: (event: ReactMouseEvent<HTMLAnchorElement>, page: number, href: string) => void;
}) {
  const className = [
    'shop-page-control',
    active ? 'is-active' : '',
    disabled ? 'is-disabled' : '',
    iconOnly ? 'is-icon-only' : '',
  ].filter(Boolean).join(' ');
  const contents = (
    <>
      {icon && <AppIcon name={icon}  aria-hidden="true" />}
      {!iconOnly && <span>{label}</span>}
    </>
  );

  if (disabled) {
    return (
      <span className={className} aria-disabled="true" title={label}>
        {contents}
      </span>
    );
  }

  return (
    <Link
      href={href}
      scroll={false}
      onClick={(event) => onClick(event, page, href)}
      className={className}
      aria-current={active ? 'page' : undefined}
      title={label}
      aria-label={label}
    >
      {contents}
      <LinkPendingBridge />
    </Link>
  );
}
