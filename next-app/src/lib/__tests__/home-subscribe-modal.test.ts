import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard for the homepage "Join the List" window (2026-09-15). The rules here
// are the ones a carrier's reviewer and the owner's approved mockup depend on;
// they are easy to lose in a tidy-up. Rationale: DECISIONS, "The hero sign-up
// is one button; the window offers Email, Text or Both".

const SRC = join(process.cwd(), 'src');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
const modal = read('components/home/HomeSubscribeModal.tsx');
const launcher = read('components/home/HomeSubscriberForm.tsx');
const terms = read('app/[locale]/terms/page.tsx');
const privacy = read('app/[locale]/privacy/page.tsx');
const spanishLegal = read('lib/spanish-legal-copy.ts');
const legalPage = read('components/legal/LegalPolicyPage.tsx');

describe('the hero launcher', () => {
  it('keeps the approved caption and the one button, in both languages', () => {
    expect(launcher).toContain("'Reciba nuevas piezas primero' : 'Get first look at new pieces'");
    expect(launcher).toContain("'Unirse a la lista' : 'Join the List'");
    expect(launcher).toContain('aria-haspopup="dialog"');
  });
});

describe('the window', () => {
  it('opens on Text (owner, 2026-09-15) and offers all three choices', () => {
    expect(modal).toContain("useState<SubscribeChannel>('text')");
    for (const value of ["value: 'email'", "value: 'text'", "value: 'both'"]) {
      expect(modal).toContain(value);
    }
  });

  it('describes email as monthly-ish and text as the fastest (owner, 2026-09-15)', () => {
    expect(modal).toContain("'mensual, más o menos' : 'monthly-ish'");
    expect(modal).toContain("'lo más rápido' : 'the fastest'");
    expect(modal).not.toMatch(/weekly-ish|semanal/);
  });

  it('never pre-ticks the text consent box', () => {
    // Carriers reject an opt-in that starts ticked; the visitor must tick it.
    expect(modal).toContain('useState(false)');
    expect(modal).toMatch(/type="checkbox"\s+checked=\{consent\}/);
  });

  it('uses the store wording on the checkbox (owner, 2026-09-15)', () => {
    expect(modal).toContain("'Text me the moment a good deal drops.'");
    expect(modal).toContain("'Envíeme un texto en cuanto salga una buena oferta.'");
  });

  it('shows the stored consent statement and links its two labels', () => {
    expect(modal).toContain('smsConsentText(locale)');
    expect(modal).toContain('SMS_CONSENT_LINKS.privacy.path');
    expect(modal).toContain('SMS_CONSENT_LINKS.terms.path');
  });

  it('is a dialog that closes on Escape and portals into the body', () => {
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain("event.key === 'Escape'");
    expect(modal).toContain('createPortal(content, document.body)');
  });

  it('keeps its fields at 16px on touch screens so iOS Safari does not zoom on focus', () => {
    // Owner-reported 2026-09-15 on the phone; same rule as the admin editor.
    const globals = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');
    expect(modal).toContain('className="home-subscribe-modal');
    expect(globals).toMatch(/@media \(hover: none\) \{\s*\.home-subscribe-modal :is\(input, textarea\) \{\s*font-size: 1rem;/);
  });

  it('never promises a text was already sent', () => {
    // Nothing sends until the texting batch exists; the promise is "one text
    // BEFORE any deal", which stays true after it.
    expect(modal).not.toMatch(/we just sent/i);
    expect(modal).toContain("Before any deal goes out, you'll get one text asking you to reply YES.");
  });
});

describe('the legal text the consent statement links to', () => {
  it('has a Text Message Program section on the terms page, anchored, in both languages', () => {
    expect(legalPage).toContain('id={section.id}');
    expect(terms).toContain("id: 'text-messages'");
    expect(terms).toContain("title: 'Text Message Program'");
    expect(spanishLegal).toContain("id: 'text-messages'");
    expect(spanishLegal).toContain("title: 'Programa de Mensajes de Texto'");
    for (const source of [terms, spanishLegal]) {
      expect(source).toMatch(/STOP/);
      expect(source).toMatch(/HELP/);
      expect(source).toMatch(/YES/);
    }
  });

  it('says mobile numbers are never shared for marketing (carriers check the privacy policy for this)', () => {
    expect(privacy).toContain('We do not share mobile numbers or text-message consent with third parties or affiliates for their marketing purposes.');
    expect(spanishLegal).toContain('No compartimos números de celular ni el consentimiento para mensajes de texto con terceros o afiliados para sus fines de marketing.');
    expect(terms).toContain('We do not share mobile numbers or text-message consent with third parties or affiliates for their marketing purposes.');
  });
});
