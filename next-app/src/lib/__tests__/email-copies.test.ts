import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailFrameDocument, isMissingCopyColumn, logOrderEmail, rebuildPlan, saveBuyReceiptEmailCopy } from '@/lib/email-copies';

type Call = { table: string; op: string; payload: unknown };

/** A tiny stand-in for the Supabase client: records writes, answers from a script. */
function fakeClient(answers: { error: { code?: string; message: string } | null; id?: string }[]) {
  const calls: Call[] = [];
  let n = 0;
  const client = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          const answer = answers[n++] ?? { error: null, id: 'x' };
          return { select: () => ({ maybeSingle: async () => ({ data: answer.error ? null : { id: answer.id ?? 'x' }, error: answer.error }) }) };
        },
        update(payload: unknown) {
          calls.push({ table, op: 'update', payload });
          const answer = answers[n++] ?? { error: null };
          return { eq: async () => ({ error: answer.error }) };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const ROW = { order_id: 'o1', email_type: 'receipt', recipient: 'a@b.co', subject: 'S', sent_by: null, sent_by_email: null };
const BODY = { html: '<p>Hi</p>', text: 'Hi' };

describe('saving a copy with every logged email', () => {
  it('writes the copy with the history row and returns its id', async () => {
    const { client, calls } = fakeClient([{ error: null, id: 'row-1' }]);
    expect(await logOrderEmail(client, ROW, BODY)).toEqual({ error: null, id: 'row-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toMatchObject({ ...ROW, body_html: '<p>Hi</p>', body_text: 'Hi' });
  });
  it('⛔ before the SQL runs, the row is still logged — without the copy', async () => {
    const { client, calls } = fakeClient([
      { error: { code: 'PGRST204', message: "Could not find the 'body_html' column of 'order_emails' in the schema cache" } },
      { error: null, id: 'row-2' },
    ]);
    expect(await logOrderEmail(client, ROW, BODY)).toEqual({ error: null, id: 'row-2' });
    expect(calls).toHaveLength(2);
    expect(calls[1].payload).toEqual(ROW);
  });
  it('any other error is reported, not retried', async () => {
    const { client, calls } = fakeClient([{ error: { message: 'permission denied' } }]);
    expect(await logOrderEmail(client, ROW, BODY)).toEqual({ error: 'permission denied', id: null });
    expect(calls).toHaveLength(1);
  });
  it('a buy receipt copy is its own write and never throws', async () => {
    const { client, calls } = fakeClient([{ error: { code: '42703', message: 'column "emailed_html" does not exist' } }]);
    await expect(saveBuyReceiptEmailCopy(client, 'r1', BODY)).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ table: 'buy_receipts', op: 'update', payload: { emailed_html: '<p>Hi</p>', emailed_text: 'Hi' } });
  });
  it('knows the "SQL not run" errors', () => {
    expect(isMissingCopyColumn({ code: '42703', message: 'column order_emails.body_html does not exist' })).toBe(true);
    expect(isMissingCopyColumn({ message: 'column "emailed_text" does not exist' })).toBe(true);
    expect(isMissingCopyColumn({ message: 'timeout' })).toBe(false);
    expect(isMissingCopyColumn(null)).toBe(false);
  });
});

describe('older emails (no copy): what the viewer can rebuild', () => {
  it('invoices, receipts, manual updates and pickup receipts', () => {
    expect(rebuildPlan('invoice', null)).toEqual({ kind: 'invoice' });
    expect(rebuildPlan('receipt', null)).toEqual({ kind: 'invoice' });
    expect(rebuildPlan('fulfillment_update', 'shipped')).toEqual({ kind: 'fulfillment', status: 'shipped' });
    expect(rebuildPlan('fulfillment_update', 'picked_up')).toEqual({ kind: 'fulfillment', status: 'picked_up' });
    expect(rebuildPlan('pickup_receipt', 'picked_up')).toEqual({ kind: 'pickup' });
  });
  it('⛔ never the automatic delivery emails (they printed that moment\'s scan)', () => {
    for (const status of ['expected_delivery', 'out_for_delivery', 'delivered']) {
      expect(rebuildPlan('fulfillment_update', status).kind).toBe('none');
    }
    expect(rebuildPlan('something_new', null).kind).toBe('none');
  });
});

describe('the viewer frame', () => {
  it('links open in a new tab; a fragment becomes a whole document', () => {
    const doc = emailFrameDocument('<div>Hi</div>');
    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain('<div>Hi</div>');
    expect(emailFrameDocument('<html><head><title>x</title></head><body>y</body></html>')).toContain('<head><meta charset="utf-8"><base target="_blank">');
  });
  it('⛔ the frame can never run script', () => {
    const viewer = readFileSync(join(process.cwd(), 'src/components/admin/EmailCopyViewer.tsx'), 'utf8');
    const sandbox = /sandbox="([^"]*)"/.exec(viewer)?.[1] ?? '';
    expect(sandbox).not.toBe('');
    expect(sandbox).not.toContain('allow-scripts');
  });
});

describe('wiring guards', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }
  it('every Email History write keeps the copy (goes through logOrderEmail)', () => {
    const offenders = sourceFiles(join(process.cwd(), 'src'))
      .filter((path) => !path.endsWith('email-copies.ts'))
      .filter((path) => /from\('order_emails'\)\s*\.insert\(/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('the buy receipt mailer saves its copy', () => {
    expect(readFileSync(join(process.cwd(), 'src/lib/buy-receipt-mailer.ts'), 'utf8')).toContain('saveBuyReceiptEmailCopy(');
  });
  it('the order page and the buy receipt page open the viewer', () => {
    expect(readFileSync(join(process.cwd(), 'src/components/admin/OrderDetailPanel.tsx'), 'utf8')).toContain('<EmailCopyViewer');
    expect(readFileSync(join(process.cwd(), 'src/components/admin/buy-receipts/BuyReceiptDetail.tsx'), 'utf8')).toContain('<EmailCopyViewer');
  });
});
