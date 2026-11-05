import { describe, expect, it } from 'vitest';
import {
  compactTrackingNumber,
  deliveredWhere,
  easyPostCarrier,
  formatScanPlace,
  formatScanTime,
  formatTrackingNumber,
  sameTrackingNumber,
  scanInstant,
  trackingStatusLabel,
} from '@/lib/shipment-tracking';

describe('carrier + tracking number', () => {
  it('maps what the owner types to EasyPost carrier strings', () => {
    expect(easyPostCarrier('USPS')).toBe('USPS');
    expect(easyPostCarrier('usps priority')).toBe('USPS');
    expect(easyPostCarrier('U.S. Postal Service')).toBe('USPS');
    expect(easyPostCarrier('UPS')).toBe('UPS');
    expect(easyPostCarrier('FedEx')).toBe('FedEx');
    expect(easyPostCarrier('Fed Ex')).toBe('FedEx');
    expect(easyPostCarrier('')).toBeNull();
    expect(easyPostCarrier('Pony Express')).toBeNull();
  });

  it('groups a long all-digit USPS number in fours and leaves others as typed', () => {
    expect(formatTrackingNumber('9405511206201234567890')).toBe('9405 5112 0620 1234 5678 90');
    expect(formatTrackingNumber(' 9405 5112 0620 1234 5678 90 ')).toBe('9405 5112 0620 1234 5678 90');
    expect(formatTrackingNumber('1Z999AA10123456784')).toBe('1Z999AA10123456784');
    expect(formatTrackingNumber('EZ4000000004')).toBe('EZ4000000004');
  });

  it('compares numbers ignoring spaces, dashes and case', () => {
    expect(compactTrackingNumber('9405 5112-0620')).toBe('940551120620');
    expect(sameTrackingNumber('9405 5112 0620', '940551120620')).toBe(true);
    expect(sameTrackingNumber('1z999', '1Z999')).toBe(true);
    expect(sameTrackingNumber('', '')).toBe(false);
    expect(sameTrackingNumber('123', '124')).toBe(false);
  });
});

describe('scan times — shown in the scan’s own local time', () => {
  it('reads the wall clock straight off a stamp with an offset', () => {
    expect(formatScanTime('2026-11-12T14:14:00-05:00')).toEqual({ date: 'Thu, Nov 12', time: '2:14 PM' });
    expect(formatScanTime('2026-11-12T07:42:00-08:00')).toEqual({ date: 'Thu, Nov 12', time: '7:42 AM' });
    expect(formatScanTime('2026-11-12T00:05:00-05:00')).toEqual({ date: 'Thu, Nov 12', time: '12:05 AM' });
    expect(formatScanTime('2026-11-12T12:00:00-0500')).toEqual({ date: 'Thu, Nov 12', time: '12:00 PM' });
  });

  it('converts a UTC stamp to Eastern, with daylight saving', () => {
    // November 12 is EST (UTC-5).
    expect(formatScanTime('2026-11-12T19:14:00Z')).toEqual({ date: 'Thu, Nov 12', time: '2:14 PM' });
    // July 4 is EDT (UTC-4).
    expect(formatScanTime('2026-07-04T16:30:00Z')).toEqual({ date: 'Sat, Jul 4', time: '12:30 PM' });
    // Crossing midnight back a day.
    expect(formatScanTime('2026-11-13T03:10:00Z')).toEqual({ date: 'Thu, Nov 12', time: '10:10 PM' });
  });

  it('never uses the narrow no-break space Intl puts before AM/PM', () => {
    const parts = formatScanTime('2026-11-12T14:14:00-05:00');
    expect(parts?.time).not.toMatch(/[  ]/);
  });

  it('returns null for anything unreadable', () => {
    expect(formatScanTime(null)).toBeNull();
    expect(formatScanTime('')).toBeNull();
    expect(formatScanTime('yesterday')).toBeNull();
    expect(formatScanTime('2026-13-40T99:99:00Z')).toBeNull();
  });

  it('turns a stamp into an instant, honouring the offset', () => {
    expect(scanInstant('2026-11-12T14:14:00-05:00')).toBe(Date.parse('2026-11-12T19:14:00Z'));
    expect(scanInstant('2026-11-12T19:14:00')).toBe(Date.parse('2026-11-12T19:14:00Z'));
    expect(Number.isNaN(scanInstant(null))).toBe(true);
  });
});

describe('scan place + delivered spot', () => {
  it('title-cases the carrier’s capital city names', () => {
    expect(formatScanPlace('NAPLES', 'fl', '34102')).toBe('Naples, FL 34102');
    expect(formatScanPlace('FORT MYERS', 'FL', '33901-1234')).toBe('Fort Myers, FL 33901');
    expect(formatScanPlace(null, 'FL', null)).toBe('FL');
    expect(formatScanPlace(null, null, null)).toBeNull();
  });

  it('pulls where USPS left it out of the delivered message', () => {
    expect(deliveredWhere('Delivered, Left with Individual')).toBe('Left with Individual');
    expect(deliveredWhere('Delivered, Front Door/Porch')).toBe('Front Door/Porch');
    expect(deliveredWhere('DELIVERED - In/At Mailbox')).toBe('In/At Mailbox');
    expect(deliveredWhere('Delivered')).toBeNull();
    expect(deliveredWhere('Out for Delivery')).toBeNull();
    expect(deliveredWhere(null)).toBeNull();
  });

  it('words every EasyPost status for the order page', () => {
    expect(trackingStatusLabel('in_transit')).toBe('In transit');
    expect(trackingStatusLabel('delivered')).toBe('Delivered');
    expect(trackingStatusLabel(null)).toMatch(/Waiting/);
    expect(trackingStatusLabel('something_new')).toBe('something new');
  });
});
