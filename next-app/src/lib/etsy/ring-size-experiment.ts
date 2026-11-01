import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureFreshAccessToken } from './auth';
import {
  EtsyApiError,
  fetchTaxonomyProperties,
  getListingProperties,
  updateListingProperty,
  type EtsyListingPropertyValue,
  type EtsyTaxonomyProperty,
} from './client';
import { type EtsyListingRow } from './store';

// Ring size (2026-07-08, session 9 — owner request to generalize the
// wearable-length work in length-experiment.ts to other categories).
// Genuinely different from Length: Etsy's "Ring size" property is a real
// ENUMERATED chart (230 possible_values confirmed live for taxonomy 1240,
// e.g. "7", "7 1/4", "7 1/2", "7 3/4" — fraction notation, not decimals),
// each scoped to a region scale (US/CA, UK/AU, FR, DE). Unlike Length, there
// is no empty-possible_values case to work around here — every standard
// size already has a real, discoverable value_id, so this NEVER needs the
// empty-string placeholder trick. If a given decimal size has no matching
// possible_value (an unusual size, or a fraction Etsy doesn't chart), this
// reports unsupported for that value rather than guessing or falling back
// to anything — same "never fabricate" discipline as everywhere else in
// this sync.
//
// CONFIRMED WORKING live 2026-07-08 (session 9): size 10.5 -> "10 1/2" ->
// matched real value_id 1604 in the US/CA chart -> written -> read back
// and independently verified correct (property "Ring size", scale "US/CA",
// value "10 1/2", parses back to exactly 10.5). Ran against a listing whose
// category was a manually-overridden taxonomy leaf ("Multi-Stone Rings"),
// not the automatic ETSY_TAXONOMY_MAP guess — a stronger proof that the
// dynamic discovery genuinely resolves against whatever taxonomy_id a
// listing actually has, not just the pinned default.
//
// Source data: `products.length` — the SAME shared field Bracelet/Necklace
// length uses, stored as a bare decimal for a ring (e.g. "7.5"), never
// Etsy's `item_length` (package/shipping dimension — not referenced here).
// Never calls updateListingInventory: Ring size is not a buyer-selectable
// variation for a single, one-of-a-kind ring listing, even though Etsy's
// schema allows it to be used that way for sellers offering multiple sizes.
//
// Same hard rules as length-experiment.ts: no hardcoded property/scale/value
// ids (all resolved live from fetchTaxonomyProperties every time), every
// write is read back and verified, a mismatch is a FAILED result.

export interface RingSizePropertyMatch {
  propertyId: number;
  propertyName: string;
  usScaleId: number;
  /** Already filtered to the US/CA scale — a UK/AU-scoped "7" is a different physical size and a different value_id. */
  possibleValues: { valueId: number; name: string }[];
}

/**
 * Finds the Ring size attribute in a LIVE property list, scoped to the
 * US/CA scale (this business's market). Requires supports_attributes (never
 * updateListingInventory here). A property with no US/CA-ish scale is
 * treated as unsupported rather than resolved against a different region's
 * chart.
 */
export function findRingSizeProperty(properties: EtsyTaxonomyProperty[]): RingSizePropertyMatch | null {
  const candidate = properties.find((property) => property.supportsAttributes && /ring\s*size/i.test(property.name));
  if (!candidate) return null;

  const usScale = candidate.scales.find((scale) => /^us/i.test(scale.displayName.trim()));
  if (!usScale) return null;

  return {
    propertyId: candidate.propertyId,
    propertyName: candidate.displayName || candidate.name,
    usScaleId: usScale.scaleId,
    possibleValues: candidate.possibleValues.filter((value) => value.scaleId === usScale.scaleId),
  };
}

/**
 * Etsy's ring size chart uses fraction notation ("7 1/2", "7 1/4"), not
 * decimals. Rounds to the nearest quarter size (standard ring-size
 * increment) — a size that isn't cleanly a quarter (e.g. an unusual 7.1)
 * rounds to the closest real one rather than failing outright, since ring
 * sizing is inherently an approximation at the sub-quarter level; the
 * downstream possible_values match is still exact-string, so this can never
 * silently invent a value id, only pick which existing chart entry to look
 * up.
 */
