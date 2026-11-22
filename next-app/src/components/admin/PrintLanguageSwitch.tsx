import Link from 'next/link';
import type { OrderLanguage } from '@/lib/order-language';

/**
 * "Print in: English | Español" on the customer print pages (Print Invoice,
 * Print Order, Gift slip, the pickup customer copy — 2026-11-21). Starts on the
 * order's customer language; a pick reloads the page with `?lang=`. Plain
 * links, no state: the page itself is rendered in that language on the server.
 */
export default function PrintLanguageSwitch({
  current,
  orderLanguage,
  basePath,
  query,
}: {
  current: OrderLanguage;
  orderLanguage: OrderLanguage;
  /** The page's own path, e.g. `/admin/orders/<id>/invoice`. */
  basePath: string;
  /** Other query parameters to keep, without the leading `?` (e.g. `copy=customer`). */
  query?: string;
}) {
  const href = (language: OrderLanguage) => `${basePath}?${[query, `lang=${language}`].filter(Boolean).join('&')}`;
  const option = (language: OrderLanguage, label: string) => {
    const on = current === language;
    return (
      <Link
        href={href(language)}
        replace
        scroll={false}
        aria-current={on ? 'true' : undefined}
        className="print-lang-option"
        style={{
          padding: '0.3rem 0.7rem',
          fontSize: '0.78rem',
          fontWeight: 700,
          textDecoration: 'none',
          background: on ? '#735c00' : '#ffffff',
          color: on ? '#ffffff' : '#735c00',
        }}
        title={language === orderLanguage ? `${label} — this order's language` : undefined}
      >
        {label}
      </Link>
    );
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <span style={{ fontSize: '0.75rem', color: '#5b5446' }}>Print in:</span>
      <span style={{ display: 'inline-flex', border: '1px solid #735c00', borderRadius: '4px', overflow: 'hidden' }}>
        {option('en', 'English')}
        {option('es', 'Español')}
      </span>
      <style>{`.print-lang-option{transition:filter .15s ease, box-shadow .15s ease}.print-lang-option:hover{filter:brightness(0.93)}.print-lang-option:active{filter:brightness(0.85)}.print-lang-option:focus-visible{outline:2px solid #d4af37;outline-offset:2px}`}</style>
    </span>
  );
}
