// Tax-exempt sales (owner, mockup v2 2026-10-27 + "build it all").
//
// Florida's 6% comes off a sale only when the store holds a FLORIDA resale or
// exemption certificate for the buyer. Three ways in:
//   - In-store sale / Remote sale: the owner ticks "Tax-exempt sale", takes one
//     photo of the certificate and the AI fills in the details — or ticks
//     "Customer showed me the physical certificate" and skips the photo.
//   - Website checkout: the buyer uploads the certificate, the AI reads it and
//     turns away anything that is obviously not a valid Florida certificate,
//     then the OWNER approves it from a text message. The buyer's checkout
//     updates on its own and they pay in the same sitting.
//   - A signed-in buyer who saved an approved certificate to their account
//     gets it applied at checkout until it expires.
//
// ⛔ The AI read is never the approval. A website exemption exists only after
// the owner pressed Approve, and the checkout server re-checks it at payment.
//
// This file is the pure half (no I/O): shapes, the AI prompt and how its answer
// is checked, the rules, and the words. Server code: `tax-exempt-server.ts`,
// `tax-exempt-ai.ts`. Imported by client components too — keep it free of
// server-only imports.

export const TAX_CERT_BUCKET = 'tax-certificates';

/** An approved website request stays usable this long (the buyer may close the page and come back). */
export const TAX_EXEMPT_APPROVAL_HOURS = 24;
/** The buyer is told to text the store if approval has not come in this many minutes. */
export const TAX_EXEMPT_TEXT_US_MINUTES = 10;
/** A saved certificate with no readable expiry is reused for at most this long after approval. */
export const TAX_EXEMPT_UNDATED_REUSE_DAYS = 365;
/** Uploads per buyer IP per hour (each one costs an AI read). */
export const TAX_EXEMPT_UPLOADS_PER_HOUR = 6;
/** Largest certificate file accepted (Netlify's request body tops out near 6 MB). */
export const TAX_CERT_MAX_BYTES = 5 * 1024 * 1024;
export const TAX_EXEMPT_DECLINE_MAX = 300;

export const STORE_TEXT_NUMBER = '(239) 404-8505';
export const STORE_TEXT_HREF = 'sms:+12394048505';

export const TAX_CERT_TYPES = ['resale', 'exemption'] as const;
export type TaxCertType = (typeof TAX_CERT_TYPES)[number];

export const TAX_CERT_TYPE_LABELS: Record<TaxCertType, { short: string; long: string; form: string; es: string }> = {
  resale: { short: 'Resale', long: 'Annual Resale Certificate', form: 'DR-13', es: 'Certificado anual de reventa' },
  exemption: { short: 'Exemption', long: "Consumer's Certificate of Exemption", form: 'DR-14', es: 'Certificado de exención del consumidor' },
};

export const TAX_EXEMPT_SOURCES = ['in_store', 'remote_sale', 'website'] as const;
export type TaxExemptSource = (typeof TAX_EXEMPT_SOURCES)[number];
export const TAX_EXEMPT_SOURCE_LABELS: Record<TaxExemptSource | 'account', string> = {
  in_store: 'In store',
  remote_sale: 'Remote sale',
  website: 'Website',
  account: 'Saved to the account',
};

export type TaxExemptRequestStatus = 'draft' | 'pending' | 'approved' | 'declined' | 'cancelled';

/** Quick reasons on the owner's Decline. */
export const TAX_EXEMPT_DECLINE_REASONS = [
  "We couldn't read the certificate clearly.",
  'The certificate has expired.',
  "The certificate number doesn't match the business name.",
] as const;

// ---------------------------------------------------------------------------
// What the AI reads
// ---------------------------------------------------------------------------

export type CertificateRead = {
  /** The model saw a sales-tax certificate at all. */
  isCertificate: boolean;
  /** Two capital letters of the issuing state, e.g. "FL". */
  issuingState: string | null;
  certType: TaxCertType | 'other' | null;
  businessName: string | null;
  certNumber: string | null;
  /** `YYYY-MM-DD`. */
  expiresOn: string | null;
  /** The model is sure of every character of the number. */
  numberClear: boolean;
};

