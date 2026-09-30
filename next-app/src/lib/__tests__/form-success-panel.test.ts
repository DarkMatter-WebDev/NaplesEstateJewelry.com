import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LeadSendError, leadSendErrorMessage } from '../lead-form-errors';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

// Owner, 2026-09-20 (phone test): after sending either form the confirmation
// sat ABOVE the screen, the badge said "OK", and the form could not be used
// again. Owner-approved mockup option B + the "need us sooner" line.
describe('form success panel', () => {
  const panel = read('src', 'components', 'contact', 'FormSuccessPanel.tsx');

  it('brings itself into view and is announced', () => {
    // Instant jump + one re-check after the phone keyboard closes. ⛔ Not
    // `smooth`: it needs animation frames and the closing keyboard cancels it.
    expect(panel).toContain("scrollIntoView({ block: 'center', behavior: 'auto' })");
    expect(panel).not.toContain("'smooth'");
    expect(panel).not.toContain('requestAnimationFrame');
    expect(panel).toContain('rect.top < 0 || rect.bottom > window.innerHeight');
    expect(panel).toContain('role="status"');
    expect(panel).toContain('focus({ preventScroll: true })');
  });

  it('says Success with a check mark, never the old OK badge', () => {
    expect(panel).toContain("isEs ? '¡Listo!' : 'Success!'");
    expect(panel).toContain('<AppIcon name="check" />');
    expect(panel).toContain("'Submission received'");
    expect(panel).toContain("'Message sent'");
  });

  it('offers another submission and a faster route, with the shared number', () => {
    expect(panel).toContain("isEs ? 'Enviar otro' : 'Send another'");
    expect(panel).toContain('type="button"');
    expect(panel).toContain("'Need us sooner? '");
    expect(panel).toContain('href={TEL_HREF}');
    expect(panel).toContain('href={smsHref()}');
    expect(panel).not.toMatch(/tel:\d|sms:\d|888/);
  });

  it.each([
    ['src/components/free-evaluation/EvalForm.tsx', 'submission'],
    ['src/components/contact/MessageUsForm.tsx', 'message'],
    ['src/components/contact/InquiryForm.tsx', 'message'],
  ])('%s uses the shared panel and can be sent again', (file, kind) => {
    const source = read(...file.split('/'));
    expect(source).toContain('<FormSuccessPanel');
    expect(source).toContain(`kind="${kind}"`);
    expect(source).toContain('onSendAnother={sendAnother}');
    expect(source).toMatch(/function sendAnother\(\) \{\s*setDone\(false\);/);
    expect(source).toContain('scrollToFormStart(');
    // Landing spot clears the sticky header.
    expect(source).toContain('scroll-mt-28');
    // The hand-written badge is gone.
    expect(source).not.toMatch(/>\s*OK\s*</);
  });

  it('a fresh form starts clean: photo count and errors are cleared', () => {
    for (const file of ['src/components/free-evaluation/EvalForm.tsx', 'src/components/contact/MessageUsForm.tsx']) {
      const source = read(...file.split('/'));
      const body = source.slice(source.indexOf('function sendAnother()'), source.indexOf('async function handleSubmit'));
      expect(body).toContain('setPhotoCount(0)');
      expect(body).toContain("setErr('')");
    }
    const inquiry = read('src', 'components', 'contact', 'InquiryForm.tsx');
    const body = inquiry.slice(inquiry.indexOf('function sendAnother()'), inquiry.indexOf('async function handleSubmit'));
    for (const reset of ["setName('')", "setPhone('')", "setEmail('')", "setPreferredContact('')", 'setMessage(defaultMessage)']) {
      expect(body).toContain(reset);
    }
  });

  it('at the rate limit the form says so and offers the phone, not "try again"', () => {
    const fallback = 'Failed to send. Please try again.';
    expect(leadSendErrorMessage(new LeadSendError(429), false, fallback)).toBe(
      "You've sent several in a short time. Please wait a few minutes, or call or text (239) 404-8505.",
    );
    expect(leadSendErrorMessage(new LeadSendError(429), true, fallback)).toContain('(239) 404-8505');
    expect(leadSendErrorMessage(new LeadSendError(500), false, fallback)).toBe(fallback);
    expect(leadSendErrorMessage(new TypeError('network'), false, fallback)).toBe(fallback);
    for (const file of [
      'src/components/free-evaluation/EvalForm.tsx',
      'src/components/contact/MessageUsForm.tsx',
      'src/components/contact/InquiryForm.tsx',
    ]) {
      const source = read(...file.split('/'));
      expect(source).toContain('throw new LeadSendError(res.status)');
      expect(source).toContain('leadSendErrorMessage(error, isEs,');
    }
  });
});
