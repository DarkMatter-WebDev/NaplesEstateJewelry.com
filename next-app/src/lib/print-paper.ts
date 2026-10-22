// Print one paper document (the one-page receipt, `order-receipt-paper.ts`)
// from the current page through a hidden frame (2026-10-21).
//
// A frame, not `window.open`: "Record & print receipt" prints AFTER the sale is
// saved, and a window opened after an `await` is blocked as a pop-up. The
// frame takes the page's origin as its base, so the logo and photo paths load
// the same way they do on the page.
import { waitForImages } from '@/lib/print-images';

export async function printPaperInFrame(documentHtml: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Off-screen but laid out at letter content width, so images load and the layout is real.
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;height:1056px;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  try {
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc) throw new Error('The print frame did not open.');
    doc.open();
    doc.write(documentHtml.replace('<head>', `<head><base href="${window.location.origin}/">`));
    doc.close();
    await waitForImages(Array.from(doc.images), win);
    await new Promise<void>((resolve) => win.setTimeout(resolve, 50));
    win.focus();
    win.print();
  } finally {
    // print() blocks until the dialog closes in Chrome; Safari returns at once, so keep the frame a moment.
    window.setTimeout(() => frame.remove(), 60_000);
  }
}