export const EMPTY_CERTIFICATE_READ: CertificateRead = {
  isCertificate: false,
  issuingState: null,
  certType: null,
  businessName: null,
  certNumber: null,
  expiresOn: null,
  numberClear: false,
};

export const CERT_READ_PROMPT_VERSION = 'tax-cert-read-v1';

export const CERT_READ_SYSTEM_PROMPT = `You transcribe a sales tax exemption or resale certificate for a jewelry store in Florida. The store will only accept a certificate issued by the State of Florida, and a staff member checks your answer against the document before anything happens.

Transcribe only what is printed. Never guess: if a value is missing, cut off, blurred or you are not sure of every character, return null for that value. A wrong digit is worse than an empty value.

Respond with a single raw JSON object (no markdown, no commentary), shaped exactly:
{"isCertificate": boolean, "issuingState": string|null, "certType": string|null, "businessName": string|null, "certNumber": string|null, "expiresOn": string|null, "numberClear": boolean}

- isCertificate: true only if the document is a sales-tax resale certificate or a sales-tax exemption certificate.
- issuingState: the two-letter postal abbreviation of the STATE THAT ISSUED the certificate (the agency printed on it, e.g. "Florida Department of Revenue" = "FL"), not the business address.
- certType: "resale" for a Florida Annual Resale Certificate for Sales Tax (form DR-13); "exemption" for a Florida Consumer's Certificate of Exemption (form DR-14); "other" for any other kind of document or another state's certificate form.
- businessName: the business or organization name printed on it, normal capitalisation (not all capitals).
- certNumber: the certificate number exactly as printed, keeping its dashes (Florida resale numbers look like 78-8012345678-9).
- expiresOn: the expiration date as YYYY-MM-DD (Florida annual resale certificates expire December 31 of the year printed). Null if no expiry is printed.
- numberClear: true only if every character of certNumber is sharp and certain.

If the picture shows no certificate, or nothing on it can be read, return isCertificate false and every other value null (numberClear false).`;

function collapse(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s\-'’./&])(\p{L})/gu, (_m, lead: string, letter: string) => lead + letter.toUpperCase())
    .replace(/\b(Llc|Inc|Pa|Pllc|Ltd|Co)\b/g, (word) => (word === 'Llc' ? 'LLC' : word === 'Pllc' ? 'PLLC' : word === 'Pa' ? 'PA' : word));
}

function cleanName(value: unknown): string | null {
  const text = collapse(value);
  if (!text || !/\p{L}/u.test(text)) return null;
  return (/\p{Ll}/u.test(text) ? text : titleCase(text)).slice(0, 120);
}

/** Letters, digits and dashes only; 6–30 characters. */
export function cleanCertNumber(value: unknown): string | null {
  const text = collapse(value).toUpperCase().replace(/\s*-\s*/g, '-').replace(/[^A-Z0-9-]/g, '');
  const characters = text.replace(/-/g, '');
  if (characters.length < 6 || text.length > 30) return null;
  return text;
}

/** `YYYY-MM-DD` that is a real date, or null. */
export function cleanIsoDate(value: unknown): string | null {
  const text = collapse(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return text;
}

/** The model's reply as text → an object, or null. Tolerates a code fence or a sentence around the JSON. */
export function parseCertificateReadJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Whatever came back → a read the rules can trust the SHAPE of (never the truth of). */
export function coerceCertificateRead(raw: unknown): CertificateRead {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_CERTIFICATE_READ };
  const source = raw as Record<string, unknown>;
  const state = collapse(source.issuingState).toUpperCase();
  const type = collapse(source.certType).toLowerCase();
  const certNumber = cleanCertNumber(source.certNumber);
  return {
    isCertificate: source.isCertificate === true,
    issuingState: /^[A-Z]{2}$/.test(state) ? state : null,
    certType: type === 'resale' || type === 'exemption' ? type : type === 'other' ? 'other' : null,
    businessName: cleanName(source.businessName),
    certNumber,
    expiresOn: cleanIsoDate(source.expiresOn),
    numberClear: Boolean(certNumber) && source.numberClear === true,
  };
}

