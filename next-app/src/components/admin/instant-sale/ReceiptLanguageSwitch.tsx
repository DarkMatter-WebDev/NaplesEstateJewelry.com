'use client';

import { ORDER_LANGUAGES, orderLanguageName, type OrderLanguage } from '@/lib/order-language';

/**
 * "Receipt language: English / Español" (owner, 2026-11-21, Spanish receipts
 * mockup 1) — on In-store sale and Remote sale, by Email copy. Starts on
 * English (pick 3). Español sends the customer's emails and prints the
 * customer's paper in Spanish; it is saved on the order, so the order page,
 * every later email and every reprint follow it (`lib/order-language.ts`).
 *
 * Two of the site's own buttons (gold = picked), like the buy receipt's
 * "Seller's copy" switch, so hover, press and focus behave like every other button.
 */
export default function ReceiptLanguageSwitch({
  value,
  onChange,
  disabled,
  label = 'Receipt language',
}: {
  value: OrderLanguage;
  onChange: (language: OrderLanguage) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
      <span className="text-xs font-semibold" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      <span className="flex gap-1">
        {ORDER_LANGUAGES.map((language) => {
          const on = value === language;
          return (
            <button
              key={language}
              type="button"
              role="radio"
              aria-checked={on}
              lang={language}
              className={`${on ? 'gold-button' : 'outline-button'} text-xs`}
              disabled={disabled}
              title={language === 'es' ? "The customer's receipt and emails in Spanish" : "The customer's receipt and emails in English"}
              onClick={() => onChange(language)}
            >
              {orderLanguageName(language)}
            </button>
          );
        })}
      </span>
    </div>
  );
}
