'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import AdminModal from '@/components/admin/AdminModal';
import {
  THUMBPRINT_WATCH_EVERY_MS,
  THUMBPRINT_WATCH_GIVE_UP_MS,
  isPrintPicture,
  pickFreshPrint,
  type WatchedFile,
} from '@/lib/buy-receipt-thumbprint';
import { prepareThumbprint } from './buy-receipt-client';

/**
 * The "Seller thumbprint" strip, under the ID photo strip (owner mockup
 * 2026-10-06). Screen only (`no-print`): it is a control, not part of the
 * receipt — the print itself is drawn on the shop copy by `BuyReceiptSheet`.
 *
 * "Wait for a print" WATCHES one folder on this computer. The owner captures in
 * SecuGen's free utility and saves the picture there (File → Save Image (BMP));
 * the newest file saved after the button was pressed is attached by itself and
 * then removed from the folder, so prints do not pile up on the laptop. Chrome
 * asks for the folder once and remembers it. "Choose a file" does the same by
 * hand and is all a browser without folder access (the iPad) is offered.
 *
 * Like the ID photo strip it only hands the picture to its parent: "hold it
 * until the receipt is saved" or "upload now" is the parent's business.
 */

type PrintFileHandle = { kind: 'file'; name: string; getFile: () => Promise<File> };
type PrintFolderEntry = PrintFileHandle | { kind: 'directory'; name: string };
type FolderPermission = { mode: 'readwrite' };

/** The part of a browser folder handle this strip uses. */
export type PrintFolder = {
  name: string;
  values: () => AsyncIterable<PrintFolderEntry>;
  removeEntry: (name: string) => Promise<void>;
  queryPermission?: (options: FolderPermission) => Promise<PermissionState>;
  requestPermission?: (options: FolderPermission) => Promise<PermissionState>;
};

type FolderPicker = (options: { id: string; mode: 'readwrite' }) => Promise<PrintFolder>;

const FOLDER_DB = 'nej-buy-receipts';
const FOLDER_STORE = 'folders';
const FOLDER_KEY = 'thumbprint';
/** A saved file that will not open as a picture is tried this many times (it may still be being written). */
const UNREADABLE_TRIES = 4;

function folderPicker(): FolderPicker | null {
  if (typeof window === 'undefined') return null;
  const picker = (window as unknown as { showDirectoryPicker?: FolderPicker }).showDirectoryPicker;
  return typeof picker === 'function' ? picker.bind(window) : null;
}