// ---------------------------------------------------------------------------
// The checks (run on the AI read before anything reaches the owner)
// ---------------------------------------------------------------------------

export type CertificateProblem = 'unreadable' | 'not_florida' | 'wrong_type' | 'expired';

export type CertificateChecks = {
  ok: boolean;
  problem: CertificateProblem | null;
  florida: boolean;
  typeOk: boolean;
  /** true = valid through a date on or after today; null = no date could be read. */
  current: boolean | null;
};

/** Today in Naples as `YYYY-MM-DD`. */
export function easternDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function checkCertificateRead(read: CertificateRead, now: Date = new Date()): CertificateChecks {
  const florida = read.issuingState === 'FL';
  const typeOk = read.certType === 'resale' || read.certType === 'exemption';
  const current = read.expiresOn ? read.expiresOn >= easternDateKey(now) : null;
  let problem: CertificateProblem | null = null;
  if (!read.isCertificate || (!read.issuingState && !read.certNumber)) problem = 'unreadable';
  else if (!florida) problem = 'not_florida';
  else if (!typeOk) problem = 'wrong_type';
  else if (current === false) problem = 'expired';
  return { ok: problem === null, problem, florida, typeOk, current };
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export function stateName(code: string | null | undefined): string | null {
  return code ? STATE_NAMES[code] ?? code : null;
}

/** The plain reason shown when a certificate cannot be used. */
export function certificateProblemMessage(problem: CertificateProblem, read: Pick<CertificateRead, 'issuingState'>, isEs = false): string {
  const state = stateName(read.issuingState);
  switch (problem) {
    case 'not_florida':
      return isEs
        ? `Este certificado es de ${state ?? 'otro estado'}. Florida solo acepta certificados emitidos por Florida, así que no podemos quitar el impuesto con este.`
        : `This is ${state ? `a ${state}` : 'an out-of-state'} certificate. Florida only accepts Florida-issued resale and exemption certificates, so we can't take the tax off with this one.`;
    case 'wrong_type':
      return isEs
        ? 'No parece un Certificado anual de reventa de Florida ni un Certificado de exención del consumidor de Florida.'
        : "This doesn't look like a Florida Annual Resale Certificate or a Florida Consumer's Certificate of Exemption.";
    case 'expired':
      return isEs
        ? 'Este certificado está vencido. Suba el certificado vigente.'
        : 'This certificate has expired. Please upload your current one.';
    default:
      return isEs
        ? 'No pudimos leer el certificado. Tome otra foto de la página completa, plana y con buena luz.'
        : "We couldn't read the certificate. Take another photo of the whole page, flat and in good light.";
  }
}

// ---------------------------------------------------------------------------
// The record kept on an order
// ---------------------------------------------------------------------------

export type TaxExemptSnapshot = {
  certificateId: string | null;
  certType: TaxCertType | null;
  businessName: string | null;
  certNumber: string | null;
  issuingState: 'FL';
  expiresOn: string | null;
  physicalCopySeen: boolean;
  photoPath: string | null;
  photoMime: string | null;
  flAuthNumber: string | null;
  approvedVia: TaxExemptSource | 'account';
  approvedAt: string;
  approvedBy: string | null;
  /** Website requests only: TX-1042. */
  requestRef: string | null;
  /** The Florida tax this sale would have carried. */
  taxNotCharged: number;
};

/** `TX-1042`. */
export function requestRefLabel(ref: number | string | null | undefined): string | null {
  return ref == null || ref === '' ? null : `TX-${ref}`;
}

/** "··6789": the last four letters/digits only. */
export function maskCertNumber(number: string | null | undefined): string {
  const characters = (number ?? '').replace(/[^A-Za-z0-9]/g, '');
  return characters.length >= 4 ? `··${characters.slice(-4)}` : '';
}

/** `2026-12-31` → `12/31/2026`. */
export function formatCertDate(iso: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return match ? `${match[2]}/${match[3]}/${match[1]}` : null;
}

/** "Resale ··6789" — the tax line's short tag. */
export function exemptShortTag(snapshot: Pick<TaxExemptSnapshot, 'certType' | 'certNumber'>): string {
  const type = snapshot.certType ? TAX_CERT_TYPE_LABELS[snapshot.certType].short : 'Certificate';
  const masked = maskCertNumber(snapshot.certNumber);
  return masked ? `${type} ${masked}` : type;
}

/** One line for receipts and emails: "Tax-exempt sale · Florida Annual Resale Certificate 78-80… · Coastal Jewelers LLC · valid through 12/31/2026". */
export function exemptReceiptLine(snapshot: TaxExemptSnapshot): string {
  const parts = [
    snapshot.certType ? `Florida ${TAX_CERT_TYPE_LABELS[snapshot.certType].long}` : 'Florida certificate',
    snapshot.certNumber,
    snapshot.businessName,
    snapshot.expiresOn ? `valid through ${formatCertDate(snapshot.expiresOn)}` : null,
    !snapshot.photoPath && snapshot.physicalCopySeen ? 'physical copy seen' : null,
  ].filter(Boolean);
  return `Tax-exempt sale · ${parts.join(' · ')}`;
}

/** Reads a stored snapshot back defensively (it is jsonb). */
export function parseTaxExemptSnapshot(raw: unknown): TaxExemptSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  const text = (key: string) => (typeof s[key] === 'string' && (s[key] as string).trim() ? (s[key] as string) : null);
  const type = text('certType');
  const via = text('approvedVia');
  return {
    certificateId: text('certificateId'),
    certType: type === 'resale' || type === 'exemption' ? type : null,
    businessName: text('businessName'),
    certNumber: text('certNumber'),
    issuingState: 'FL',
    expiresOn: text('expiresOn'),
    physicalCopySeen: s.physicalCopySeen === true,
    photoPath: text('photoPath'),
    photoMime: text('photoMime'),
    flAuthNumber: text('flAuthNumber'),
    approvedVia: via === 'in_store' || via === 'remote_sale' || via === 'website' || via === 'account' ? via : 'in_store',
    approvedAt: text('approvedAt') ?? '',
    approvedBy: text('approvedBy'),
    requestRef: text('requestRef'),
    taxNotCharged: Number.isFinite(Number(s.taxNotCharged)) ? Number(s.taxNotCharged) : 0,
  };
}

