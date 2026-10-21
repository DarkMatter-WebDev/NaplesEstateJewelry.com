import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { remoteDraftSummary, sanitizeRemoteDraft } from '@/lib/remote-sale';

/** PUT { form }: save a remote-sale draft again · DELETE: drop it (its photos go with the next Storage clean-up). */
interface Props {
  params: Promise<{ id: string }>;
}

function validId(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export async function PUT(req: Request, { params }: Props) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: 'That draft was not found.' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const form = sanitizeRemoteDraft(body?.form);

  const { data, error } = await createServiceClient()
    .from('remote_sale_drafts')
    .update({ form, ...remoteDraftSummary(form) })
    .eq('id', id)
    .select('id, updated_at')
    .maybeSingle();
  if (error) {
    console.error('remote_sale_drafts update error:', error);
    return NextResponse.json({ error: 'Could not save the draft.' }, { status: 500 });
  }
  // Gone (sent or deleted on another device): the form keeps its typing, and the next Save draft makes a new one.
  if (!data) return NextResponse.json({ error: 'This draft is gone — it was sent or deleted. Save draft again to keep a new copy.', code: 'draft_missing' }, { status: 404 });
  return NextResponse.json({ id: data.id, updatedAt: data.updated_at });
}

export async function DELETE(_req: Request, { params }: Props) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: 'That draft was not found.' }, { status: 404 });
  const { error } = await createServiceClient().from('remote_sale_drafts').delete().eq('id', id);
  if (error) {
    console.error('remote_sale_drafts delete error:', error);
    return NextResponse.json({ error: 'Could not delete the draft.' }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
