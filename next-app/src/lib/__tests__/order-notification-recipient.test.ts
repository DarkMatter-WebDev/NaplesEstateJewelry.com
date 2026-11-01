import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ORDER_NOTIFICATION_EMAIL,
  ownerNotificationRecipient,
} from '@/lib/order-owner-notification';

const KEYS = ['ORDER_NOTIFICATION_EMAIL', 'ORDER_NOTIFY_EMAIL'] as const;

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
  vi.restoreAllMocks();
});

describe('order notification recipient', () => {
  it('falls back to the shared info@ address when nothing is configured', () => {
    expect(ownerNotificationRecipient()).toBe(DEFAULT_ORDER_NOTIFICATION_EMAIL);
    expect(DEFAULT_ORDER_NOTIFICATION_EMAIL).toBe('info@naplesestatejewelry.com');
  });

  // The regression this whole test file exists for: the code read
  // ORDER_NOTIFICATION_EMAIL while every environment set ORDER_NOTIFY_EMAIL, so
  // the configured address was silently ignored and the default was used.
  it('honors ORDER_NOTIFY_EMAIL — the name that was previously ignored', () => {
    process.env.ORDER_NOTIFY_EMAIL = 'owner@example.test';
    expect(ownerNotificationRecipient()).toBe('owner@example.test');
  });

  it('honors ORDER_NOTIFICATION_EMAIL', () => {
    process.env.ORDER_NOTIFICATION_EMAIL = 'alt@example.test';
    expect(ownerNotificationRecipient()).toBe('alt@example.test');
  });

  it('prefers ORDER_NOTIFICATION_EMAIL and warns when both are set and differ', () => {
    process.env.ORDER_NOTIFICATION_EMAIL = 'first@example.test';
    process.env.ORDER_NOTIFY_EMAIL = 'second@example.test';
    expect(ownerNotificationRecipient()).toBe('first@example.test');
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('does not warn when both are set to the same address', () => {
    process.env.ORDER_NOTIFICATION_EMAIL = 'same@example.test';
    process.env.ORDER_NOTIFY_EMAIL = 'same@example.test';
    expect(ownerNotificationRecipient()).toBe('same@example.test');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('ignores a whitespace-only value rather than sending to an empty address', () => {
    process.env.ORDER_NOTIFY_EMAIL = '   ';
    expect(ownerNotificationRecipient()).toBe(DEFAULT_ORDER_NOTIFICATION_EMAIL);
  });

  it('trims surrounding whitespace on a configured address', () => {
    process.env.ORDER_NOTIFY_EMAIL = '  spaced@example.test  ';
    expect(ownerNotificationRecipient()).toBe('spaced@example.test');
  });

  it('never returns an empty recipient under any combination', () => {
    for (const combo of [
      {}, { ORDER_NOTIFY_EMAIL: '' }, { ORDER_NOTIFICATION_EMAIL: '' },
      { ORDER_NOTIFY_EMAIL: '', ORDER_NOTIFICATION_EMAIL: '' },
    ]) {
      for (const k of KEYS) delete process.env[k];
      Object.assign(process.env, combo);
      expect(ownerNotificationRecipient()).toBeTruthy();
    }
  });
});
