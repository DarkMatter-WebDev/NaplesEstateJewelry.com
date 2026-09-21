// How many photos one lead-form submission carries, and the words the forms use
// to say so. Plain constants and strings — no browser or server APIs — so the
// two forms AND the two routes import the same number.
//
// Why (2026-09-20, owner's phone test): `/api/inquire` kept the first 10 photos
// and `/api/contact-message` only the first 6, and neither form said a word —
// 11 photos sent from the contact page arrived as 6, 12 from the free-appraisal
// page as 10. Owner: "allow 10 from both but notify the customer of that cap,
// and alert them in red that only the first 10 will send."
//
// ⛔ The cap is never applied silently: the form states it before a photo is
// picked, and says in red when more were picked than will be sent. Change the
// number here only — ten 1024px photos is also what the request-size budget in
// `lead-photo-prep.ts` is tiered for.

export const LEAD_PHOTO_MAX = 10;

export function isOverLeadPhotoCap(selected: number): boolean {
  return selected > LEAD_PHOTO_MAX;
}

/** The first `LEAD_PHOTO_MAX` entries, in the order the customer picked them. */
export function capLeadPhotos<T>(files: readonly T[]): T[] {
  return files.slice(0, LEAD_PHOTO_MAX);
}

/** Short tail for a form's helper line: "up to 10 photos". */
export function leadPhotoCapHint(isEs: boolean): string {
  return isEs ? `hasta ${LEAD_PHOTO_MAX} fotos` : `up to ${LEAD_PHOTO_MAX} photos`;
}

/** "3 photos selected" — the normal count line under the picker. */
export function leadPhotoCountLabel(isEs: boolean, selected: number): string {
  if (isEs) return `${selected} ${selected === 1 ? 'foto seleccionada' : 'fotos seleccionadas'}`;
  return `${selected} ${selected === 1 ? 'photo selected' : 'photos selected'}`;
}

/** The red line shown instead, when more were picked than will be sent. */
export function leadPhotoOverCapMessage(isEs: boolean, selected: number): string {
  return isEs
    ? `Seleccionó ${selected} fotos. Solo se enviarán las primeras ${LEAD_PHOTO_MAX}.`
    : `You selected ${selected} photos. Only the first ${LEAD_PHOTO_MAX} will be sent.`;
}
