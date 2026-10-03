import type { ReactNode } from 'react';
import CustomerModeTabGuard from '@/components/admin/buy-receipts/CustomerModeTabGuard';

/**
 * Every account page. It adds nothing to see: its one job is the guard that
 * makes an account tab step aside when another tab of the same browser has
 * been handed to a seller (the buy receipt's customer input mode, 2026-10-03)
 * — the security and reset-password pages can change the signed-in password.
 * A visitor's own browser never carries that note, so for them this is inert.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <CustomerModeTabGuard />
    </>
  );
}
