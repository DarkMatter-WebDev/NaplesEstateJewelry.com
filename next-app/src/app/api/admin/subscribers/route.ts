import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { isValidEmail, normalizeEmail } from '@/lib/marketing';
import {
  ADMIN_SMS_CONSENT_LABEL,
  ADMIN_SMS_CONSENT_TEXT,
  formatUsPhone,
  normalizeUsPhone,
  type SmsStatus,
} from '@/lib/subscriber-phone';
import { sendConfirmation, type ConfirmationResult } from '@/lib/text-alerts/confirmations';

// Sending the "reply YES" text calls Twilio.
export const runtime = 'nodejs';

/** Twilio's "this number replied STOP to us" error: nothing reaches it until the customer texts START. */
const TWILIO_UNSUBSCRIBED_CODE = 21610;

function stoppedMessage(phone: string) {
  const textNumber = formatUsPhone(process.env.TWILIO_FROM_NUMBER?.trim()) || 'our text-deals number';
  return `${formatUsPhone(phone)} texted STOP earlier, so it can't be added from here. Ask them to text START to ${textNumber}. That puts them back on the list.`;
}

/**
 * Add Subscriber: an email, a mobile number for text deals, or both (the
 * number since 2026-11-02 — customers who ask the shop to add them).
 *
 * An email-only add is the original upsert, unchanged. A number goes through
 * the same `subscribe_homepage_v2` as the website, so an existing row is
 * matched by email or number instead of duplicated, and then gets the same
 * "reply YES" text: ⛔ only numbers that answered YES are ever sent deals.
 * A number that texted STOP is refused — only the customer can undo a STOP.
 */
export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
  const rawPhone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const phone = normalizeUsPhone(rawPhone);
  const smsConsent = body?.smsConsent === true;

  if (email && !isValidEmail(email)) {
    return NextResponse.json({ error: 'A valid subscriber email is required.' }, { status: 400 });
  }
  if (rawPhone && !phone) {
    return NextResponse.json({ error: 'A valid US mobile number is required.' }, { status: 400 });
  }
  if (!email && !phone) {
    return NextResponse.json({ error: 'Enter an email or a mobile number.' }, { status: 400 });
  }
  if (phone && !smsConsent) {
    return NextResponse.json({ error: `Tick "${ADMIN_SMS_CONSENT_LABEL}" to add the number.` }, { status: 400 });
  }

  if (phone) return addTextSubscriber({ email: email || null, fullName, phone });

  try {
    const supabase = createServiceClient();
    const { error: upsertError } = await supabase
      .from('homepage_subscribers')
      .upsert({
        email,
        full_name: fullName || null,
        source: 'admin_manual',
        locale: 'en',
        subscribed: true,
        subscribed_at: new Date().toISOString(),
        consent_at: new Date().toISOString(),
        unsubscribed_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' });

    if (upsertError) throw upsertError;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not add subscriber.' },
      { status: 500 }
    );
  }
}

async function addTextSubscriber(input: { email: string | null; fullName: string; phone: string }) {
  try {
    const supabase = createServiceClient();
    const { data: existing, error: lookupError } = await supabase
      .from('homepage_subscribers')
      .select('sms_status')
      .eq('phone_e164', input.phone)
      .maybeSingle<{ sms_status: SmsStatus | null }>();
    if (lookupError) throw lookupError;
    if (existing?.sms_status === 'stopped') {
      return NextResponse.json({ error: stoppedMessage(input.phone) }, { status: 409 });
    }

    const { data, error: rpcError } = await supabase.rpc('subscribe_homepage_v2', {
      subscriber_email: input.email,
      subscriber_name: input.fullName || null,
      subscriber_locale: 'en',
      subscriber_phone: input.phone,
      subscriber_sms_consent: true,
      subscriber_sms_consent_text: ADMIN_SMS_CONSENT_TEXT,
      subscriber_sms_consent_version: null,
      subscriber_source: 'admin_manual',
    });
    if (rpcError) throw rpcError;

    const row = Array.isArray(data) ? data[0] : data;
    // The number already belongs to a DIFFERENT entry (another email): the
    // function leaves it there and saves only the email.
    if (row?.phone_saved === false) {
      return NextResponse.json({ success: true, phoneSaved: false, smsStatus: null, confirmation: null });
    }

    const smsStatus: SmsStatus = row?.sms_status ?? 'pending';
    let confirmation: ConfirmationResult['outcome'] | null = null;
    let confirmationError: string | null = null;
    if (smsStatus === 'pending') {
      // Awaited, as on the website; a failure never undoes the add — the
      // 15-minute sweep retries, and the row shows Resend YES.
      try {
        const result = await sendConfirmation(input.phone);
        confirmation = result.outcome;
        if (result.outcome === 'failed') {
          confirmationError = result.code === TWILIO_UNSUBSCRIBED_CODE ? stoppedMessage(input.phone) : result.error;
        }
      } catch (err) {
        confirmation = 'failed';
        confirmationError = err instanceof Error ? err.message : 'Send failed.';
      }
    }

    return NextResponse.json({ success: true, id: row?.subscriber_id ?? null, phoneSaved: true, smsStatus, confirmation, confirmationError });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not add subscriber.' },
      { status: 500 }
    );
  }
}

type StoredRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone_e164: string | null;
  sms_status: SmsStatus | null;
  subscribed_at: string | null;
};

const STORED_COLUMNS = 'id, email, full_name, phone_e164, sms_status, subscribed_at';

/** Supabase errors are plain objects, not `Error`s; this keeps their message (e.g. the combine function's refusals). */
function errorText(err: unknown, fallback: string) {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' && err.message) return err.message;
  return fallback;
}

function rowView(row: StoredRow) {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    phone: row.phone_e164,
    smsStatus: row.sms_status,
    subscribedAt: row.subscribed_at,
  };
}

/**
 * Edit one newsletter row by its id (2026-11-02; was: by email, name + email
 * only, so text-only rows could not be edited).
 *
 * Body: `{ id, fullName, email?, phone?, smsConsent?, combineWithId? }`.
 * `email` / `phone` are sent only when the box was changed — absent means
 * "leave it", '' means "clear it" (a row keeps at least one of the two).
 * A NEW number needs the tick and gets the "reply YES" text, as on Add.
 *
 * If the typed email or number is already on ANOTHER row, nothing is saved:
 * the answer is 409 with that row (`combine`) and whether the two can be
 * combined. Sent again with `combineWithId`, the two rows become one through
 * `merge_homepage_subscribers` (supabase/subscriber-merge-2026-11.sql) —
 * one transaction; the number keeps its status and its text history.
 */
