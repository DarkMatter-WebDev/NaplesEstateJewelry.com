import { describe, expect, it } from 'vitest';
import { extractEtsyMessage } from '../client';

// Etsy 400s arrive in two shapes; the field-validation shape is a numeric-keyed
// object of { path, type, message } entries. Before this was handled, a title/
// tag validation failure surfaced as a useless generic "Etsy request failed
// (400)." while the real reason sat unread in the sync-log detail.
describe('extractEtsyMessage', () => {
  it('reads the real numeric-keyed field-error shape (the live "& can only be used once" 400)', () => {
    const body = {
      '0': { path: '/title/0', type: 'too_many_invalid_characters', message: '& can only be use once', transformed: false },
    };
    expect(extractEtsyMessage(body)).toBe('title: & can only be use once');
  });

  it('joins multiple field errors', () => {
    const body = {
      '0': { path: '/title/0', message: 'bad title' },
      '1': { path: '/tags/2', message: 'bad tag' },
    };
    expect(extractEtsyMessage(body)).toBe('title: bad title; tags: bad tag');
  });

  it('still reads the simple { error } shape', () => {
    expect(extractEtsyMessage({ error: 'There was a problem with /sku : cannot be more than 32 characters' })).toBe(
      'There was a problem with /sku : cannot be more than 32 characters',
    );
  });

  it('reads the simple { message } shape', () => {
    expect(extractEtsyMessage({ message: 'nope' })).toBe('nope');
  });

  it('returns null for an unrecognized body or null', () => {
    expect(extractEtsyMessage({ foo: 'bar' })).toBeNull();
    expect(extractEtsyMessage(null)).toBeNull();
  });
});