// ---------------------------------------------------------------------------
// Saved certificates
// ---------------------------------------------------------------------------

export type CertificateRow = {
  id: string;
  status: 'approved' | 'revoked';
  cert_type: TaxCertType | null;
  business_name: string | null;
  cert_number: string | null;
  expires_on: string | null;
  photo_path: string | null;
  photo_mime: string | null;
  physical_copy_seen: boolean;
  fl_auth_number: string | null;
  source: TaxExemptSource;
  request_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  user_id: string | null;
  saved_for_reuse: boolean;
  approved_by_email: string | null;
  approved_at: string;
  created_at: string;
};

export const CERTIFICATE_COLUMNS =
  'id, status, cert_type, business_name, cert_number, expires_on, photo_path, photo_mime, physical_copy_seen, fl_auth_number, source, request_id, customer_name, customer_email, customer_phone, user_id, saved_for_reuse, approved_by_email, approved_at, created_at';

/** The last day a certificate may be used: its printed expiry, else a year after approval. */
export function certificateUsableThrough(row: Pick<CertificateRow, 'expires_on' | 'approved_at'>): string {
  if (row.expires_on) return row.expires_on;
  const approved = new Date(row.approved_at);
  const base = Number.isNaN(approved.getTime()) ? new Date() : approved;
  return easternDateKey(new Date(base.getTime() + TAX_EXEMPT_UNDATED_REUSE_DAYS * 86_400_000));
}

