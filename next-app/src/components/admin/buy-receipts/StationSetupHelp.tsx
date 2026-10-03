'use client';

import { useState } from 'react';
import { stationShortcutTarget } from '@/lib/buy-receipts';
import { copyTextToClipboard } from '@/lib/clipboard';
import { getSiteUrl } from '@/lib/order-email-branding';

/**
 * How to make the printer PC print with no dialog — shown on the station page
 * itself, so the owner does not have to find it in the docs (2026-09-30: the
 * desktop was still showing the print dialog).
 *
 * Silent printing is a Chrome start-up switch, not something a web page can
 * turn on. The page only ever calls `window.print()`; Chrome started with
 * `--kiosk-printing` sends that straight to the Windows default printer.
 *
 * The text to paste is built in `lib/buy-receipts.ts` (`stationShortcutTarget`),
 * where its length is pinned by a test: Windows keeps 259 characters.
 */
export default function StationSetupHelp({ open = false }: { open?: boolean }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const target = stationShortcutTarget(getSiteUrl());

  async function copy() {
    setCopied((await copyTextToClipboard(target)) ? 'yes' : 'no');
    window.setTimeout(() => setCopied(null), 2500);
  }

  return (
    <details open={open} className="border bg-white px-4 py-3 text-sm" style={{ borderColor: 'var(--color-outline-variant)' }}>
      <summary className="cursor-pointer font-semibold" style={{ color: 'var(--color-primary)' }}>
        Set up printing with no dialog (one time, on the printer PC)
      </summary>
      <ol className="mt-3 grid list-decimal gap-2 pl-5" style={{ color: 'var(--color-on-surface)' }}>
        <li>
          In Windows, make the receipt printer the <strong>default printer</strong>, with Letter paper. Chrome prints silently only to
          the default printer; if the default is &ldquo;Microsoft Print to PDF&rdquo; or there is none, a dialog appears.
        </li>
        <li>
          Right-click the desktop → New → Shortcut, and paste this as the location (one line):
          <textarea
            readOnly
            className="form-field mt-2 font-mono text-[12px]"
            rows={4}
            value={target}
            aria-label="Shortcut target"
            onFocus={(event) => event.target.select()}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="outline-button text-xs" onClick={() => void copy()}>
              Copy
            </button>
            {copied === 'yes' && <span className="text-xs" style={{ color: 'var(--color-primary)' }}>Copied.</span>}
            {copied === 'no' && <span className="text-xs" style={{ color: 'var(--color-error)' }}>Could not copy — select the text and copy it.</span>}
          </div>
        </li>
        <li>
          Open the shortcut. It starts a <strong>separate</strong> Chrome (its own profile) — sign in once there, click
          <strong> Use this computer as the print station</strong>, then <strong>Test print</strong>.
        </li>
        <li>
          ⛔ Always open the station from that shortcut. Opened in the everyday Chrome, or if that separate Chrome was already running
          without the switch, the print dialog comes back. Close the station window fully before opening it again.
        </li>
      </ol>
    </details>
  );
}
