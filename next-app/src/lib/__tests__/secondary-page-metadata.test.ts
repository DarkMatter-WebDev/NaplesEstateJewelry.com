import { describe, expect, it } from 'vitest';
import { getSecondaryPageMetadata } from '@/lib/secondary-page-metadata';

describe('secondary customer page metadata', () => {
  it.each(['unsubscribe'] as const)('uses one localized title template for %s', (page) => {
    const en = getSecondaryPageMetadata(page, 'en');
    const es = getSecondaryPageMetadata(page, 'es');
    expect(en.title).not.toContain('Naples Estate Jewelry');
    expect(es.title).not.toContain('Naples Estate Jewelry');
    expect(es.title).not.toBe(en.title);
    expect(es.alternates?.canonical).toBe(`/es/${page}`);
  });
});
