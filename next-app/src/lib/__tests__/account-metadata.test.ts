import { describe, expect, it } from 'vitest';
import { getAccountMetadata } from '@/lib/account-metadata';

describe('account metadata', () => {
  it('provides route-specific English account titles', () => {
    expect(getAccountMetadata('sign-in', 'en').title).toBe('Sign In');
    expect(getAccountMetadata('sign-up', 'en').title).toBe('Create Account');
    expect(getAccountMetadata('reset-password', 'en').title).toBe('Reset Password');
  });

  it('provides localized Spanish account titles and canonical paths', () => {
    const metadata = getAccountMetadata('sign-in', 'es');
    expect(metadata.title).toBe('Iniciar Sesión');
    expect(metadata.alternates?.canonical).toBe('/es/account/sign-in');
  });
});