export function certificateIsUsable(row: Pick<CertificateRow, 'status' | 'expires_on' | 'approved_at'>, now: Date = new Date()): boolean {
  return row.status === 'approved' && certificateUsableThrough(row) >= easternDateKey(now);
}

export function snapshotFromCertificate(
  row: CertificateRow,
  options: { approvedVia: TaxExemptSnapshot['approvedVia']; taxNotCharged: number; approvedBy?: string | null; requestRef?: string | null; now?: Date },
): TaxExemptSnapshot {
  return {
    certificateId: row.id,
    certType: row.cert_type,
    businessName: row.business_name,
    certNumber: row.cert_number,
    issuingState: 'FL',
    expiresOn: row.expires_on,
    physicalCopySeen: row.physical_copy_seen,
    photoPath: row.photo_path,
    photoMime: row.photo_mime,
    flAuthNumber: row.fl_auth_number,
    approvedVia: options.approvedVia,
    approvedAt: (options.now ?? new Date()).toISOString(),
    approvedBy: options.approvedBy ?? row.approved_by_email ?? null,
    requestRef: options.requestRef ?? null,
    taxNotCharged: Math.max(0, Math.round(options.taxNotCharged * 100) / 100),
  };
}

/** "Coastal Jewelers LLC · Resale ··6789 · valid through 12/31/2026" — the picker's line. */
export function certificateSummary(row: Pick<CertificateRow, 'business_name' | 'cert_type' | 'cert_number' | 'expires_on'>): string {
  return [
    row.business_name ?? 'Name not recorded',
    exemptShortTag({ certType: row.cert_type, certNumber: row.cert_number }),
    row.expires_on ? `valid through ${formatCertDate(row.expires_on)}` : null,
  ].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Instant Sale's "Tax-exempt sale" box → a validated choice (pure half)
// ---------------------------------------------------------------------------

export type TaxExemptSaleChoice =
  | { kind: 'on_file'; certificateId: string }
  | {
    kind: 'new';
    certType: TaxCertType | null;
    businessName: string | null;
    certNumber: string | null;
    expiresOn: string | null;
    photoPath: string | null;
    photoMime: string | null;
    physicalCopySeen: boolean;
    flAuthNumber: string | null;
    saveForNextTime: boolean;
  };

/** `certificates/<uuid>.webp|pdf` — the only paths the admin box may point at. */
export function isAdminCertificatePath(path: string): boolean {
  return /^certificates\/[0-9a-f-]{36}\.(webp|pdf)$/i.test(path);
}

/** `requests/<uuid>.webp|pdf` — a website upload. */
export function isRequestCertificatePath(path: string): boolean {
  return /^requests\/[0-9a-f-]{36}\.(webp|pdf)$/i.test(path);
}

function optionalText(value: unknown, max: number): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

/**
 * The box's payload → a choice, or why it cannot be recorded. Absent or
 * `enabled: false` → null (an ordinary taxed sale).
 *
 * A new certificate needs a photo OR the owner's "physical copy seen" tick
 * (owner, 2026-10-27: "allow bypass of the photo, info fill"). With a photo the
 * name and number are required (the AI fills them; the owner can type them).
 * With only the physical copy the details are optional — the order still
 * records who saw it and when.
 */
export function normalizeTaxExemptSaleInput(raw: unknown, now: Date = new Date()): { value: TaxExemptSaleChoice | null } | { error: string } {
  if (!raw || typeof raw !== 'object') return { value: null };
  const source = raw as Record<string, unknown>;
  if (source.enabled !== true) return { value: null };

  const certificateId = String(source.certificateId ?? '').trim();
  if (certificateId) {
    if (!/^[0-9a-f-]{36}$/i.test(certificateId)) return { error: 'Pick the certificate on file again.' };
    return { value: { kind: 'on_file', certificateId } };
  }

  const photoPath = String(source.photoPath ?? '').trim() || null;
  if (photoPath && !isAdminCertificatePath(photoPath)) return { error: 'The certificate photo did not upload. Take it again.' };
  const physicalCopySeen = source.physicalCopySeen === true;
  if (!photoPath && !physicalCopySeen) {
    return { error: 'Tax-exempt sale: take a photo of the certificate, or tick "Customer showed me the physical certificate".' };
  }
  if (String(source.aiState ?? '').toUpperCase().match(/^[A-Z]{2}$/) && String(source.aiState).toUpperCase() !== 'FL') {
    return { error: 'Tax-exempt sale: that is not a Florida certificate. Florida only accepts Florida-issued certificates.' };
  }

  const type = String(source.certType ?? '');
  const certType = type === 'resale' || type === 'exemption' ? type : null;
  const businessName = optionalText(source.businessName, 120);
  const numberText = optionalText(source.certNumber, 40);
  const certNumber = numberText ? cleanCertNumber(numberText) : null;
  if (numberText && !certNumber) return { error: 'Tax-exempt sale: the certificate number does not look right (letters, digits and dashes).' };
  const expiresText = optionalText(source.expiresOn, 10);
  const expiresOn = expiresText ? cleanIsoDate(expiresText) : null;
  if (expiresText && !expiresOn) return { error: 'Tax-exempt sale: the expiry date does not look right.' };
  if (expiresOn && expiresOn < easternDateKey(now)) return { error: 'Tax-exempt sale: that certificate has expired.' };

  if (photoPath && (!businessName || !certNumber)) {
    return { error: 'Tax-exempt sale: fill in the name and the certificate number (or retake the photo).' };
  }
  return {
    value: {
      kind: 'new',
      certType,
      businessName,
      certNumber,
      expiresOn,
      photoPath,
      photoMime: photoPath ? (photoPath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/webp') : null,
      physicalCopySeen,
      flAuthNumber: optionalText(source.flAuthNumber, 40),
      saveForNextTime: source.saveForNextTime !== false,
    },
  };
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The text to the owner's cell when a website buyer is waiting. */
export function ownerApprovalTextBody(input: {
  ref: string;
  businessName: string | null;
  certType: TaxCertType | null;
  certNumber: string | null;
  expiresOn: string | null;
  cartTotal: number | null;
  tax: number | null;
  customerName: string | null;
  customerPhone: string | null;
  url: string;
}): string {
  const cert = [
    input.businessName ?? 'Business name not read',
    `FL ${input.certType ? TAX_CERT_TYPE_LABELS[input.certType].short.toLowerCase() : 'certificate'} ${maskCertNumber(input.certNumber)}`.trim(),
    input.expiresOn ? `valid to ${formatCertDate(input.expiresOn)}` : 'no expiry read',
  ].join(', ');
  const cart = input.cartTotal != null
    ? ` Cart ${money(input.cartTotal)}${input.tax != null ? `, tax ${money(input.tax)}` : ''}.`
    : '';
  const buyer = [input.customerName, input.customerPhone].filter(Boolean).join(' ');
  return `Tax-exempt approval needed (${input.ref}): ${cert} (AI checks passed).${cart} Buyer is waiting at checkout${buyer ? `: ${buyer}` : ''}. ${input.url}`;
}

/** "Opens at 11 AM" from `HH:MM`. */
export function opensAtLabel(hhmm: string | null, isEs = false): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '');
  if (!match) return null;
  const h24 = Number(match[1]);
  const minutes = Number(match[2]);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = isEs ? (h24 >= 12 ? 'p.m.' : 'a.m.') : h24 >= 12 ? 'PM' : 'AM';
  return `${h12}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''} ${suffix}`;
}
