/**
 * Shared, PURE definitions for the two lead-form fields added 2026-09-08 at
 * the owner's request: "Where are you located?" and "How should we contact
 * you?". Used by the public forms (labels, options), the API routes
 * (validation + display strings for the email / message center), and the
 * admin inquiries panel (chips).
 *
 * Why they exist: the owner was getting evaluation requests from outside
 * Southwest Florida with no way to tell before calling, and submissions with
 * BOTH a phone and an email with no hint of which the sender wanted used.
 *
 * Storage (supabase/inquiries-location-contact-2026-09.sql):
 *   inquiries.location_area     — one of LOCATION_AREA_VALUES
 *   inquiries.location_detail   — free text, only for the two "elsewhere /
 *                                 outside" areas (city & state)
 *   inquiries.preferred_contact — one of PREFERRED_CONTACT_VALUES
 */

export const LOCATION_AREA_VALUES = [
  'naples',
  'marco-island',
  'bonita-springs',
  'estero',
  'fort-myers',
  'cape-coral',
  'swfl-other',
  'outside-swfl',
] as const;
export type LocationArea = (typeof LOCATION_AREA_VALUES)[number];

export const PREFERRED_CONTACT_VALUES = ['call', 'text', 'email'] as const;
export type PreferredContact = (typeof PREFERRED_CONTACT_VALUES)[number];

const LOCATION_LABELS: Record<LocationArea, { en: string; es: string }> = {
  naples: { en: 'Naples', es: 'Naples' },
  'marco-island': { en: 'Marco Island', es: 'Marco Island' },
  'bonita-springs': { en: 'Bonita Springs', es: 'Bonita Springs' },
  estero: { en: 'Estero', es: 'Estero' },
  'fort-myers': { en: 'Fort Myers', es: 'Fort Myers' },
  'cape-coral': { en: 'Cape Coral', es: 'Cape Coral' },
  'swfl-other': { en: 'Elsewhere in Southwest Florida', es: 'Otro lugar del suroeste de Florida' },
  'outside-swfl': { en: 'Outside Southwest Florida', es: 'Fuera del suroeste de Florida' },
};

const CONTACT_LABELS: Record<PreferredContact, { en: string; es: string }> = {
  // Spanish kept to one word each so three pills fit one row at 375px.
  call: { en: 'Call', es: 'Llamada' },
  text: { en: 'Text', es: 'Texto' },
  email: { en: 'Email', es: 'Correo' },
};

export function locationAreaLabel(area: LocationArea, isEs: boolean): string {
  return LOCATION_LABELS[area][isEs ? 'es' : 'en'];
}

export function preferredContactLabel(value: PreferredContact, isEs: boolean): string {
  return CONTACT_LABELS[value][isEs ? 'es' : 'en'];
}

/** Options in the order the select shows them (service area first, then the two catch-alls). */
export function locationAreaOptions(isEs: boolean): Array<{ value: LocationArea; label: string }> {
  return LOCATION_AREA_VALUES.map((value) => ({ value, label: locationAreaLabel(value, isEs) }));
}

export function preferredContactOptions(isEs: boolean): Array<{ value: PreferredContact; label: string }> {
  return PREFERRED_CONTACT_VALUES.map((value) => ({ value, label: preferredContactLabel(value, isEs) }));
}

/** The two areas that reveal the "City & state" line and the out-of-area note. */
export function locationNeedsDetail(area: LocationArea | null | undefined): boolean {
  return area === 'swfl-other' || area === 'outside-swfl';
}

/** Only "Outside Southwest Florida" is flagged red in Admin; "Elsewhere in SWFL" is still local. */
export function isOutsideServiceArea(area: LocationArea | null | undefined): boolean {
  return area === 'outside-swfl';
}

export function parseLocationArea(raw: unknown): LocationArea | null {
  const value = String(raw ?? '').trim().toLowerCase();
  return (LOCATION_AREA_VALUES as readonly string[]).includes(value) ? (value as LocationArea) : null;
}

