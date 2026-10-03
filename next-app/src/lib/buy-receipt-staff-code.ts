import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/**
 * The staff code for the buy receipt's customer input mode (owner, 2026-10-03):
 * it accepts an unfinished form, unlocks the Thank-you screen and lets staff
 * leave the mode.
 *
 * THE ONE PLACE it lives. Server-only on purpose — the tablet sends the digits
 * here to be checked, so the code is never in the page a customer is holding.
 * To change it, change this line and deploy.
 */
export const BUY_RECEIPT_STAFF_CODE = '2500';

export function isBuyReceiptStaffCode(input: unknown): boolean {
  const typed = typeof input === 'string' ? input.trim() : '';
  const expected = Buffer.from(BUY_RECEIPT_STAFF_CODE);
  const given = Buffer.from(typed);
  // timingSafeEqual needs equal lengths; a wrong length is simply a wrong code.
  return given.length === expected.length && timingSafeEqual(given, expected);
}
