import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LEAD_PHOTO_MAX,
  capLeadPhotos,
  isOverLeadPhotoCap,
  leadPhotoCapHint,
  leadPhotoCountLabel,
  leadPhotoOverCapMessage,
} from '../lead-photo-limits';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

// 2026-09-20, owner's phone test: 11 photos from the contact page arrived as 6,
// 12 from the free-appraisal page as 10, and neither form said anything.
describe('lead photo cap: one number, said out loud', () => {
  it('is ten, keeps the FIRST ten in the order picked, and knows when it is exceeded', () => {
    expect(LEAD_PHOTO_MAX).toBe(10);
    const picked = Array.from({ length: 12 }, (_, i) => `photo-${i + 1}`);
    expect(capLeadPhotos(picked)).toEqual(picked.slice(0, 10));
    expect(capLeadPhotos(['a', 'b'])).toEqual(['a', 'b']);
    expect(isOverLeadPhotoCap(10)).toBe(false);
    expect(isOverLeadPhotoCap(11)).toBe(true);
  });

  it('states the cap before a photo is picked, in both languages', () => {
    expect(leadPhotoCapHint(false)).toBe('up to 10 photos');
    expect(leadPhotoCapHint(true)).toBe('hasta 10 fotos');
  });

  it('counts normally up to the cap and says plainly what happens past it', () => {
    expect(leadPhotoCountLabel(false, 1)).toBe('1 photo selected');
    expect(leadPhotoCountLabel(false, 10)).toBe('10 photos selected');
    expect(leadPhotoCountLabel(true, 1)).toBe('1 foto seleccionada');
    expect(leadPhotoOverCapMessage(false, 12)).toBe('You selected 12 photos. Only the first 10 will be sent.');
    expect(leadPhotoOverCapMessage(true, 12)).toBe('Seleccionó 12 fotos. Solo se enviarán las primeras 10.');
  });
});

describe('lead photo cap: wiring', () => {
  it.each([
    'src/app/api/inquire/route.ts',
    'src/app/api/contact-message/route.ts',
  ])('%s takes its cap from the shared constant, never its own number', (file) => {
    const source = read(...file.split('/'));
    expect(source).toContain("import { LEAD_PHOTO_MAX } from '@/lib/lead-photo-limits'");
    expect(source).toMatch(/const MAX_FILES = LEAD_PHOTO_MAX;/);
    expect(source).not.toMatch(/const MAX_FILES = \d/);
  });

  it.each([
    'src/components/free-evaluation/EvalForm.tsx',
    'src/components/contact/MessageUsForm.tsx',
  ])('%s states the cap and uses the shared count line', (file) => {
    const source = read(...file.split('/'));
    expect(source).toContain('leadPhotoCapHint(isEs)');
    expect(source).toContain('<LeadPhotoCount isEs={isEs} selected={photoCount}');
    // The old hand-written count lines are gone — they could not warn.
    expect(source).not.toContain('fotos seleccionadas');
  });

  it('warns in red, announced to screen readers', () => {
    const count = read('src', 'components', 'contact', 'LeadPhotoCount.tsx');
    expect(count).toContain('isOverLeadPhotoCap(selected)');
    expect(count).toContain('leadPhotoOverCapMessage(isEs, selected)');
    expect(count).toContain('role="alert"');
    expect(count).toContain("color: 'var(--color-error, #b91c1c)'");
  });

  it('the browser only shrinks the photos that will actually be sent', () => {
    const prep = read('src', 'lib', 'lead-photo-prep.ts');
    expect(prep).toContain('capLeadPhotos(input.filter(');
  });
});
