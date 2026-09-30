import { describe, expect, it } from 'vitest';
import {
  channelWantsEmail,
  channelWantsText,
  formatUsPhone,
  normalizeUsPhone,
  parseSubscribeChannel,
  SMS_CONSENT_LINKS,
  SMS_CONSENT_TEXT,
  smsConsentText,
  smsStatusLabel,
  subscriberChannelLabel,
} from '../subscriber-phone';

describe('normalizeUsPhone', () => {
  it('accepts the ways people type a US number and stores it as +1 and ten digits', () => {
    for (const typed of ['2394048505', '239-404-8505', '(239) 404-8505', '239.404.8505', '1 239 404 8505', '+1 (239) 404-8505', '  239 404 8505 ']) {
      expect(normalizeUsPhone(typed)).toBe('+12394048505');
    }
  });

  it('rejects anything that is not a dialable US number rather than guessing', () => {
    expect(normalizeUsPhone('')).toBeNull();
    expect(normalizeUsPhone(null)).toBeNull();
    expect(normalizeUsPhone('239404850')).toBeNull(); // nine digits
    expect(normalizeUsPhone('23940485055')).toBeNull(); // eleven, not starting with 1
    expect(normalizeUsPhone('+44 20 7946 0958')).toBeNull(); // not US
    expect(normalizeUsPhone('039-404-8505')).toBeNull(); // area code cannot start with 0
    expect(normalizeUsPhone('239-104-8505')).toBeNull(); // exchange cannot start with 1
    expect(normalizeUsPhone('239-555-0148')).toBeNull(); // the fiction block
    expect(normalizeUsPhone('call me 239 404 8505')).toBeNull(); // letters
  });
});

describe('formatUsPhone', () => {
  it('prints the stored form for people and leaves anything else alone', () => {
    expect(formatUsPhone('+12394048505')).toBe('(239) 404-8505');
    expect(formatUsPhone(null)).toBe('');
    expect(formatUsPhone('+442079460958')).toBe('+442079460958');
  });
});

describe('the channel choice', () => {
  it('reads email / text / both and treats anything else as the old email-only form', () => {
    expect(parseSubscribeChannel('text')).toBe('text');
    expect(parseSubscribeChannel('both')).toBe('both');
    expect(parseSubscribeChannel('email')).toBe('email');
    expect(parseSubscribeChannel(undefined)).toBe('email');
    expect(parseSubscribeChannel('sms')).toBe('email');
  });

  it('knows which fields each choice needs', () => {
    expect(channelWantsEmail('email')).toBe(true);
    expect(channelWantsEmail('both')).toBe(true);
    expect(channelWantsEmail('text')).toBe(false);
    expect(channelWantsText('text')).toBe(true);
    expect(channelWantsText('both')).toBe(true);
    expect(channelWantsText('email')).toBe(false);
  });
});

describe('the consent statement', () => {
  // Carriers check for each of these before approving a business texting
  // number; a rewording that drops one would be refused.
  it('carries every required statement in both languages', () => {
    for (const text of [SMS_CONSENT_TEXT.en, SMS_CONSENT_TEXT.es]) {
      expect(text).toContain('Naples Estate Jewelry');
      expect(text).toMatch(/STOP/);
      expect(text).toMatch(/HELP/);
    }
    expect(SMS_CONSENT_TEXT.en).toContain('recurring automated marketing texts');
    expect(SMS_CONSENT_TEXT.en).toContain('not a condition of purchase');
    expect(SMS_CONSENT_TEXT.en).toContain('Message frequency varies');
    expect(SMS_CONSENT_TEXT.en).toContain('Msg & data rates may apply');
    expect(SMS_CONSENT_TEXT.es).toContain('automatizados y recurrentes');
    expect(SMS_CONSENT_TEXT.es).toContain('no es condición de compra');
  });

  it('ends with the two link labels the window turns into links', () => {
    expect(SMS_CONSENT_TEXT.en.endsWith(`${SMS_CONSENT_LINKS.privacy.label.en} · ${SMS_CONSENT_LINKS.terms.label.en}.`)).toBe(true);
    expect(SMS_CONSENT_TEXT.es.endsWith(`${SMS_CONSENT_LINKS.privacy.label.es} · ${SMS_CONSENT_LINKS.terms.label.es}.`)).toBe(true);
    expect(SMS_CONSENT_LINKS.terms.path).toBe('/terms#text-messages');
    expect(smsConsentText('es')).toBe(SMS_CONSENT_TEXT.es);
    expect(smsConsentText('en')).toBe(SMS_CONSENT_TEXT.en);
  });
});

describe('admin labels', () => {
  it('names the channel from what the row holds', () => {
    expect(subscriberChannelLabel({ email: 'a@b.co', phone: '+12394048505' })).toBe('Both');
    expect(subscriberChannelLabel({ email: null, phone: '+12394048505' })).toBe('Text');
    expect(subscriberChannelLabel({ email: 'a@b.co', phone: null })).toBe('Email');
  });

  it('spells out the text status', () => {
    expect(smsStatusLabel('pending')).toBe('Pending YES');
    expect(smsStatusLabel('confirmed')).toBe('Confirmed');
    expect(smsStatusLabel('stopped')).toBe('Stopped');
    expect(smsStatusLabel(null)).toBe('');
  });
});
