import Link from 'next/link';
import { AppIcon } from '@/components/AppIcon';

/** The calm "not available" card for both offer pages (no offers taken / link no longer valid). */
export default function OfferUnavailable({
  isEs,
  title,
  body,
  productHref,
}: {
  isEs: boolean;
  title: string;
  body: string;
  productHref: string | null;
}) {
  const prefix = isEs ? '/es' : '';
  return (
    <div className="max-w-xl mx-auto text-center px-6 py-16">
      <AppIcon name="info" style={{ fontSize: '44px', color: 'var(--color-outline-variant)' }} />
      <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-4" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
        {title}
      </h1>
      <p className="mb-8" style={{ color: 'var(--color-on-surface-variant)' }}>{body}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href={productHref ?? `${prefix}/shop`} className="gold-button">
          {productHref ? (isEs ? 'Ver la pieza' : 'View the piece') : (isEs ? 'Ver la tienda' : 'Browse the shop')}
        </Link>
        <a href="tel:2394048505" className="outline-button">{isEs ? 'Llamar' : 'Call'}</a>
      </div>
    </div>
  );
}
