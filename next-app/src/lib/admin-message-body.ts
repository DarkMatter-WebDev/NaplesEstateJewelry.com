/**
 * Split an admin message-center body (admin_notifications.body) into the
 * labelled lines the owner reads in the notification EMAIL — Phone, Location,
 * Preferred contact, Source, Appointment — and the customer's own words.
 *
 * Display-only (2026-11-08): bodies are still stored as plain text exactly as
 * before, so every existing message gets the new layout and nothing is
 * migrated. The stored shapes this reads are built in:
 *   - `app/api/contact-message/route.ts` — [Appointment requested:…, Note:…, ''],
 *     [message, ''], Phone:…, Location:…, Preferred contact:…, Source:…
 *   - `app/api/inquire/route.ts` — message, '', Phone:…, Location:…,
 *     Preferred contact:…, Source:…
 *   - `lib/admin-notify.ts` fallback — …, '', 'Photos:', url, url (only when the
 *     image_urls column was missing)
 *
 * ⛔ Deliberately strict. A label is only lifted out of the text when it sits in
 * the block those builders write — the LAST paragraph for Phone/Location/
 * Preferred contact/Source (and only if EVERY line of it is one of those), the
 * FIRST paragraph for Appointment/Note (only if it starts with "Appointment
 * requested:"). So a customer typing "Note: …" or "Phone: …" inside their own
 * message keeps it in their message, and order / bounce notices ("Reach them by
 * phone instead: …", "Reason reported: …") stay whole sentences.
 */

export type MessageFieldKey = 'phone' | 'location' | 'preferredContact' | 'source' | 'appointment' | 'appointmentNote';

export interface ParsedMessageBody {
  /** Labelled values found in the builder blocks, in stored order. */
  fields: Partial<Record<MessageFieldKey, string>>;
  /** Everything else, with its line breaks kept and blank edges trimmed. */
  text: string;
  /** Photo URLs recovered from the legacy "Photos:" fallback block. */
  photoUrls: string[];
}

const TRAILING_LABELS: Record<string, MessageFieldKey> = {
  phone: 'phone',
  location: 'location',
  'preferred contact': 'preferredContact',
  source: 'source',
};

const LEADING_LABELS: Record<string, MessageFieldKey> = {
  'appointment requested': 'appointment',
  note: 'appointmentNote',
};

const LABEL_LINE = /^([A-Za-z][A-Za-z ]{0,30}):\s*(.+)$/;

function matchLabel(line: string, labels: Record<string, MessageFieldKey>): [MessageFieldKey, string] | null {
  const m = LABEL_LINE.exec(line.trim());
  if (!m) return null;
  const key = labels[m[1].trim().toLowerCase()];
  return key ? [key, m[2].trim()] : null;
}

/** Index of the last / first blank line, or -1. */
function lastBlank(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) if (!lines[i].trim()) return i;
  return -1;
}
function firstBlank(lines: string[]): number {
  return lines.findIndex((line) => !line.trim());
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

export function parseMessageBody(body: string | null | undefined): ParsedMessageBody {
  const fields: ParsedMessageBody['fields'] = {};
  const photoUrls: string[] = [];
  let lines = trimBlankEdges(String(body ?? '').replace(/\r\n?/g, '\n').split('\n'));

  // 1. Legacy photo fallback: a final "Photos:" paragraph of URLs.
  {
    const cut = lastBlank(lines);
    const block = lines.slice(cut + 1);
    if (
      block.length >= 2 &&
      block[0].trim().toLowerCase() === 'photos:' &&
      block.slice(1).every((line) => /^https?:\/\/\S+$/.test(line.trim()))
    ) {
      photoUrls.push(...block.slice(1).map((line) => line.trim()));
      lines = trimBlankEdges(lines.slice(0, Math.max(cut, 0)));
    }
  }

  // 2. Trailing contact block: every line must be a known trailing label.
  {
    const cut = lastBlank(lines);
    const block = lines.slice(cut + 1);
    const matched = block.map((line) => matchLabel(line, TRAILING_LABELS));
    if (block.length > 0 && matched.every(Boolean)) {
      for (const [key, value] of matched as [MessageFieldKey, string][]) fields[key] = value;
      lines = cut >= 0 ? trimBlankEdges(lines.slice(0, cut)) : [];
    }
  }

  // 3. Leading appointment block: starts with "Appointment requested:".
  {
    const cut = firstBlank(lines);
    const block = cut >= 0 ? lines.slice(0, cut) : lines;
    const matched = block.map((line) => matchLabel(line, LEADING_LABELS));
    if (matched[0]?.[0] === 'appointment' && matched.every(Boolean)) {
      for (const [key, value] of matched as [MessageFieldKey, string][]) fields[key] = value;
      lines = cut >= 0 ? trimBlankEdges(lines.slice(cut)) : [];
    }
  }

  return { fields, text: lines.join('\n'), photoUrls };
}

/** Digits for a tel: link, or null when there are too few to dial. */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null;
}

/** The note line is stored with its own trailing full stop; shown under the appointment. */
export function cleanAppointmentNote(note: string): string {
  return note.replace(/\.\s*$/, '');
}
