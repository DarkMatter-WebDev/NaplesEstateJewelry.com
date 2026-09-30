import { describe, expect, it } from 'vitest';
import { parsePayPalCaptureResponse } from '@/lib/paypal';

describe('parsePayPalCaptureResponse', () => {
  it('extracts the capture status and authoritative amount', () => {
    const result = parsePayPalCaptureResponse({
      status: 'COMPLETED',
      purchase_units: [{
        payments: {
          captures: [{
            id: 'CAPTURE-123',
            status: 'COMPLETED',
            amount: { value: '835.25', currency_code: 'USD' },
          }],
        },
      }],
    });

    expect(result).toMatchObject({
      status: 'COMPLETED',
      captureId: 'CAPTURE-123',
      capturedAmount: 835.25,
      capturedCurrency: 'USD',
    });
  });

  it('preserves a pending capture instead of treating the order status as completed', () => {
    const result = parsePayPalCaptureResponse({
      status: 'COMPLETED',
      purchase_units: [{
        payments: {
          captures: [{ id: 'CAPTURE-456', status: 'PENDING' }],
        },
      }],
    });

    expect(result.status).toBe('PENDING');
    expect(result.captureId).toBe('CAPTURE-456');
  });
});
