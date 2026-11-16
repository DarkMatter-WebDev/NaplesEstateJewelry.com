/**
 * Where the owner's copy of every website lead goes: free evaluation /
 * sell-by-mail / submit-item / product inquiry (`/api/inquire`) and contact
 * messages + appointment requests (`/api/contact-message`).
 *
 * Owner, 2026-11-16: lead emails were reaching the owner's personal Gmail;
 * "can we change it so they come to info@naplesestatejewelry". Both routes
 * had that Gmail address typed in;
 * they now share this one address — the monitored Workspace inbox that
 * already receives order notifications (`order-owner-notification.ts`).
 * Change it here, never in a route.
 */
export const LEAD_NOTIFICATION_EMAIL = 'info@naplesestatejewelry.com';
