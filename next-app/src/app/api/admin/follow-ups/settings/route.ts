import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { loadFollowUpSettings } from '@/lib/follow-ups-server';
import { FOLLOW_UPS_SQL_FILE, settingsFromRow, settingsPatchToRow } from '@/lib/follow-ups';

/** Admin → Follow-ups: Pause all, the four step switches, the delays, and edited email text. */
export async function PATCH(req: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const service = createServiceClient();
  const { ready, settings } = await loadFollowUpSettings(service);
  if (!ready) return NextResponse.json({ error: `Run ${FOLLOW_UPS_SQL_FILE} in Supabase first.` }, { status: 409 });

  const body = await req.json().catch(() => null);
  const patch = settingsPatchToRow(body, settings);
  if ('error' in patch) return NextResponse.json({ error: patch.error }, { status: 400 });

  const { data, error: saveError } = await service
    .from('follow_up_settings')
    .update({ ...patch.row, updated_at: new Date().toISOString(), updated_by_email: user.email ?? null })
    .eq('id', true)
    .select('*')
    .maybeSingle();
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
  return NextResponse.json({ settings: settingsFromRow(data as Record<string, unknown> | null) });
}
