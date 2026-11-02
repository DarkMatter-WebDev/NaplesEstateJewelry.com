import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  rpc: vi.fn(),
  upsert: vi.fn(),
  maybeSingle: vi.fn(),
  sendConfirmation: vi.fn(),
}));

vi.mock('@/lib/admin-auth', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/text-alerts/confirmations', () => ({ sendConfirmation: mocks.sendConfirmation }));

import { POST } from './route';
import { ADMIN_SMS_CONSENT_TEXT } from '@/lib/subscriber-phone';

function add(body: Record<string, unknown>) {
  return POST(new Request('https://example.com/api/admin/subscribers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('POST /api/admin/subscribers (Add Subscriber)', () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset().mockResolvedValue({ error: null });
    mocks.upsert.mockReset().mockResolvedValue({ error: null });
    mocks.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockReset().mockResolvedValue({ data: [{ subscriber_id: 'id', phone_saved: true, sms_status: 'pending' }], error: null });
    mocks.sendConfirmation.mockReset().mockResolvedValue({ outcome: 'sent', sid: 'MM1' });
    mocks.createServiceClient.mockReset().mockReturnValue({
      rpc: mocks.rpc,
      from: () => ({
        upsert: mocks.upsert,
        select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
      }),
    });
  });

  it('keeps an email-only add exactly as before: no RPC, no text', async () => {
    const response = await add({ email: ' Mary@Example.com ', fullName: 'Mary' });
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'mary@example.com', full_name: 'Mary', source: 'admin_manual' }),
      { onConflict: 'email' },
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it('refuses a number without the tick, a bad number, and an empty form', async () => {
    expect((await add({ phone: '239-404-8505' })).status).toBe(400);
    expect((await add({ phone: '12345', smsConsent: true })).status).toBe(400);
    expect((await add({ fullName: 'Nobody' })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it('signs a number up through the shared RPC as pending and sends the "reply YES" text', async () => {
    const response = await add({ fullName: 'Mary', email: 'mary@example.com', phone: '(239) 404-8505', smsConsent: true });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('subscribe_homepage_v2', {
      subscriber_email: 'mary@example.com',
      subscriber_name: 'Mary',
      subscriber_locale: 'en',
      subscriber_phone: '+12394048505',
      subscriber_sms_consent: true,
      subscriber_sms_consent_text: ADMIN_SMS_CONSENT_TEXT,
      subscriber_sms_consent_version: null,
      subscriber_source: 'admin_manual',
    });
    expect(mocks.sendConfirmation).toHaveBeenCalledWith('+12394048505');
    await expect(response.json()).resolves.toEqual({
      success: true, id: 'id', phoneSaved: true, smsStatus: 'pending', confirmation: 'sent', confirmationError: null,
    });
  });

  it('allows a text-only add (no email)', async () => {
    const response = await add({ phone: '2394048505', smsConsent: true });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('subscribe_homepage_v2', expect.objectContaining({ subscriber_email: null }));
  });

  it('refuses a number that texted STOP — only the customer can undo it', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { sms_status: 'stopped' }, error: null });
    const response = await add({ phone: '2394048505', smsConsent: true });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/texted STOP.*text START/);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it('sends nothing to a number that already replied YES', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ subscriber_id: 'id', phone_saved: true, sms_status: 'confirmed' }], error: null });
    const response = await add({ phone: '2394048505', smsConsent: true });
    expect((await response.json()).smsStatus).toBe('confirmed');
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it('says so when the number belongs to another entry, and texts nobody', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ subscriber_id: 'id', phone_saved: false, sms_status: null }], error: null });
    const response = await add({ email: 'mary@example.com', phone: '2394048505', smsConsent: true });
    expect((await response.json()).phoneSaved).toBe(false);
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it('keeps the add when the text fails, and explains a Twilio STOP block', async () => {
    mocks.sendConfirmation.mockResolvedValue({ outcome: 'failed', error: 'Attempt to send to unsubscribed recipient', code: 21610 });
    const response = await add({ phone: '2394048505', smsConsent: true });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.confirmation).toBe('failed');
    expect(json.confirmationError).toMatch(/text START/);
  });
});
