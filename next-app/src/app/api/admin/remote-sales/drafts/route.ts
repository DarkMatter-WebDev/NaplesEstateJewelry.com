import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { remoteDraftHasContent, remoteDraftSummary, sanitizeRemoteDraft } from '@/lib/remote-sale';

/**
 * POST { form }: Instant Sale → Remote sale → "Save draft" (owner,
 * 2026-10-21). Keeps the form as typed in `remote_sale_drafts` — no order is
 * created — and returns its id; later saves go to `drafts/[id]` (PUT).
 * SQL: supabase/remote-sales-2026-10.sql, section 2.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const form = sanitizeRemoteDraft(body?.form);
  if (!remoteDraftHasContent(form)) return NextResponse.json({ error: 'Type a name, an email or an item first — there is nothing to save yet.' }, { status: 400 });

  const { data, error } = await createServiceClient()
    .from('remote_sale_drafts')
    .insert({ form, ...remoteDraftSummary(form), created_by: admin.user.id, created_by_email: admin.user.email ?? null })
    .select('id, updated_at')
    .single();
  if (error || !data) {
    console.error('remote_sale_drafts insert error:', error);
    const missing = /remote_sale_drafts/.test(error?.message ?? '') && /does not exist|schema cache/i.test(error?.message ?? '');
    return NextResponse.json(
      { error: missing ? 'Could not save the draft — run supabase/remote-sales-2026-10.sql again (it now adds the drafts table).' : 'Could not save the draft.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ id: data.id, updatedAt: data.updated_at });
}
