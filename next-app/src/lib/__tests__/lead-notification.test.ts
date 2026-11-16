import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEAD_NOTIFICATION_EMAIL } from '@/lib/lead-notification';

// Owner, 2026-11-16: website leads go to info@, not the owner's personal Gmail.
// Both lead routes must use the one shared address — never a typed-in one.
const ROUTES = ['src/app/api/inquire/route.ts', 'src/app/api/contact-message/route.ts'];

describe('lead notification recipient', () => {
  it('is the monitored info@ inbox', () => {
    expect(LEAD_NOTIFICATION_EMAIL).toBe('info@naplesestatejewelry.com');
  });

  it.each(ROUTES)('%s sends the owner copy to the shared address, with no personal address typed in', (route) => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../..', route), 'utf8');
    expect(source).toContain('const OWNER_EMAIL = LEAD_NOTIFICATION_EMAIL;');
    expect(source).not.toMatch(/@(gmail|aol|yahoo|hotmail|outlook)\.com/i);
  });
});