export function decimalToRingSizeFraction(size: number): string {
  const rounded = Math.round(size * 4) / 4;
  const whole = Math.floor(rounded + 1e-9);
  const quarter = Math.round((rounded - whole) * 4);
  if (quarter <= 0) return String(whole);
  if (quarter >= 4) return String(whole + 1);
  const fractionLabel = { 1: '1/4', 2: '1/2', 3: '3/4' }[quarter];
  return `${whole} ${fractionLabel}`;
}

/** Inverse of decimalToRingSizeFraction, for verifying Etsy's read-back. Returns null for anything it doesn't recognize (e.g. "000"/"00") — never guessed, just unparsable. */
function ringSizeFractionToDecimal(name: string): number | null {
  const trimmed = name.trim();
  const wholeAndFraction = trimmed.match(/^(\d+)\s+(1\/4|1\/2|3\/4)$/);
  if (wholeAndFraction) {
    const fractionValue: Record<string, number> = { '1/4': 0.25, '1/2': 0.5, '3/4': 0.75 };
    return Number(wholeAndFraction[1]) + fractionValue[wholeAndFraction[2]];
  }
  const wholeOnly = trimmed.match(/^(\d+)$/);
  return wholeOnly ? Number(wholeOnly[1]) : null;
}

/** A bare decimal ring size (e.g. "7.5") or the defensive "Size: 7"/"size 7" form — mirrors types/product.ts's normalizeProductLengthSizeValue, which is where this same source field's ring-size format is already documented. A range or free text never matches. */
export function parseRingSize(length: string | null | undefined): number | null {
  const trimmed = length?.trim() ?? '';
  if (!trimmed) return null;
  const bare = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return Number(bare[1]);
  const prefixed = trimmed.match(/^size\s*:?\s*(\d+(?:\.\d+)?)$/i);
  if (prefixed) return Number(prefixed[1]);
  return null;
}

export interface RingSizePropertyPayload {
  propertyId: number;
  valueIds: number[];
  values: string[];
  scaleId: number;
}

/**
 * Builds the write payload — ONLY from a real, matched possible_values
 * entry. Returns null (never a placeholder, never a guess) when the target
 * size has no exact match in Etsy's own US/CA chart; unlike Length, there is
 * no known-safe fallback mechanism for an enumerated property, so an
 * unmatched size is reported as unsupported for that value rather than
 * attempted.
 */
export function buildRingSizePayload(match: RingSizePropertyMatch, size: number): RingSizePropertyPayload | null {
  const target = decimalToRingSizeFraction(size).toLowerCase();
  const matchedValue = match.possibleValues.find((value) => value.name.trim().toLowerCase() === target);
  if (!matchedValue) return null;
  return {
    propertyId: match.propertyId,
    valueIds: [matchedValue.valueId],
    values: [matchedValue.name],
    scaleId: match.usScaleId,
  };
}

export interface RingSizeVerification {
  ok: boolean;
  reason?: string;
}

/** Fails closed: anything ambiguous is a mismatch, never assumed fine — same standard that would have caught the "Gray" incident had it applied here. */
export function verifyRingSizeReadback(readback: EtsyListingPropertyValue, expectedSize: number): RingSizeVerification {
  if (readback.propertyName && !/ring\s*size/i.test(readback.propertyName)) {
    return { ok: false, reason: `Etsy returned property name "${readback.propertyName}", not Ring size.` };
  }
  if (readback.scaleName && !/^us/i.test(readback.scaleName.trim())) {
    return { ok: false, reason: `Etsy returned scale "${readback.scaleName}", not US/CA.` };
  }
  if (readback.values.length === 0) {
    return { ok: false, reason: 'Etsy returned no value for this property.' };
  }
  const parsed = ringSizeFractionToDecimal(readback.values[0]);
  if (parsed == null || Math.abs(parsed - expectedSize) > 0.01) {
    return { ok: false, reason: `Etsy stored "${readback.values.join(', ')}" — expected size ${expectedSize}.` };
  }
  return { ok: true };
}

export interface RingSizeExperimentResult {
  attempted: boolean;
  success: boolean;
  message: string;
  detail?: {
    propertyId: number;
    scaleId: number;
    valueIds: number[];
    values: string[];
    readback: EtsyListingPropertyValue;
  };
}

