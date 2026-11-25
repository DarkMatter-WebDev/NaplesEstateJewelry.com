// `/magnet` as its own landing page (owner, 2026-11-23, mockup 4 "C1"): the
// truck photo, a short hello from Chris, Free Evaluation / Call / Text, and a
// small directory — built like /card (components/magnet/MagnetLanding.tsx).
//
// The page is only worth showing with the owner's REAL truck on it (never a
// stock or generated truck), so the switch is this one value:
//
// - `MAGNET_TRUCK_PHOTO = null`: /magnet answers as it did before the page —
//   the proxy hands it to /api/magnet, which counts the scan and 302s to
//   /free-evaluation (lib/magnet-redirect.ts) — and /magnet, /es/magnet as a
//   page answer 404.
// - Set to the photo (since 2026-11-24, the owner's photo, truck mockup 4 "A
//   at 117 px"): the proxy lets /magnet through to the page, the page counts
//   the scan itself (ScanBeacon, source 'magnet'), and /api/magnet is no
//   longer reached from the printed code.
//
// The photo: `public/assets/images/pages/`, WebP (check the encode really is
// WebP — AGENTS.md), longest edge ≤ 2048px, a NEW file name for any later
// photo. Shown as a 10:3 strip (MagnetLanding.tsx) — the file is already cut
// to 10:3, so nothing more is cropped; `position` only matters for a file that
// is not.
//
// Imported by the edge proxy: keep it free of imports and server-only code.

export type MagnetTruckPhoto = {
  src: string;
  /** Intrinsic pixel size of the file. */
  width: number;
  height: number;
  /** CSS object-position for the 10:3 crop, e.g. '50% 60%'. */
  position: string;
};

/** The strip's shape, width / height — `aspect-[10/3]` in MagnetLanding.tsx. */
export const MAGNET_TRUCK_STRIP_RATIO = 10 / 3;

// The owner's photo (2026-11-24, new photo with room at the sides), cut to the
// full width at 10:3 with the truck a little low in the frame (truck mockups
// 1–4). A later photo gets a NEW file name (CDN + image cache).
export const MAGNET_TRUCK_PHOTO: MagnetTruckPhoto | null = {
  src: '/assets/images/pages/magnet-truck-v1.webp',
  width: 1522,
  height: 457,
  position: '50% 50%',
};

/** Whether /magnet shows the landing page (true) or still 302s to /free-evaluation (false). */
export const MAGNET_LANDING_LIVE = MAGNET_TRUCK_PHOTO !== null;

/** The page's own path (the locale-free address printed on the magnets). */
export const MAGNET_LANDING_PATH = '/magnet';

/** Where the directory starts — the "more below" arrow glides here. */
export const MAGNET_DIRECTORY_ID = 'magnet-directory';
