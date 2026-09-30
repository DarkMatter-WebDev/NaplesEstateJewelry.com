// Waiting for a document's images before `print()` — shared by the order
// invoice pop-up and the buy-receipt printer (moved out of PrintInvoiceClient
// 2026-09-30, behaviour unchanged). `window.print()` fired before an image has
// decoded prints an empty box where the logo or photo should be.

export const PRINT_ASSET_TIMEOUT_MS = 8_000;

/**
 * Resolves when each of these images has loaded (or failed), or after 8 s.
 * Pass the images of the thing being printed, not every image on the page: a
 * lazy image further down an admin page never loads and would stall the print
 * for the whole timeout.
 */
export async function waitForImages(images: readonly HTMLImageElement[], timerHost: Window = window): Promise<void> {
  if (images.length === 0) return;

  const imageReady = (image: HTMLImageElement) =>
    new Promise<void>((resolve) => {
      if (image.complete) {
        resolve();
        return;
      }

      const finish = () => resolve();
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
    }).then(async () => {
      if (image.naturalWidth > 0 && typeof image.decode === 'function') {
        await image.decode().catch(() => undefined);
      }
    });

  await Promise.race([
    Promise.all(images.map(imageReady)),
    new Promise<void>((resolve) => timerHost.setTimeout(resolve, PRINT_ASSET_TIMEOUT_MS)),
  ]);
}

/** Resolves when every `<img>` in the window has loaded (or failed), or after 8 s. */
export function waitForPrintImages(printWindow: Window): Promise<void> {
  return waitForImages(Array.from(printWindow.document.images), printWindow);
}

/** One short beat so the freshly written document has laid out. */
export function waitForPrintLayout(printWindow: Window): Promise<void> {
  return new Promise<void>((resolve) => printWindow.setTimeout(resolve, 50));
}
