'use client';

import { useEffect } from 'react';
import type { PageScanSource } from '@/lib/scan-sources';

/**
 * Counts one visit to a printed-code page (2026-10-31; /card, /kittcard) —
 * Admin → Insights. Sends `{ source }` to POST /api/scan once per browser tab:
 * a reload or the EN ↔ ES switch on the card does not count again. Sends
 * nothing about the visitor; renders nothing.
 */
export default function ScanBeacon({ source }: { source: PageScanSource }) {
  useEffect(() => {
    try {
      const key = `nej_scan_${source}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage blocked: count this load anyway.
    }
    const body = JSON.stringify({ source });
    try {
      if (navigator.sendBeacon?.('/api/scan', body)) return;
    } catch {
      // Fall through to fetch.
    }
    fetch('/api/scan', { method: 'POST', body, keepalive: true }).catch(() => {});
  }, [source]);

  return null;
}
