import { describe, expect, it } from 'vitest';
import {
  LOCATION_AREA_VALUES,
  PREFERRED_CONTACT_VALUES,
  formatLocation,
  inquiryPreferenceLines,
  inquirySubjectSuffix,
  isOutsideServiceArea,
  locationAreaOptions,
  locationNeedsDetail,
  parseLocationArea,
  parseLocationDetail,
  parsePreferredContact,
  preferredContactNeedsEmail,
  preferredContactOptions,
} from '@/lib/inquiry-fields';

describe('inquiry-fields — options', () => {
  it('lists the six service-area cities first, then the two catch-alls, in both languages', () => {
    const en = locationAreaOptions(false).map((o) => o.label);
    expect(en).toEqual([
      'Naples', 'Marco Island', 'Bonita Springs', 'Estero', 'Fort Myers', 'Cape Coral',
      'Elsewhere in Southwest Florida', 'Outside Southwest Florida',
    ]);
    const es = locationAreaOptions(true).map((o) => o.label);
    expect(es.slice(0, 6)).toEqual(en.slice(0, 6)); // proper nouns do not translate
    expect(es[7]).toBe('Fuera del suroeste de Florida');
    expect(locationAreaOptions(false).map((o) => o.value)).toEqual([...LOCATION_AREA_VALUES]);
  });

  it('offers exactly Call, Text and Email', () => {
    expect(preferredContactOptions(false).map((o) => o.label)).toEqual(['Call', 'Text', 'Email']);
    expect(preferredContactOptions(true).map((o) => o.label)).toEqual(['Llamada', 'Texto', 'Correo']);
    expect([...PREFERRED_CONTACT_VALUES]).toEqual(['call', 'text', 'email']);
  });
});

describe('inquiry-fields — parsing (server side)', () => {
  it('accepts only known values, case-insensitively, and never guesses', () => {
    expect(parseLocationArea('naples')).toBe('naples');
    expect(parseLocationArea(' Fort-Myers ')).toBe('fort-myers');
    expect(parseLocationArea('miami')).toBeNull();
    expect(parseLocationArea(undefined)).toBeNull();
    expect(parsePreferredContact('TEXT')).toBe('text');
    expect(parsePreferredContact('whatsapp')).toBeNull();
    expect(parsePreferredContact(null)).toBeNull();
  });

  it('keeps the free-text detail only for the two areas that ask for it', () => {
    expect(parseLocationDetail('Sarasota, FL', 'outside-swfl')).toBe('Sarasota, FL');
    expect(parseLocationDetail('Immokalee', 'swfl-other')).toBe('Immokalee');
    // A detail typed before switching back to a listed city is dropped, not stored.
    expect(parseLocationDetail('Sarasota, FL', 'naples')).toBeNull();
    expect(parseLocationDetail('   ', 'outside-swfl')).toBeNull();
    expect(parseLocationDetail('x'.repeat(500), 'outside-swfl')).toHaveLength(120);
  });

  it('only the two catch-alls reveal the detail line; only "outside" is flagged', () => {
    expect(locationNeedsDetail('swfl-other')).toBe(true);
    expect(locationNeedsDetail('outside-swfl')).toBe(true);
    expect(locationNeedsDetail('naples')).toBe(false);
    expect(isOutsideServiceArea('outside-swfl')).toBe(true);
    expect(isOutsideServiceArea('swfl-other')).toBe(false);
    expect(isOutsideServiceArea(null)).toBe(false);
  });

  it('Email as the preference without an email address is a fixable mistake, not a valid submission', () => {
    expect(preferredContactNeedsEmail('email', '')).toBe(true);
    expect(preferredContactNeedsEmail('email', '  ')).toBe(true);
    expect(preferredContactNeedsEmail('email', 'a@b.co')).toBe(false);
    expect(preferredContactNeedsEmail('text', '')).toBe(false);
    expect(preferredContactNeedsEmail(null, '')).toBe(false);
  });
});

describe('inquiry-fields — display strings', () => {
  it('formats a location with and without detail, and nothing for older rows', () => {
    expect(formatLocation('naples', null)).toBe('Naples');
    expect(formatLocation('outside-swfl', 'Sarasota, FL')).toBe('Outside Southwest Florida — Sarasota, FL');
    expect(formatLocation('outside-swfl', 'Sarasota, FL', true)).toBe('Fuera del suroeste de Florida — Sarasota, FL');
    expect(formatLocation(null, 'ignored')).toBeNull();
  });

  it('builds the message-center lines and the subject suffix from whatever was recorded', () => {
    expect(inquiryPreferenceLines('naples', null, 'text')).toEqual(['Location: Naples', 'Preferred contact: Text']);
    expect(inquiryPreferenceLines(null, null, 'call')).toEqual(['Preferred contact: Call']);
    expect(inquiryPreferenceLines(null, null, null)).toEqual([]);
    expect(inquirySubjectSuffix('naples', null, 'text')).toBe(' · prefers Text · Naples');
    expect(inquirySubjectSuffix(null, null, null)).toBe('');
  });
});
