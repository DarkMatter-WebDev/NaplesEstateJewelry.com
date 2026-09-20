import Link from 'next/link';
import { AppIcon } from '@/components/AppIcon';
import TextUsLink from '@/components/cta/TextUsLink';
import { addressWithLandmark, streetLine } from '@/lib/business-location';

// Product-page trust layer (owner request 2026-08-04, modeled on the
// mels-treasures.com review): three compact policy accordions plus a
// three-badge trust strip. Server-rendered — the accordions are native
// <details>/<summary>, so they work with no client JS and cost nothing at
// hydration. Policy specifics deliberately stay short summaries with links to
// the full /shipping and /returns-refunds pages, so this component never
// becomes a second copy of policy text that can drift.
//
// The two halves are separate exports because the two-column product layout
// places them differently: the accordions stay in the info column beside the
// gallery, while the badge strip spans the full page width below both columns
// (2026-08-04 vertical-space restructure).

type Props = {
  isEs: boolean;
  /** Locale path prefix ('' or '/es'). */
  prefix: string;
  /**
   * Admin-editable hours sentence (`hoursLine(schedule, isEs)`), formatted by
   * the product page so both exports read the schedule exactly once.
   */
  pickupHoursLine: string;
};

export function ProductPolicyAccordions({ isEs, prefix, pickupHoursLine }: Props) {
  const accordions: Array<{ id: string; title: string; body: React.ReactNode }> = [
    {
      id: 'shipping-returns',
      title: isEs ? 'Envíos y devoluciones' : 'Shipping & Returns',
      body: (
        <>
          <p>
            {isEs
              ? 'Cada pedido enviado viaja totalmente asegurado con confirmación de firma — las tarifas según el valor se muestran al pagar, y los pedidos de $5,000+ se envían por USPS Registered Mail, el servicio más seguro del Servicio Postal. ¿Prefiere evitar el envío? La recogida local es gratuita en ' + addressWithLandmark(true) + ', ' + pickupHoursLine + '.'
              : 'Every shipped order travels fully insured with signature confirmation — value-based rates are shown at checkout, and orders of $5,000+ ship USPS Registered Mail, the most secure service the Postal Service offers. Prefer to skip shipping entirely? Local pickup is free at ' + addressWithLandmark(false) + ', ' + pickupHoursLine + '.'}
          </p>
          <p className="mt-2">
            {isEs ? 'Detalles completos: ' : 'Full details: '}
            <Link href={`${prefix}/shipping`} className="product-trust-link">
              {isEs ? 'Política de envíos' : 'Shipping Policy'}
            </Link>
            {' · '}
            <Link href={`${prefix}/returns-refunds`} className="product-trust-link">
              {isEs ? 'Devoluciones y reembolsos' : 'Returns & Refunds'}
            </Link>
          </p>
        </>
      ),
    },
    {
      id: 'condition-wear',
      title: isEs ? 'Condición y desgaste' : 'Condition & Wear',
      body: (
        <p>
          {isEs
            ? 'Casi todo lo que vendemos es joyería de patrimonio con una vida anterior. El desgaste superficial ligero, los sellos suavizados y la pátina natural no son defectos — son el carácter que hace especiales estas piezas. Cualquier detalle específico de la condición de esta pieza se indica en la descripción anterior, y cada artículo se inspecciona antes de publicarse y nuevamente antes de enviarse.'
            : "Nearly everything we sell is estate jewelry with a past life. Light surface wear, softened hallmarks, and natural patina aren't flaws — they're the character that makes these pieces special. Anything specific to this piece's condition is noted in the description above, and every item is inspected before listing and again before it ships."}
        </p>
      ),
    },
    {
      id: 'payment-options',
      title: isEs ? 'Opciones de pago' : 'Payment Options',
      body: (
        <p>
          {isEs ? (
            <>
              El pago funciona con PayPal — pague de forma segura con cualquier tarjeta de crédito o débito
              o con su saldo de PayPal; no se requiere cuenta. En compras que califiquen, PayPal Pay Later
              puede dividir su pago en cuotas, directamente al pagar. ¿Compra en persona? La recogida local
              es gratuita en {streetLine()} — llame o{' '}
              <TextUsLink isEs icon={false} className="product-trust-link">envíe un mensaje</TextUsLink> al{' '}
              <a href="tel:2394048505" className="product-trust-link">(239) 404-8505</a>.
            </>
          ) : (
            <>
              Checkout is powered by PayPal — pay securely with any major credit or debit card or your
              PayPal balance; no account required. On qualifying purchases, PayPal Pay Later can split your
              payment into installments, right in checkout. Buying in person? Local pickup is free at
              {' '}{streetLine()} — call or{' '}
              <TextUsLink isEs={false} icon={false} className="product-trust-link">text</TextUsLink>{' '}
              <a href="tel:2394048505" className="product-trust-link">(239) 404-8505</a>.
            </>
          )}
        </p>
      ),
    },
  ];

  return (
    <div className="border-t pt-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
      <div className="flex flex-col">
        {accordions.map((section) => (
          <details key={section.id} className="product-trust-accordion">
            <summary>
              <span
                className="text-[0.6875rem] font-bold uppercase tracking-[0.2em]"
                style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
              >
                {section.title}
              </span>
              <AppIcon name="expand_more" className="product-trust-chevron" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
            </summary>
            <div className="product-trust-body text-sm leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
              {section.body}
            </div>
          </details>
        ))}
      </div>

      <style>{`
        .product-trust-accordion {
          border-bottom: 1px solid var(--color-outline-variant);
        }
        /* NO border-top on the first accordion. The wrapper above already draws
           one (border-t pt-4), so a rule here put two parallel lines 17px apart
           at the top of the group — visible at every width, removed 2026-08-14.
           If the wrapper ever loses its border, restore this one instead of
           adding a second. */
        .product-trust-accordion > summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.8rem 0.15rem;
          cursor: pointer;
          list-style: none;
        }
        .product-trust-accordion > summary::-webkit-details-marker {
          display: none;
        }
        .product-trust-chevron {
          flex-shrink: 0;
          transition: transform 200ms ease;
        }
        .product-trust-accordion[open] .product-trust-chevron {
          transform: rotate(180deg);
        }
        .product-trust-body {
          padding: 0 0.15rem 0.9rem;
        }
        .product-trust-link {
          color: var(--color-primary);
          font-weight: 700;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        /* Below 640px the page is one column and the trust badges beneath these
           accordions stack into a centered column, so the accordions centre to
           match (owner request 2026-08-04). 640px is deliberately the same
           breakpoint the badge grid uses — if that grid's breakpoint moves, move
           this one with it or the two bands stop agreeing.
           The title and chevron centre together as a pair rather than the title
           centring while the chevron stays pinned right, which would read as an
           accident rather than a centered layout. */
        @media (max-width: 639.98px) {
          .product-trust-accordion > summary {
            justify-content: center;
          }
          .product-trust-body {
            text-align: center;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .product-trust-chevron {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}

// The "why buy from us" band. Rendered full-width beneath the two product
// columns, so its three badges stay on one row instead of stacking inside a
// half-width column.
export function ProductTrustBadges({ isEs, pickupHoursLine }: Pick<Props, 'isEs' | 'pickupHoursLine'>) {
  const badges = [
    {
      icon: 'recycling',
      title: isEs ? 'Origen sostenible' : 'Sustainably Sourced',
      text: isEs
        ? 'Piezas de patrimonio salvadas de la fundición y con una nueva vida.'
        : 'Estate pieces saved from the melting pot and given a new life.',
    },
    {
      icon: 'verified_user',
      title: isEs ? 'Envío totalmente asegurado' : 'Fully Insured Shipping',
      text: isEs
        ? 'Asegurado por el valor total con firma a la entrega.'
        : 'Insured for full value with signature on delivery.',
    },
    {
      icon: 'location_on',
      title: isEs ? 'Recogida local en Naples' : 'Local Pickup in Naples',
      // Names the place. Said only "the Naples area" until 2026-08-17.
      text: isEs
        ? `Gratis en ${streetLine()}, ${pickupHoursLine}.`
        : `Free at ${streetLine()}, ${pickupHoursLine}.`,
    },
  ] as const;

  return (
    // The generous mt/pt is deliberate (owner request 2026-08-04): both product
    // columns end just above this band, so it needs clear blank space before the
    // badges rather than butting straight up against the accordions or the spec
    // table.
    <div className="product-trust-badges mt-12 border-t pt-8 mb-10 grid gap-4 sm:grid-cols-3" style={{ borderColor: 'var(--color-outline-variant)' }}>
      {badges.map((badge) => (
        // Centered at every width. Alignment used to flip to left-anchored below
        // `sm`, which is exactly where the three badges stack into a column and
        // a centered stack reads best (owner request 2026-08-04).
        <div key={badge.icon} className="flex flex-col items-center gap-2 text-center">
          <span
            // `product-trust-badge-icon` is a styling hook only: globals.css
            // shrinks the disc when this strip is compacted under the gallery at
            // 2000px+. The h-9/w-9 utilities remain the default everywhere else.
            className="product-trust-badge-icon flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: 'rgba(212, 175, 55, 0.14)', color: 'var(--color-primary)' }}
          >
            <AppIcon name={badge.icon} style={{ fontSize: '18px' }} />
          </span>
          <p
            className="text-[0.68rem] font-bold uppercase tracking-[0.14em]"
            style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-label)' }}
          >
            {badge.title}
          </p>
          <p className="text-xs leading-snug" style={{ color: 'var(--color-on-surface-variant)' }}>
            {badge.text}
          </p>
        </div>
      ))}
    </div>
  );
}