export function parsePreferredContact(raw: unknown): PreferredContact | null {
  const value = String(raw ?? '').trim().toLowerCase();
  return (PREFERRED_CONTACT_VALUES as readonly string[]).includes(value) ? (value as PreferredContact) : null;
}

export const MAX_LOCATION_DETAIL = 120;

/** Free text is only kept for the two areas that ask for it; otherwise it is dropped. */
export function parseLocationDetail(raw: unknown, area: LocationArea | null): string | null {
  if (!locationNeedsDetail(area)) return null;
  const value = String(raw ?? '').trim().slice(0, MAX_LOCATION_DETAIL);
  return value || null;
}

/**
 * One human string for the email, the message center and the admin chip:
 * "Naples" · "Outside Southwest Florida — Sarasota, FL" · "Elsewhere in
 * Southwest Florida". Returns null when nothing was recorded (older rows).
 */
export function formatLocation(
  area: LocationArea | null | undefined,
  detail: string | null | undefined,
  isEs = false,
): string | null {
  if (!area) return null;
  const label = locationAreaLabel(area, isEs);
  const extra = detail?.trim();
  return extra ? `${label} — ${extra}` : label;
}

/**
 * The seller picked Email as the way to reach them but left the email box
 * empty. Forms show this as an inline error on the email field; the API
 * answers it with a visible 400 (never a silent drop — a real person made a
 * fixable mistake).
 */
export function preferredContactNeedsEmail(preferred: PreferredContact | null, email: string | null | undefined): boolean {
  return preferred === 'email' && !(email ?? '').trim();
}

export function preferredContactEmailErrorMessage(isEs: boolean): string {
  return isEs
    ? 'Ingrese su correo electrónico, o elija Llamada o Texto.'
    : 'Please enter your email address, or choose Call or Text.';
}

/** Lines appended to the plain-text message-center body (text-only surface). */
export function inquiryPreferenceLines(
  area: LocationArea | null | undefined,
  detail: string | null | undefined,
  preferred: PreferredContact | null | undefined,
): string[] {
  const lines: string[] = [];
  const location = formatLocation(area, detail);
  if (location) lines.push(`Location: ${location}`);
  if (preferred) lines.push(`Preferred contact: ${preferredContactLabel(preferred, false)}`);
  return lines;
}

/** Subject-line suffix so the preference reads from the inbox list: " · prefers Text · Naples". */
export function inquirySubjectSuffix(
  area: LocationArea | null | undefined,
  detail: string | null | undefined,
  preferred: PreferredContact | null | undefined,
): string {
  const parts: string[] = [];
  if (preferred) parts.push(`prefers ${preferredContactLabel(preferred, false)}`);
  const location = formatLocation(area, detail);
  if (location) parts.push(location);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

/**
 * The note under "City & state". "Outside Southwest Florida" gets its own
 * plain wording (2026-11-09, owner-approved mockup 1, option A — note only, no
 * required tick): we evaluate in person, so photos alone usually can't give an
 * out-of-area seller an evaluation. "Elsewhere in SWFL" keeps the older note —
 * those sellers are still local.
 */
export function outOfAreaNote(isEs: boolean, area?: LocationArea | null): string {
  if (isOutsideServiceArea(area)) {
    return isEs
      ? 'Evaluamos y compramos en persona — en nuestro salón de Naples o en hogares de todo el suroeste de Florida — así que normalmente no podemos dar una evaluación solo con fotos a vendedores fuera de la zona. Si va a visitar Naples, díganos cuándo y con gusto le atenderemos entonces.'
      : "We evaluate and buy in person — at our Naples showroom, or in homes across Southwest Florida — so we usually can't give an evaluation from photos alone for sellers outside the area. If you'll be visiting Naples, tell us when and we'd be glad to see you then.";
  }
  return isEs
    ? 'Compramos en persona en la zona de Naples y Fort Myers. Si está más lejos, díganos dónde se encuentra y le diremos si podemos ayudarle.'
    : "We buy in person in the Naples and Fort Myers area. If you're farther away, tell us where you are and we'll let you know whether we can help.";
}