/** The folder chosen last time lives in this browser's own database; a folder handle cannot go in localStorage. */
function folderStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const open = window.indexedDB.open(FOLDER_DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(FOLDER_STORE);
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        try {
          const request = run(open.result.transaction(FOLDER_STORE, mode).objectStore(FOLDER_STORE));
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * The folder to watch: the remembered one when Chrome still lets us in (it may
 * ask again after a restart), otherwise the folder picker. Null when the owner
 * closed the picker. `fresh` skips the remembered folder ("Change folder").
 */
async function openPrintFolder(fresh: boolean): Promise<PrintFolder | null> {
  const picker = folderPicker();
  if (!picker) return null;
  if (!fresh) {
    const remembered = await folderStore<PrintFolder>('readonly', (store) => store.get(FOLDER_KEY));
    if (remembered) {
      try {
        let state = (await remembered.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
        if (state !== 'granted') state = (await remembered.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
        if (state === 'granted') return remembered;
      } catch {
        // The folder was moved or deleted: ask for one again.
      }
    }
  }
  try {
    const folder = await picker({ id: 'nej-thumbprints', mode: 'readwrite' });
    await folderStore('readwrite', (store) => store.put(folder, FOLDER_KEY));
    return folder;
  } catch {
    // The picker was closed.
    return null;
  }
}

const noSubscription = () => () => undefined;

export default function ThumbprintField({
  previewUrl,
  busy = false,
  note,
  onPick,
  onRemove,
  folderSource,
}: {
  /** What to show: an object URL for a print not uploaded yet, or a signed link. */
  previewUrl: string | null;
  busy?: boolean;
  /** A line under the title, e.g. an upload error. */
  note?: { text: string; ok: boolean } | null;
  onPick: (print: Blob) => void;
  onRemove: () => void;
  /** Where the folder comes from. Left out everywhere: the browser's own folder picker. */
  folderSource?: (fresh: boolean) => Promise<PrintFolder | null>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [watch, setWatch] = useState<{ folder: PrintFolder; since: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Known only in the browser; the server's HTML offers "Choose a file" alone.
  const canWatch = useSyncExternalStore(noSubscription, () => Boolean(folderSource) || folderPicker() !== null, () => false);

  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  const has = Boolean(previewUrl);
  const working = busy || preparing || opening;
  const waiting = watch !== null;

  async function startWaiting(fresh = false) {
    if (working) return;
    setProblem(null);
    setOpening(true);
    // Only a file saved from this moment on is this seller's print.
    const since = Date.now();
    const folder = await (folderSource ?? openPrintFolder)(fresh);
    setOpening(false);
    if (folder) setWatch({ folder, since });
  }

  useEffect(() => {
    if (!watch) return;
    let cancelled = false;
    let looking = false;
    let sizes: Record<string, number> = {};
    let unreadable = 0;

    const stop = (message: string | null) => {
      if (cancelled) return;
      if (message) setProblem(message);
      setWatch(null);
    };

    const look = async () => {
      if (cancelled || looking) return;
      looking = true;
      try {
        if (Date.now() - watch.since > THUMBPRINT_WATCH_GIVE_UP_MS) {
          stop('Stopped waiting. Press "Wait for a print" when the seller is ready.');
          return;
        }
        const found: (WatchedFile & { file: File })[] = [];
        for await (const entry of watch.folder.values()) {
          if (entry.kind !== 'file' || !isPrintPicture(entry.name)) continue;
          // A file another program is still writing may refuse to open; it is seen on a later look.
          const file = await entry.getFile().catch(() => null);
          if (file) found.push({ name: entry.name, lastModified: file.lastModified, size: file.size, file });
        }
        const { ready, seen } = pickFreshPrint(found, watch.since, sizes);
        sizes = seen;
        const saved = ready ? found.find((item) => item.name === ready.name) : null;
        if (!saved || cancelled) return;

        let print: Blob;
        try {
          print = await prepareThumbprint(saved.file);
        } catch {
          unreadable += 1;
          if (unreadable >= UNREADABLE_TRIES) stop(`"${saved.name}" could not be read as a picture. Save the print again.`);
          return;
        }
        if (cancelled) return;
        onPickRef.current(print);
        // The form has the print now; a thumbprint left in a folder on the laptop helps nobody.
        await watch.folder.removeEntry(saved.name).catch(() => undefined);
        stop(null);
      } catch {
        stop('The folder can no longer be read. Press "Wait for a print" and choose it again.');
      } finally {
        looking = false;
      }
    };

    const timer = window.setInterval(() => void look(), THUMBPRINT_WATCH_EVERY_MS);
    // Coming back from the capture program's window: look at once, not on the next tick.
    const onReturn = () => {
      if (document.visibilityState === 'visible') void look();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [watch]);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setProblem(null);
    setPreparing(true);
    try {
      const print = await prepareThumbprint(file);
      setWatch(null);
      onPick(print);
    } catch {
      setProblem('That file is not a picture we can read. Try another one.');
    } finally {
      setPreparing(false);
    }
  }

  const buttonClass = 'border bg-white px-3 py-1.5 text-xs font-semibold';
  const buttonStyle = { borderColor: '#d5c697', color: '#735c00' } as const;
  const frame = { width: 54, height: 72, border: '1px solid #d5c697' } as const;

  const title = working && !waiting
    ? 'Working on the print…'
    : waiting
      ? 'Waiting for a print…'
      : has
        ? 'Seller thumbprint attached'
        : 'Seller thumbprint (optional)';
  const line = problem
    ? { text: problem, ok: false }
    : note ?? {
        text: watch
          ? `In the SecuGen window: File → Save Image (BMP), into "${watch.folder.name}". It will appear here by itself.`
          : "Kept with this receipt. Not printed on the seller's copy.",
        ok: true,
      };

  return (
    <div
      className="no-print mt-2 flex flex-wrap items-center gap-3 px-3 py-2.5"
      style={{ border: '1px dashed #d5c697', background: '#fbf9f2' }}
    >
      {has ? (
        <button type="button" onClick={() => setViewing(true)} aria-label="View the thumbprint" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl ?? ''} alt="Seller thumbprint" style={{ ...frame, objectFit: 'cover', display: 'block' }} />
        </button>
      ) : (
        <div className="flex shrink-0 items-center justify-center text-center text-[11px] leading-tight" style={{ ...frame, background: '#ffffff', color: '#746b5b' }}>
          {waiting ? '…' : 'No print'}
        </div>
      )}
      <div className="min-w-[150px] flex-1">
        <div className="text-[13px]" style={{ color: '#1a1c1c' }} role={waiting ? 'status' : undefined}>
          {waiting && <span aria-hidden="true" className="mr-1.5 inline-block rounded-full" style={{ width: 9, height: 9, background: '#3b6d11' }} />}
          {title}
        </div>
        <div className="text-[11.5px]" style={{ color: line.ok ? '#746b5b' : '#a32d2d' }} role={line.ok ? undefined : 'alert'}>
          {line.text}
          {waiting && !problem && (
            <>
              {' '}
              <button type="button" className="underline" disabled={working} onClick={() => void startWaiting(true)}>
                Change folder
              </button>
            </>
          )}
        </div>
      </div>
      {canWatch && (waiting ? (
        <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setWatch(null)}>
          Stop
        </button>
      ) : (
        <button type="button" className={buttonClass} style={buttonStyle} disabled={working} onClick={() => void startWaiting()}>
          {has ? 'Take again' : 'Wait for a print'}
        </button>
      ))}
      <button type="button" className={buttonClass} style={buttonStyle} disabled={working} onClick={() => fileRef.current?.click()}>
        Choose a file
      </button>
      {has && (
        <button type="button" className="text-xs underline" style={{ color: '#746b5b' }} disabled={working} onClick={onRemove}>
          Remove
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*,.bmp" className="hidden" onChange={onFile} />

      {viewing && previewUrl && (
        <AdminModal title="Seller thumbprint" onClose={() => setViewing(false)} maxWidth="max-w-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Seller thumbprint" className="mx-auto max-h-[75vh] w-auto max-w-full" style={{ imageRendering: 'auto' }} />
        </AdminModal>
      )}
    </div>
  );
}
