import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bulkDeleteConfirmText, bulkDeleteLabel, selectionState, toggleAll, toggleId } from '../trash-selection';

const visible = ['a', 'b', 'c'];

describe('recycle-bin selection', () => {
  it('reports count / all / some against the VISIBLE rows only', () => {
    expect(selectionState(visible, new Set())).toMatchObject({ count: 0, all: false, some: false });
    expect(selectionState(visible, new Set(['a']))).toMatchObject({ count: 1, all: false, some: true });
    expect(selectionState(visible, new Set(['a', 'b', 'c']))).toMatchObject({ count: 3, all: true, some: false });
    // A selected row that is filtered off-screen does not count.
    expect(selectionState(visible, new Set(['a', 'zzz']))).toMatchObject({ ids: ['a'], count: 1 });
    expect(selectionState([], new Set(['a']))).toMatchObject({ count: 0, all: false, some: false });
  });

  it('toggles one id without touching the rest', () => {
    const s1 = toggleId(new Set(['a']), 'b');
    expect([...s1].sort()).toEqual(['a', 'b']);
    expect([...toggleId(s1, 'a')]).toEqual(['b']);
  });

  it('header checkbox: partial or empty → select all visible; all → clear visible; off-screen ids untouched', () => {
    expect([...toggleAll(new Set(), visible)].sort()).toEqual(['a', 'b', 'c']);
    expect([...toggleAll(new Set(['b']), visible)].sort()).toEqual(['a', 'b', 'c']);
    expect([...toggleAll(new Set(['a', 'b', 'c', 'hidden']), visible)]).toEqual(['hidden']);
  });

  it('labels and confirm text say how many, and when it is everything', () => {
    expect(bulkDeleteLabel(selectionState(visible, new Set()))).toBe('Delete Selected Forever');
    expect(bulkDeleteLabel(selectionState(visible, new Set(['a'])))).toBe('Delete 1 Forever');
    expect(bulkDeleteLabel(selectionState(visible, new Set(visible)))).toBe('Delete All 3 Forever');
    expect(bulkDeleteConfirmText(selectionState(visible, new Set(['a'])))).toBe('Permanently delete 1 order? This cannot be undone.');
    expect(bulkDeleteConfirmText(selectionState(visible, new Set(visible)))).toBe(
      'Permanently delete 3 orders — everything in the Recycle Bin that is shown? This cannot be undone.',
    );
  });
});

describe('OrdersPanel wiring', () => {
  const PANEL = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'OrdersPanel.tsx'), 'utf8');

  it('uses the shared selection helpers and deletes the selection in one query', () => {
    expect(PANEL).toContain("from '@/lib/trash-selection'");
    expect(PANEL).toContain("aria-label=\"Select all shown\"");
    expect(PANEL).toContain(".delete().in('id', trashSelection.ids)");
    // The bulk button is trash-only and always confirms first.
    expect(PANEL).toContain('window.confirm(bulkDeleteConfirmText(trashSelection))');
  });
});
