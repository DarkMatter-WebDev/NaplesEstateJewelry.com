import { beforeEach, describe, expect, it, vi } from 'vitest';

// Edit + Combine on Admin → Subscribers (PATCH, 2026-11-02), against a small
// in-memory stand-in for `homepage_subscribers`.
type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone_e164: string | null;
  sms_status: string | null;
  subscribed_at: string | null;
  [key: string]: unknown;
};

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  rpc: vi.fn(),
  sendConfirmation: vi.fn(),
}));

vi.mock('@/lib/admin-auth', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/text-alerts/confirmations', () => ({ sendConfirmation: mocks.sendConfirmation }));

import { PATCH } from './route';
import { ADMIN_SMS_CONSENT_TEXT } from '@/lib/subscriber-phone';

let table: Row[] = [];
let lastUpdate: Record<string, unknown> | null = null;

function fakeClient() {
  return {
    rpc: mocks.rpc,
    from: () => {
      const filters: Array<(row: Row) => boolean> = [];
      let patch: Record<string, unknown> | null = null;
      const builder = {
        select: () => builder,
        update: (values: Record<string, unknown>) => {
          patch = values;
          lastUpdate = values;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return builder;
        },
        neq: (column: string, value: unknown) => {
          filters.push((row) => row[column] !== value);
          return builder;
        },
        maybeSingle: async () => ({ data: table.find((row) => filters.every((f) => f(row))) ?? null, error: null }),
        single: async () => {
          const row = table.find((r) => filters.every((f) => f(r)));
          if (row && patch) Object.assign(row, patch);
          return { data: row ?? null, error: row ? null : { message: 'not found' } };
        },
      };
      return builder;
    },
  };
}

function edit(body: Record<string, unknown>) {
  return PATCH(new Request('https://example.com/api/admin/subscribers', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

const EMAIL_ROW: Row = { id: 'a', email: 'linda@example.com', full_name: 'Linda Marsh', phone_e164: null, sms_status: null, subscribed_at: '2026-09-20T12:00:00Z' };
const TEXT_ROW: Row = { id: 'b', email: null, full_name: 'Linda', phone_e164: '+12394041234', sms_status: 'confirmed', subscribed_at: '2026-10-03T12:00:00Z' };

describe('PATCH /api/admin/subscribers (Edit + Combine)', () => {
  beforeEach(() => {
    table = [{ ...EMAIL_ROW }, { ...TEXT_ROW }];
    lastUpdate = null;
    mocks.requireAdmin.mockReset().mockResolvedValue({ error: null });
    mocks.createServiceClient.mockReset().mockImplementation(fakeClient);
    mocks.rpc.mockReset();
    mocks.sendConfirmation.mockReset().mockResolvedValue({ outcome: 'sent', sid: 'MM1' });
  });

  it('edits the name only, leaving email and number alone when they were not sent', async () => {
    const response = await edit({ id: 'b', fullName: 'Linda M.' });
    expect(response.status).toBe(200);
    expect(lastUpdate).toEqual(expect.objectContaining({ full_name: 'Linda M.' }));
    expect(lastUpdate).not.toHaveProperty('email');
    expect(lastUpdate).not.toHaveProperty('phone_e164');
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it('adds a NEW number to an email-only row only with the tick, as pending, and sends the YES text', async () => {
    expect((await edit({ id: 'a', fullName: 'Linda Marsh', phone: '239-404-9999' })).status).toBe(400);

    const response = await edit({ id: 'a', fullName: 'Linda Marsh', phone: '239-404-9999', smsConsent: true });
    expect(response.status).toBe(200);
    expect(lastUpdate).toEqual(expect.objectContaining({
      phone_e164: '+12394049999',
      sms_status: 'pending',
      sms_consent_text: ADMIN_SMS_CONSENT_TEXT,
      sms_confirmation_attempts: 0,
    }));
    expect(mocks.sendConfirmation).toHaveBeenCalledWith('+12394049999');
    expect((await response.json()).confirmation).toBe('sent');
  });

  it('adds an email to a text-only row and puts it on the email list', async () => {
    const response = await edit({ id: 'b', fullName: 'Linda', email: 'new@example.com' });
    expect(response.status).toBe(200);
    expect(lastUpdate).toEqual(expect.objectContaining({ email: 'new@example.com', subscribed: true, unsubscribed_at: null }));
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it('offers Combine when the typed number is on another entry — email row → text row', async () => {
    // No tick needed to be offered a combine: the number keeps its own consent.
    const response = await edit({ id: 'a', fullName: 'Linda Marsh', phone: '(239) 404-1234' });
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json).toEqual(expect.objectContaining({ field: 'phone', canCombine: true, reason: null }));
    expect(json.combine).toEqual(expect.objectContaining({ id: 'b', phone: '+12394041234', smsStatus: 'confirmed' }));
    expect(lastUpdate).toBeNull();
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it('offers Combine the other way too — text row → typed email of the email row', async () => {
    const response = await edit({ id: 'b', fullName: 'Linda', email: 'Linda@Example.com' });
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json).toEqual(expect.objectContaining({ field: 'email', canCombine: true }));
    expect(json.combine.id).toBe('a');
  });

  it('refuses to combine two entries that both have a number', async () => {
    table.push({ id: 'c', email: 'other@example.com', full_name: null, phone_e164: '+12394045555', sms_status: 'pending', subscribed_at: null });
    const response = await edit({ id: 'c', fullName: '', phone: '2394041234', smsConsent: true });
    const json = await response.json();
    expect(json.canCombine).toBe(false);
    expect(json.reason).toMatch(/Both entries have a mobile number/);
  });

  it('combines through the one-transaction function, keeping the edited row and its name', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ subscriber_id: 'a', email: 'linda@example.com', phone_e164: '+12394041234', sms_status: 'confirmed', full_name: 'Linda Marsh' }],
      error: null,
    });
    const response = await edit({ id: 'a', fullName: 'Linda Marsh', phone: '2394041234', smsConsent: true, combineWithId: 'b' });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('merge_homepage_subscribers', { keep_id: 'a', remove_id: 'b', keep_name: 'Linda Marsh' });
    const json = await response.json();
    expect(json).toEqual(expect.objectContaining({ combined: true, removedId: 'b' }));
    expect(json.row).toEqual(expect.objectContaining({ id: 'a', phone: '+12394041234', smsStatus: 'confirmed' }));
    // A confirmed number moved over — no new "reply YES".
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it('says to run the SQL when the combine function is missing', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    const response = await edit({ id: 'a', fullName: '', combineWithId: 'b' });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/subscriber-merge-2026-11\.sql/);
  });

  it('passes the function’s own refusal through', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Both entries have an email, so they cannot be combined.' } });
    const response = await edit({ id: 'a', fullName: '', combineWithId: 'b' });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('Both entries have an email, so they cannot be combined.');
  });

  it('clears a number (off the text list) but never both fields', async () => {
    const cleared = await edit({ id: 'b', fullName: 'Linda', email: 'linda2@example.com', phone: '' });
    expect(cleared.status).toBe(200);
    expect(lastUpdate).toEqual(expect.objectContaining({ phone_e164: null, sms_status: null }));

    const neither = await edit({ id: 'a', fullName: '', email: '' });
    expect(neither.status).toBe(400);
  });
});
