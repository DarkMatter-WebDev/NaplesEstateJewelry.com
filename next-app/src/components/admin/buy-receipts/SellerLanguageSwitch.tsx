'use client';

import { BUY_RECEIPT_LANGUAGES, type BuyReceiptLanguage } from '@/lib/buy-receipt-language';

/**
 * "Seller's copy: English / Español" (owner, 2026-11-19, mockup 1) — under the
 * paper on the New receipt form and while editing a saved receipt. Starts on
 * English. Español prints the seller's copy (and the emailed copy) in Spanish
 * and adds the Spanish statement under the English one on the shop copy; the
 * choice is saved with the receipt, so a reprint from the Log matches.
 *
 * Two of the site's own buttons (gold = picked), so hover, press and focus
 * behave like every other button. Screen only: the action rows never print.
 */
export default function SellerLanguageSwitch({
  value,
  onChange,
  disabled,
}: {
  value: BuyReceiptLanguage;
  onChange: (language: BuyReceiptLanguage) => void;
  disabled?: boolean;
}) {
  return (
    <div className="brs-act-lang flex items-center gap-2" role="radiogroup" aria-label="Seller's copy language">
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
        Seller&rsquo;s copy
      </span>
      <span className="brs-lang-buttons flex gap-1">
        {BUY_RECEIPT_LANGUAGES.map((language) => {
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
              title={language === 'es' ? "Print the seller's copy in Spanish" : "Print the seller's copy in English"}
              onClick={() => onChange(language)}
            >
              {language === 'es' ? 'Español' : 'English'}
            </button>
          );
        })}
      </span>
    </div>
  );
}