/**
 * Core write-then-verify cycle, called from the regular sync pipeline
 * (sync.ts, ON by default unless ETSY_SYNC_RING_SIZE=false). The dry-run
 * preview shows the size that WILL be pushed (via parseRingSize +
 * decimalToRingSizeFraction below); this does the actual
 * discover→write→read-back→verify at sync time, returning success:false on
 * any mismatch so the caller surfaces a warning rather than trusting Etsy's
 * HTTP 200. Was originally also reachable from a manual admin "Test Ring
 * Size" button (removed session 9, ninth addendum, once ring size
 * auto-synced and the preview replaced it).
 */
export async function attemptRingSizeSync(params: {
  service: SupabaseClient;
  listing: EtsyListingRow;
  size: number;
}): Promise<RingSizeExperimentResult> {
  const listingId = params.listing.etsy_listing_id;
  if (!listingId) {
    return { attempted: false, success: false, message: 'This product has no linked Etsy listing yet — sync it first.' };
  }
  const taxonomyId = params.listing.taxonomy_override_id ?? params.listing.taxonomy_id;
  if (!taxonomyId) {
    return { attempted: false, success: false, message: 'No taxonomy id recorded for this listing yet — sync it first.' };
  }

  const { accessToken, shopId } = await ensureFreshAccessToken(params.service);
  const properties = await fetchTaxonomyProperties(taxonomyId);
  const match = findRingSizeProperty(properties);
  if (!match) {
    return {
      attempted: false,
      success: false,
      message: `No Ring size attribute (with a US/CA scale) found on this category's live property list (taxonomy ${taxonomyId}) — Ring size stays unsupported.`,
    };
  }

  const payload = buildRingSizePayload(match, params.size);
  if (!payload) {
    const fractionLabel = decimalToRingSizeFraction(params.size);
    return {
      attempted: false,
      success: false,
      message: `Size ${params.size} ("${fractionLabel}") has no matching entry in Etsy's US/CA ring size chart — never guessed, left unsupported for this value.`,
    };
  }

  // Write and read-back are deliberately separate try/catches — a write
  // failure leaves the listing untouched; a read-back failure means the
  // write may have gone through and is simply unconfirmed, a meaningfully
  // more serious and different case (see length-experiment.ts's session 8
  // incident with the same shape).
  try {
    await updateListingProperty({
      shopId,
      listingId,
      accessToken,
      propertyId: payload.propertyId,
      valueIds: payload.valueIds,
      values: payload.values,
      scaleId: payload.scaleId,
    });
  } catch (err) {
    const message = err instanceof EtsyApiError ? err.operatorMessage : err instanceof Error ? err.message : 'Write failed.';
    return { attempted: true, success: false, message: `Write failed — nothing was changed on Etsy. ${message}` };
  }

  let allProperties: EtsyListingPropertyValue[];
  try {
    allProperties = await getListingProperties({ shopId, listingId, accessToken });
  } catch (err) {
    const message = err instanceof EtsyApiError ? err.operatorMessage : err instanceof Error ? err.message : 'Read-back failed.';
    return {
      attempted: true,
      success: false,
      message: `Etsy accepted the write, but reading it back to verify failed — this is NOT the same as a confirmed success. Do not assume Etsy stored the right value. ${message}`,
    };
  }

  const readback = allProperties.find((property) => property.propertyId === payload.propertyId) ?? {
    propertyId: payload.propertyId,
    propertyName: null,
    scaleId: null,
    scaleName: null,
    valueIds: [],
    values: [],
  };
  const verification = verifyRingSizeReadback(readback, params.size);

  return {
    attempted: true,
    success: verification.ok,
    message: verification.ok
      ? `Verified — Etsy's "${match.propertyName}" property now reads ${readback.values.join(', ')} (${readback.scaleName ?? 'US/CA'}).`
      : `Etsy returned success for the write, but the read-back did not match — treating this as FAILED. Do not trust what Etsy now shows for this property. ${verification.reason}`,
    detail: { propertyId: payload.propertyId, scaleId: payload.scaleId, valueIds: payload.valueIds, values: payload.values, readback },
  };
}

