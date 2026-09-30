import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTACT_PHONE_DIGITS,
  CONTACT_PHONE_DISPLAY,
  TEL_HREF,
  directionsHref,
  sellerTextBody,
  smsHref,
} from '../contact-links';
import { mapsUrl } from '../business-location';
import { CARD_HOLDERS } from '../card-holders';

describe('contact links', () => {
  it('dials and texts the owner’s cell, in the form the rest of the site uses', () => {
    expect(CONTACT_PHONE_DIGITS).toBe('2394048505');
    expect(CONTACT_PHONE_DISPLAY).toBe('(239) 404-8505');
    expect(TEL_HREF).toBe('tel:2394048505');
    expect(smsHref()).toBe('sms:2394048505');
    // The business card texts the same person.
    expect(CARD_HOLDERS.card.phoneDigits).toBe(CONTACT_PHONE_DIGITS);
  });

  it('prefills a text with the ?&body= form both iOS and Android honour', () => {
    const href = smsHref('Hi, I have something to sell.');
    expect(href.startsWith('sms:2394048505?&body=')).toBe(true);
    expect(decodeURIComponent(href.split('body=')[1])).toBe('Hi, I have something to sell. ');
    expect(smsHref('   ')).toBe('sms:2394048505');
  });

  it('has a seller opening line in both languages', () => {
    expect(sellerTextBody(false)).toContain('sell');
    expect(sellerTextBody(true)).toContain('vender');
  });

  it('never points a customer at the toll-free text-deals number', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'contact-links.ts'), 'utf8');
    expect(source).not.toMatch(/888|4237522/);
    expect(smsHref('x')).not.toContain('888');
  });

  it('takes directions from the one address source', () => {
    expect(directionsHref()).toBe(mapsUrl());
  });
});
