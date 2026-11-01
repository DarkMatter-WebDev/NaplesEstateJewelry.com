import { describe, expect, it } from 'vitest';
import {
  buildBounceNotification,
  classifyBounceEvent,
  type BounceContext,
} from '@/lib/email-bounce';

describe('bounce classification', () => {
  it('treats a permanent failure as hard', () => {
    const result = classifyBounceEvent({ bounce: { type: 'Permanent', subType: 'General' } }, false);
    expect(result.severity).toBe('hard');
    expect(result.isComplaint).toBe(false);
    expect(result.detail).toBe('Permanent / General');
  });

  it('treats a transient failure as soft', () => {
    // The case that must never suppress: the address is fine, the mailbox is
    // temporarily unable to accept mail.
    expect(classifyBounceEvent({ bounce: { type: 'Transient', subType: 'MailboxFull' } }, false).severity)
      .toBe('soft');
    expect(classifyBounceEvent({ bounce: { type: 'Transient' } }, false).severity).toBe('soft');
  });

  it('falls back to the subType when no type is reported', () => {
    expect(classifyBounceEvent({ bounce: { subType: 'NoEmail' } }, false).severity).toBe('hard');
    expect(classifyBounceEvent({ bounce: { subType: 'MailboxFull' } }, false).severity).toBe('soft');
    expect(classifyBounceEvent({ bounce: { sub_type: 'MailboxFull' } }, false).severity).toBe('soft');
  });

  it('never guesses "hard" from an unrecognised payload', () => {
    // ⛔ The load-bearing property. `unknown` must not suppress, or an
    // unfamiliar provider string silently unsubscribes a real customer.
    for (const data of [{}, { bounce: {} }, { bounce: { type: 'Undetermined' } }, { bounce: { type: 'weird' } }]) {
      expect(classifyBounceEvent(data, false).severity, JSON.stringify(data)).toBe('unknown');
    }
  });

  it('treats a complaint as hard, but flags it as a complaint', () => {
    const result = classifyBounceEvent({}, true);
    expect(result.severity).toBe('hard');
    expect(result.isComplaint).toBe(true);
  });
});

describe('bounce notification copy', () => {
  const order: BounceContext = {
    kind: 'order',
    label: 'Order NEJ-20260822-JTTPL',
    name: 'Sara Catlett',
    phone: '(918) 555-0142',
    createdAt: '2026-08-22T22:42:00Z',
  };

  it('names the customer and hands the owner a phone number to call', () => {
    const { title, body } = buildBounceNotification(
      'scatlett@ymial.com',
      { severity: 'hard', isComplaint: false, detail: 'Permanent / NoEmail' },
      [order],
    );
    expect(title).toContain('Sara Catlett');
    expect(body).toContain('Order NEJ-20260822-JTTPL');
    expect(body).toContain('(918) 555-0142');
    expect(body).toContain('Reach them by phone instead');
  });

  it('says so plainly when nothing matches the address', () => {
    const { title, body } = buildBounceNotification(
      'nobody@example.com',
      { severity: 'hard', isComplaint: false, detail: null },
      [],
    );
    expect(title).toContain('nobody@example.com');
    expect(body).toContain('No order or inquiry matches');
  });

  it('does not tell the owner to phone someone with no number on file', () => {
    const { body } = buildBounceNotification(
      'a@b.com',
      { severity: 'hard', isComplaint: false, detail: null },
      [{ ...order, phone: null }],
    );
    expect(body).toContain('No phone number on file');
    expect(body).not.toContain('Reach them by phone instead');
  });

  it('describes a complaint differently — that address still works', () => {
    const { title, body } = buildBounceNotification(
      'scatlett@ymail.com',
      { severity: 'hard', isComplaint: true, detail: 'spam complaint' },
      [order],
    );
    expect(title).toContain('Marked as spam');
    expect(body).toContain('still works');
    expect(body).not.toContain('Reach them by phone instead');
  });
});
