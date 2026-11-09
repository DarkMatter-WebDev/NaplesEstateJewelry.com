import { describe, expect, it } from 'vitest';
import { cleanAppointmentNote, parseMessageBody, telHref } from '@/lib/admin-message-body';

describe('parseMessageBody', () => {
  it('splits an inquiry body (message, blank, labelled lines) like the owner email', () => {
    const body = [
      'My mother left me a jewelry box.',
      'Can I bring it Thursday?',
      '',
      'Phone: (239) 555-0148',
      'Location: Naples — Pelican Bay',
      'Preferred contact: Text',
      'Source: Google ad — gclid abc123',
    ].join('\n');
    const parsed = parseMessageBody(body);
    expect(parsed.fields).toEqual({
      phone: '(239) 555-0148',
      location: 'Naples — Pelican Bay',
      preferredContact: 'Text',
      source: 'Google ad — gclid abc123',
    });
    expect(parsed.text).toBe('My mother left me a jewelry box.\nCan I bring it Thursday?');
    expect(parsed.photoUrls).toEqual([]);
  });

  it('keeps blank lines INSIDE the customer message', () => {
    const parsed = parseMessageBody('First paragraph.\n\nSecond paragraph.\n\nPhone: (239) 555-0100');
    expect(parsed.text).toBe('First paragraph.\n\nSecond paragraph.');
    expect(parsed.fields.phone).toBe('(239) 555-0100');
  });

  it('lifts the leading appointment block (with note) from a contact message', () => {
    const body = [
      'Appointment requested: Tuesday, November 10, 2026 at 11:00 AM (not confirmed — call or text to confirm)',
      'Note: Sunday is closed.',
      '',
      'Sterling flatware, service for 12.',
      '',
      'Phone: (239) 555-0172',
      'Location: Marco Island',
      'Preferred contact: Phone call',
    ].join('\n');
    const parsed = parseMessageBody(body);
    expect(parsed.fields.appointment).toBe('Tuesday, November 10, 2026 at 11:00 AM (not confirmed — call or text to confirm)');
    expect(parsed.fields.appointmentNote).toBe('Sunday is closed.');
    expect(parsed.fields.location).toBe('Marco Island');
    expect(parsed.text).toBe('Sterling flatware, service for 12.');
  });

  it('handles an appointment with no message text', () => {
    const parsed = parseMessageBody('Appointment requested: Mon, Nov 9 at 10:00 AM\n\nPhone: (239) 555-0101');
    expect(parsed.fields.appointment).toBe('Mon, Nov 9 at 10:00 AM');
    expect(parsed.fields.phone).toBe('(239) 555-0101');
    expect(parsed.text).toBe('');
  });

  it('leaves a customer\'s own "Note:" / "Phone:" lines inside their message', () => {
    const body = 'Note: the ring is cracked.\nPhone: call after 5\nThanks\n\nPhone: (239) 555-0199';
    const parsed = parseMessageBody(body);
    expect(parsed.fields).toEqual({ phone: '(239) 555-0199' });
    expect(parsed.text).toBe('Note: the ring is cracked.\nPhone: call after 5\nThanks');
  });

  it('does not lift a last paragraph that mixes labels with other text', () => {
    const body = 'Hello\n\nPhone: (239) 555-0199\nPlease call soon';
    const parsed = parseMessageBody(body);
    expect(parsed.fields).toEqual({});
    expect(parsed.text).toBe(body);
  });

  it('leaves order and bounce notices as text (no known labels)', () => {
    const bounce = [
      'Email to a@example.com permanently failed.',
      'Reason reported: mailbox full.',
      '',
      'Related records:',
      '- Inquiry — Ann — (239) 555-0111',
      '',
      'Reach them by phone instead: (239) 555-0111',
    ].join('\n');
    expect(parseMessageBody(bounce)).toEqual({ fields: {}, text: bounce, photoUrls: [] });

    const order = "Order NEJ-1 captured payment, but its item(s) were already sold. PayPal capture: 8XK.";
    expect(parseMessageBody(order)).toEqual({ fields: {}, text: order, photoUrls: [] });
  });

  it('recovers photo URLs from the legacy "Photos:" fallback block', () => {
    const body = [
      'Old gold chain.',
      '',
      'Phone: (239) 555-0123',
      '',
      'Photos:',
      'https://example.supabase.co/storage/v1/object/public/a.webp',
      'https://example.supabase.co/storage/v1/object/public/b.webp',
    ].join('\n');
    const parsed = parseMessageBody(body);
    expect(parsed.photoUrls).toHaveLength(2);
    expect(parsed.fields.phone).toBe('(239) 555-0123');
    expect(parsed.text).toBe('Old gold chain.');
  });

  it('copes with null, empty and CRLF bodies', () => {
    expect(parseMessageBody(null)).toEqual({ fields: {}, text: '', photoUrls: [] });
    expect(parseMessageBody('')).toEqual({ fields: {}, text: '', photoUrls: [] });
    const parsed = parseMessageBody('Hi there\r\n\r\nPhone: (239) 555-0100\r\n');
    expect(parsed.text).toBe('Hi there');
    expect(parsed.fields.phone).toBe('(239) 555-0100');
  });
});

describe('telHref / cleanAppointmentNote', () => {
  it('builds a dialable tel: link', () => {
    expect(telHref('(239) 555-0148')).toBe('tel:2395550148');
    expect(telHref('+1 239-555-0148')).toBe('tel:+12395550148');
    expect(telHref('n/a')).toBeNull();
  });
  it('drops the stored trailing full stop from the note', () => {
    expect(cleanAppointmentNote('Sunday is closed.')).toBe('Sunday is closed');
  });
});
