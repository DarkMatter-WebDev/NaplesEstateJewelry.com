import type { Metadata } from 'next';
import Link from 'next/link';
import AdminHeader from '@/components/admin/AdminHeader';
import TradeInSaleForm from '@/components/admin/instant-sale/TradeInSaleForm';
import { loadInstantSalePage } from '@/components/admin/instant-sale/load-instant-sale-page';
import { createServiceClient } from '@/lib/supabase/service';
import { createPublicClient } from '@/lib/supabase/public';
import { fetchSpecialPriceDefault } from '@/lib/shop-settings';
import { calcSpotMeltValue, getProductPriceValue } from '@/lib/pricing';
import { resolveAdvertisedTradeInPrice, shouldShowSpotPrice, type Product, type SpotData } from '@/types/product';

export const metadata: Metadata = { title: 'Admin - Instant Sale · Trade-in' };

interface Props {
  params: Promise<{ locale: string }>;
}

const TRADE_IN_COLUMNS = [
  'id', 'title', 'category', 'metal_variant', 'purity', 'gram_weight', 'weight_grams', 'price_mode', 'pricing_multiplier',
  'manual_price_label', 'asking_price', 'sold_price', 'show_spot_price',
  'special_price_override_enabled', 'special_price_override_amount', 'special_price_override_mode', 'special_price_override_percent',
];
const TRADE_IN_DISCOUNT_COLUMNS = ['special_price_override_discount_percent', 'special_price_override_discount_amount'];

/**
 * Each available item's advertised trade-in price — the product page's "Own
 * gold or silver? … pay as little as ___" — by product id (owner pick 7,
 * 2026-11-21: picking the item on a trade fills it). The same precedence the
 * product page uses (`resolveAdvertisedTradeInPrice`), shown only where that
 * page shows it (the melt-value callout on) and only when it is below the
 * asking price. Any read problem simply means no prefill.
 */
async function loadTradeInPrices(spotData: SpotData | null): Promise<Record<string, number>> {
  const service = createServiceClient();
  const read = (columns: string[]) =>
    service.from('products').select(columns.join(', ')).in('status', ['available', 'Available']);
  let { data, error } = await read([...TRADE_IN_COLUMNS, ...TRADE_IN_DISCOUNT_COLUMNS]);
  // The two "off the asking price" columns arrived with their own SQL (2026-10-31): read without them if missing.
  if (error) ({ data, error } = await read(TRADE_IN_COLUMNS));
  if (error || !data) return {};
  const siteDefault = await fetchSpecialPriceDefault(createPublicClient()).catch(() => null);
  const prices: Record<string, number> = {};
  for (const row of data as unknown as Product[]) {
    if (!shouldShowSpotPrice(row)) continue;
    const melt = calcSpotMeltValue(row, spotData);
    const asking = getProductPriceValue(row, spotData);
    const price = resolveAdvertisedTradeInPrice(row, melt, siteDefault, asking);
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    if (asking != null && price >= asking) continue;
    prices[row.id] = Math.round(price * 100) / 100;
  }
  return prices;
}

/**
 * Admin → Instant Sale → Trade-in sale (owner, 2026-11-21, option C mockup 1):
 * the buy receipt for the gold the customer trades and the sale of what they
 * buy, on one screen with one save. Both records name each other.
 */
export default async function AdminTradeInSalePage({ params }: Props) {
  const { locale } = await params;
  const page = await loadInstantSalePage(locale, { products: true });
  const tradeInPrices = await loadTradeInPrices(page.spotData);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader adminBasePath={page.adminBasePath} active="instant-sale" unreadMessagesCount={page.unreadMessagesCount} userEmail={page.userEmail} />
      <main className="px-4 md:px-8 py-8">
        <div className="mx-auto max-w-[1360px]">
          <div className="mb-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
              <Link href={`${page.adminBasePath}/instant-sale`} className="underline-offset-2 hover:underline">Instant Sale</Link> › Trade-in
            </p>
            <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              Trade-in Sale
            </h1>
            <p className="mt-2 text-sm max-w-3xl" style={{ color: 'var(--color-on-surface-variant)' }}>
              Left: the buy receipt for the gold, exactly as you fill it in on Buy Receipts. Right: what they are buying.
              The difference works itself out, and one save records both — each receipt names the other.
            </p>
          </div>
          <TradeInSaleForm
            adminBasePath={page.adminBasePath}
            nowIso={new Date().toISOString()}
            products={page.products}
            spotData={page.spotData}
            tradeInPrices={tradeInPrices}
          />
        </div>
      </main>
    </div>
  );
}
