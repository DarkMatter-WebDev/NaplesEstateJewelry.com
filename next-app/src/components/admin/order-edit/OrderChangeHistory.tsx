import type { OrderChangeRow } from '@/lib/order-edit-server';
import { ORDER_CHANGES_SQL_FILE } from '@/lib/order-edit';
import { formatOrderDate } from '@/types/sales';

/**
 * The order page's "Change history" card (owner, 2026-11-24 (11), mockup 2):
 * every Edit order / Fix name save — who, when, each field before → after.
 * Changes made before this existed (or with the other order buttons) are not
 * listed; those keep their own records (Email History, Internal notes, …).
 */
export default function OrderChangeHistory({
  ready,
  rows,
  createdAt,
}: {
  ready: boolean;
  rows: OrderChangeRow[];
  createdAt: string;
}) {
  const muted = { color: 'var(--color-on-surface-variant)' } as const;
  return (
    <section className="border p-5" style={{ borderColor: 'var(--color-outline-variant)', background: 'white' }}>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>Change history</h2>
      {!ready && (
        <p className="mb-2 rounded px-3 py-2 text-xs" style={{ background: '#fdf1e7', color: '#8a3b12' }}>
          Edits save, but their history is not kept until <code>{ORDER_CHANGES_SQL_FILE}</code> is run in Supabase.
        </p>
      )}
      <ul className="m-0 list-none p-0">
        {rows.map((row) => (
          <li key={row.id} className="border-t py-2 text-[13px] leading-snug first:border-t-0 first:pt-0" style={{ borderColor: '#ece8de' }}>
            <span className="text-xs" style={muted}>
              {formatOrderDate(row.changed_at)} · {row.changed_by_email ?? 'admin'}{row.source === 'fix_name' ? ' · Fix name' : ''}{row.money_changed ? ' · totals changed' : ''}
            </span>
            {row.changes.map((change, index) => (
              <div key={index}>
                {change.label}:{' '}
                <s style={{ color: 'var(--color-error)' }}>{change.before}</s> →{' '}
                <span className="font-semibold" style={{ color: '#2f6b3a' }}>{change.after}</span>
              </div>
            ))}
          </li>
        ))}
        <li className="border-t py-2 text-[13px] first:border-t-0 first:pt-0" style={{ borderColor: '#ece8de' }}>
          <span className="text-xs" style={muted}>{formatOrderDate(createdAt)}</span>
          <div>Order created</div>
        </li>
      </ul>
      <p className="mt-2 text-xs" style={muted}>Shows every change made with Edit order or Fix name.</p>
    </section>
  );
}