export async function PATCH(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
  const emailChanged = typeof body?.email === 'string';
  const phoneChanged = typeof body?.phone === 'string';
  const email = emailChanged ? normalizeEmail(body.email) : '';
  const rawPhone = phoneChanged ? String(body.phone).trim() : '';
  const phone = rawPhone ? normalizeUsPhone(rawPhone) : null;
  const combineWithId = typeof body?.combineWithId === 'string' ? body.combineWithId : null;

  if (!id) return NextResponse.json({ error: 'Which entry? Reload the page and try again.' }, { status: 400 });
  if (emailChanged && email && !isValidEmail(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }
  if (rawPhone && !phone) {
    return NextResponse.json({ error: 'A valid US mobile number is required.' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { data: row, error: rowError } = await supabase
      .from('homepage_subscribers')
      .select(STORED_COLUMNS)
      .eq('id', id)
      .maybeSingle<StoredRow>();
    if (rowError) throw rowError;
    if (!row) return NextResponse.json({ error: 'That entry no longer exists. Reload the page.' }, { status: 404 });

    if (combineWithId) {
      const { data, error: mergeError } = await supabase.rpc('merge_homepage_subscribers', {
        keep_id: row.id,
        remove_id: combineWithId,
        keep_name: fullName || null,
      });
      if (mergeError) {
        if (mergeError.code === 'PGRST202') {
          return NextResponse.json({ error: 'Combine needs one SQL file run first: supabase/subscriber-merge-2026-11.sql.' }, { status: 503 });
        }
        return NextResponse.json({ error: errorText(mergeError, 'Could not combine the two entries.') }, { status: 409 });
      }
      const merged = Array.isArray(data) ? data[0] : data;
      return NextResponse.json({
        success: true,
        combined: true,
        removedId: combineWithId,
        row: {
          id: row.id,
          name: merged?.full_name ?? null,
          email: merged?.email ?? null,
          phone: merged?.phone_e164 ?? null,
          smsStatus: merged?.sms_status ?? null,
          subscribedAt: row.subscribed_at,
        },
        confirmation: null,
        confirmationError: null,
      });
    }

    const nextEmail = emailChanged ? (email || null) : row.email;
    const nextPhone = phoneChanged ? phone : row.phone_e164;
    if (!nextEmail && !nextPhone) {
      return NextResponse.json({ error: 'Keep an email or a mobile number. To remove the entry, use Delete.' }, { status: 400 });
    }
    const newEmail = Boolean(nextEmail && nextEmail !== row.email);
    const newPhone = Boolean(nextPhone && nextPhone !== row.phone_e164);
    // Already on another row? Offer to combine instead of saving. Checked
    // before the tick: a number that is already on the list (often Confirmed)
    // keeps its own consent when the two rows are combined.
    const noRow = { data: null, error: null };
    const [emailOwner, phoneOwner] = await Promise.all([
      newEmail
        ? supabase.from('homepage_subscribers').select(STORED_COLUMNS).eq('email', nextEmail as string).neq('id', row.id).maybeSingle<StoredRow>()
        : Promise.resolve(noRow),
      newPhone
        ? supabase.from('homepage_subscribers').select(STORED_COLUMNS).eq('phone_e164', nextPhone as string).neq('id', row.id).maybeSingle<StoredRow>()
        : Promise.resolve(noRow),
    ]);
    if (emailOwner.error) throw emailOwner.error;
    if (phoneOwner.error) throw phoneOwner.error;
    if (emailOwner.data && phoneOwner.data && emailOwner.data.id !== phoneOwner.data.id) {
      return NextResponse.json({ error: 'That email and that number are on two different entries. Change one at a time.' }, { status: 409 });
    }
    const other = emailOwner.data ?? phoneOwner.data;
    if (other) {
      let reason: string | null = null;
      if (row.email && other.email) {
        reason = `Both entries have an email (${row.email} and ${other.email}). Delete or edit one first.`;
      } else if (row.phone_e164 && other.phone_e164) {
        reason = `Both entries have a mobile number (${formatUsPhone(row.phone_e164)} and ${formatUsPhone(other.phone_e164)}). Delete or edit one first.`;
      }
      return NextResponse.json({
        error: emailOwner.data ? 'That email is already on another entry.' : 'That number is already on another entry.',
        combine: rowView(other),
        field: emailOwner.data ? 'email' : 'phone',
        canCombine: reason === null,
        reason,
      }, { status: 409 });
    }

    if (newPhone && body?.smsConsent !== true) {
      return NextResponse.json({ error: `Tick "${ADMIN_SMS_CONSENT_LABEL}" to add the number.` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { full_name: fullName || null, updated_at: now };
    if (emailChanged) {
      update.email = nextEmail;
      // A row that had no email joins the email list now.
      if (newEmail && !row.email) Object.assign(update, { subscribed: true, consent_at: now, unsubscribed_at: null });
    }
    if (phoneChanged) {
      if (!nextPhone) {
        // Cleared: off the text list. The consent record stays on the row.
        Object.assign(update, { phone_e164: null, sms_status: null });
      } else if (newPhone) {
        Object.assign(update, {
          phone_e164: nextPhone,
          sms_status: 'pending',
          sms_consent_at: now,
          sms_consent_text: ADMIN_SMS_CONSENT_TEXT,
          sms_consent_version: null,
          sms_confirmed_at: null,
          sms_stopped_at: null,
          sms_confirmation_sent_at: null,
          sms_confirmation_attempted_at: null,
          sms_confirmation_attempts: 0,
        });
      }
    }

    const { data: saved, error: updateError } = await supabase
      .from('homepage_subscribers')
      .update(update)
      .eq('id', row.id)
      .select(STORED_COLUMNS)
      .single<StoredRow>();
    if (updateError) throw updateError;

    // A new number gets the "reply YES" text, exactly as on Add.
    let confirmation: ConfirmationResult['outcome'] | null = null;
    let confirmationError: string | null = null;
    if (newPhone) {
      try {
        const result = await sendConfirmation(nextPhone as string);
        confirmation = result.outcome;
        if (result.outcome === 'failed') {
          confirmationError = result.code === TWILIO_UNSUBSCRIBED_CODE ? stoppedMessage(nextPhone as string) : result.error;
        }
      } catch (err) {
        confirmation = 'failed';
        confirmationError = errorText(err, 'Send failed.');
      }
    }

    return NextResponse.json({ success: true, combined: false, row: rowView(saved), confirmation, confirmationError });
  } catch (err) {
    return NextResponse.json({ error: errorText(err, 'Could not update subscriber.') }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  // By row id since 2026-11-02; email / number still accepted.
  const id = typeof body?.id === 'string' ? body.id : '';
  const email = normalizeEmail(body?.email);
  // A text-only sign-up has no email; it is removed by its number instead.
  const phone = normalizeUsPhone(body?.phone);

  if (!id && !isValidEmail(email) && !phone) {
    return NextResponse.json({ error: 'A valid subscriber email or mobile number is required.' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const query = supabase.from('homepage_subscribers').delete();
    const { error: deleteError } = id
      ? await query.eq('id', id)
      : isValidEmail(email)
        ? await query.eq('email', email)
        : await query.eq('phone_e164', phone as string);

    if (deleteError) throw deleteError;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not delete subscriber.' },
      { status: 500 }
    );
  }
}
